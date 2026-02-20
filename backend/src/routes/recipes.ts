import { Router, Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { query, queryOne } from "../db";
import { rowToRecipe } from "../helpers";
import { validateRecipe } from "../validation";
import { extractIngredientsForRecipe, extractImageFromUrl } from "../services/ingredientExtractor";
import { createWithRetry, RateLimitError } from "../services/claudeRetry";
import { isValidHttpUrl, isPaywalledDomain, validateRecipeUrl } from "../services/urlValidator";
import { aiMatchRecipes } from "../services/aiRecipeMatcher";
import { searchSpoonacular } from "../services/spoonacular";
import { requireAuth, optionalAuth } from "../middleware/auth";
import { verifyFamilyAccess } from "../middleware/auth";
import type { RecipeInput } from "../../../shared/types";
import { VALID_CUISINES, VALID_DIFFICULTIES } from "../../../shared/types";

const router = Router();

// GET /api/recipes — return seed recipes + household recipes
router.get("/", optionalAuth, async (req: Request, res: Response) => {
  let rows;
  if (req.householdId) {
    rows = await query(
      "SELECT * FROM recipes WHERE is_seed = TRUE OR household_id = $1 ORDER BY name",
      [req.householdId],
    );
  } else {
    rows = await query("SELECT * FROM recipes WHERE is_seed = TRUE ORDER BY name");
  }
  res.json(rows.map(rowToRecipe));
});

// Helper: build source constraint from family favorites
async function buildSourceConstraint(familyId: number): Promise<string> {
  const chefs = await query<{ name: string }>("SELECT name FROM family_favorite_chefs WHERE family_id = $1", [familyId]);
  const websites = await query<{ name: string }>("SELECT name FROM family_favorite_websites WHERE family_id = $1", [familyId]);

  if (chefs.length === 0 && websites.length === 0) return "";

  const parts: string[] = [];
  if (chefs.length > 0) {
    parts.push(`PREFER recipes by these chefs/authors: ${chefs.map(c => c.name).join(", ")}.`);
  }
  if (websites.length > 0) {
    parts.push(`PREFER recipes from these websites: ${websites.map(w => w.name).join(", ")}.`);
  }
  parts.push("Search these sources first. Only use other sources if you cannot find good matches from the preferred sources.");
  return "\n\n" + parts.join("\n");
}

// POST /api/recipes/search — web search for recipes (Spoonacular tier 2, Claude tier 3)
router.post("/search", optionalAuth, async (req: Request, res: Response) => {
  const { query: searchQuery, family_id, skip_spoonacular } = req.body;
  if (!searchQuery || typeof searchQuery !== "string" || !searchQuery.trim()) {
    return res.status(400).json({ error: "query is required" });
  }

  const sourceConstraint = family_id ? await buildSourceConstraint(family_id) : "";
  const hasSourcePreferences = sourceConstraint.length > 0;

  // Tier 2: Try Spoonacular first (if no source preferences and not explicitly skipped)
  if (!hasSourcePreferences && !skip_spoonacular) {
    try {
      const spoonResults = await searchSpoonacular(searchQuery.trim());
      if (spoonResults.length >= 3) {
        console.log(`[search] Spoonacular returned ${spoonResults.length} results for "${searchQuery.trim()}"`);
        return res.json({ results: spoonResults });
      }
      if (spoonResults.length > 0) {
        console.log(`[search] Spoonacular returned only ${spoonResults.length} results for "${searchQuery.trim()}", falling through to Claude`);
      }
    } catch (err: any) {
      console.error("[search] Spoonacular error, falling through to Claude:", err.message || err);
    }
  }

  // Tier 3: Claude web search
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  const client = new Anthropic({ apiKey });

  try {
    const message = await createWithRetry(client, {
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      tools: [
        { type: "web_search_20250305", name: "web_search", max_uses: 5 } as any,
      ],
      system: `You are a recipe search assistant. When the user asks for a recipe, use web search to find real recipes online. Then return a JSON array of 3-5 results.

Each result must have this exact structure:
{
  "name": "Recipe Title",
  "source_name": "Website Name (e.g. Food Network, Bon Appetit)",
  "source_url": "https://full-url-to-recipe",
  "cook_minutes": 45,
  "cuisine": "american",
  "vegetarian": false,
  "protein_type": "chicken",
  "difficulty": "medium",
  "kid_friendly": true,
  "description": "Brief 1-2 sentence description of the dish"
}

Constraints:
- cuisine must be one of: ${VALID_CUISINES.join(", ")}
- difficulty must be one of: ${VALID_DIFFICULTIES.join(", ")}
- protein_type should be null for vegetarian dishes
- cook_minutes should be total time (prep + cook)

YOU MUST RETURN ONLY JSON. DO NOT INCLUDE ANY TEXT BEFORE OR AFTER THE JSON.
NO EXPLANATIONS. NO PREAMBLES. NO MARKDOWN.
YOUR ENTIRE RESPONSE MUST BE PARSEABLE JSON STARTING WITH [ AND ENDING WITH ].` + sourceConstraint,
      messages: [
        { role: "user", content: `Search for recipes: "${searchQuery.trim()}"` },
      ],
    });

    // Web search produces multiple content block types; take the last text block
    let lastText = "";
    for (const block of message.content) {
      if (block.type === "text") {
        lastText = block.text;
      }
    }

    if (!lastText) {
      return res.status(500).json({ error: "Sorry Chef, that search didn't work out! Give it another try or tweak your search terms." });
    }

    // Strip markdown fences if present
    let cleaned = lastText
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "")
      .trim();

    // Extract JSON array between first [ and last ]
    const firstBracket = cleaned.indexOf("[");
    const lastBracket = cleaned.lastIndexOf("]");
    if (firstBracket === -1 || lastBracket === -1 || lastBracket <= firstBracket) {
      console.error("Recipe search: no JSON array found in response:", cleaned.slice(0, 200));
      return res.status(500).json({ error: "Sorry Chef, that search didn't work out! Give it another try or tweak your search terms." });
    }
    cleaned = cleaned.slice(firstBracket, lastBracket + 1);

    const results = JSON.parse(cleaned);

    // Validate structure: must be an array of objects with at least a name field
    if (!Array.isArray(results) || results.length === 0 || !results[0].name) {
      console.error("Recipe search: unexpected response structure:", JSON.stringify(results).slice(0, 200));
      return res.status(500).json({ error: "Sorry Chef, that search didn't work out! Give it another try or tweak your search terms." });
    }

    // Tag paywalled results and mark source as Claude
    const taggedResults = results.map((r: any) => ({
      ...r,
      is_paywalled: r.source_url ? isPaywalledDomain(r.source_url) : false,
      source: "claude" as const,
    }));

    res.json({ results: taggedResults });
  } catch (error: any) {
    console.error("Recipe search error:", error);
    if (error instanceof RateLimitError) {
      return res.status(429).json({ error: error.message });
    }
    if (error instanceof SyntaxError) {
      return res.status(500).json({ error: "Sorry Chef, that search didn't work out! Give it another try or tweak your search terms." });
    }
    res.status(500).json({ error: "Sorry Chef, that search didn't work out! Give it another try or tweak your search terms." });
  }
});

// POST /api/recipes/batch-search — batch web search (Spoonacular + Claude fallback)
router.post("/batch-search", optionalAuth, async (req: Request, res: Response) => {
  const { queries, family_id } = req.body;
  if (!Array.isArray(queries) || queries.length === 0 || queries.some((q: any) => typeof q !== "string" || !q.trim())) {
    return res.status(400).json({ error: "queries must be a non-empty array of strings" });
  }

  const cappedQueries = queries.slice(0, 5) as string[];
  const sourceConstraint = family_id ? await buildSourceConstraint(family_id) : "";
  const hasSourcePreferences = sourceConstraint.length > 0;

  // Tier 2: Try Spoonacular for each query in parallel (if no source preferences)
  const spoonResults: Record<string, any[]> = {};
  const remainingQueries: string[] = [];

  if (!hasSourcePreferences) {
    const spoonPromises = cappedQueries.map(async (q) => {
      const trimmed = q.trim();
      try {
        const results = await searchSpoonacular(trimmed);
        return { query: trimmed, results };
      } catch {
        return { query: trimmed, results: [] };
      }
    });

    const spoonResponses = await Promise.all(spoonPromises);
    for (const { query: q, results } of spoonResponses) {
      if (results.length >= 3) {
        spoonResults[q] = results;
        console.log(`[batch-search] Spoonacular satisfied "${q}" with ${results.length} results`);
      } else {
        remainingQueries.push(q);
        if (results.length > 0) {
          console.log(`[batch-search] Spoonacular returned only ${results.length} results for "${q}", falling through to Claude`);
        }
      }
    }
  } else {
    remainingQueries.push(...cappedQueries.map((q) => q.trim()));
  }

  // If all queries satisfied by Spoonacular, return immediately
  if (remainingQueries.length === 0) {
    console.log(`[batch-search] All ${cappedQueries.length} queries satisfied by Spoonacular`);
    return res.json({ results: spoonResults });
  }

  // Tier 3: Claude web search for remaining queries
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Return whatever Spoonacular got if Claude is unavailable
    if (Object.keys(spoonResults).length > 0) {
      return res.json({ results: spoonResults });
    }
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  const client = new Anthropic({ apiKey });

  try {
    console.log(`[batch-search] Sending ${remainingQueries.length} remaining queries to Claude (${Object.keys(spoonResults).length} already satisfied by Spoonacular)`);

    const message = await createWithRetry(client, {
      model: "claude-sonnet-4-5-20250929",
      max_tokens: Math.min(1500 * remainingQueries.length, 6000),
      tools: [
        { type: "web_search_20250305", name: "web_search", max_uses: Math.min(2 * remainingQueries.length, 10) } as any,
      ],
      system: `Search the web for each recipe query. Return a JSON object: keys are the EXACT original query strings, values are arrays of 3-5 results. Each result: { "name": string, "source_name": string, "source_url": string, "cook_minutes": number, "cuisine": string, "vegetarian": boolean, "protein_type": string|null, "difficulty": string, "kid_friendly": boolean, "description": string (1 sentence max) }. cuisine: one of ${VALID_CUISINES.join(", ")}. difficulty: one of ${VALID_DIFFICULTIES.join(", ")}. protein_type: null if vegetarian.

YOU MUST RETURN ONLY JSON. DO NOT INCLUDE ANY TEXT BEFORE OR AFTER THE JSON.
NO EXPLANATIONS. NO PREAMBLES. NO MARKDOWN.
Do not write "Based on" or "Here are" or any other text.
YOUR ENTIRE RESPONSE MUST BE PARSEABLE JSON STARTING WITH { AND ENDING WITH }.` + sourceConstraint,
      messages: [
        {
          role: "user",
          content: `Search for recipes for each of these:\n${remainingQueries.map((q: string, i: number) => `${i + 1}. "${q}"`).join("\n")}`,
        },
      ],
    });

    // Web search produces multiple content block types; take the last text block
    let lastText = "";
    for (const block of message.content) {
      if (block.type === "text") {
        lastText = block.text;
      }
    }

    if (!lastText) {
      // Return Spoonacular results even if Claude fails
      if (Object.keys(spoonResults).length > 0) {
        return res.json({ results: spoonResults });
      }
      return res.status(500).json({ error: "Sorry Chef, that search didn't work out! Give it another try or tweak your search terms." });
    }

    // Strip markdown fences if present, then extract JSON object
    let cleaned = lastText
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "")
      .trim();

    // Extract JSON object between first { and last }
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      console.error("Batch search: no JSON object found in response:", cleaned.slice(0, 200));
      if (Object.keys(spoonResults).length > 0) {
        return res.json({ results: spoonResults });
      }
      return res.status(500).json({ error: "Sorry Chef, that search didn't work out! Give it another try or tweak your search terms." });
    }
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);

    const claudeParsed = JSON.parse(cleaned);

    // Validate structure: must be an object with array values
    if (typeof claudeParsed !== "object" || claudeParsed === null || Array.isArray(claudeParsed)) {
      console.error("Batch search: unexpected response structure:", JSON.stringify(claudeParsed).slice(0, 200));
      if (Object.keys(spoonResults).length > 0) {
        return res.json({ results: spoonResults });
      }
      return res.status(500).json({ error: "Sorry Chef, that search didn't work out! Give it another try or tweak your search terms." });
    }

    // Tag Claude results with source
    const taggedClaude: Record<string, any[]> = {};
    for (const [key, value] of Object.entries(claudeParsed)) {
      if (Array.isArray(value)) {
        taggedClaude[key] = value.map((r: any) => ({ ...r, source: "claude" }));
      } else {
        taggedClaude[key] = value as any;
      }
    }

    // Merge Spoonacular + Claude results
    const merged = { ...spoonResults, ...taggedClaude };
    res.json({ results: merged });
  } catch (error: any) {
    console.error("Batch recipe search error:", error);
    // Return Spoonacular results even if Claude fails
    if (Object.keys(spoonResults).length > 0) {
      return res.json({ results: spoonResults });
    }
    if (error instanceof RateLimitError) {
      return res.status(429).json({ error: error.message });
    }
    if (error instanceof SyntaxError) {
      return res.status(500).json({ error: "Sorry Chef, that search didn't work out! Give it another try or tweak your search terms." });
    }
    res.status(500).json({ error: "Sorry Chef, that search didn't work out! Give it another try or tweak your search terms." });
  }
});

// POST /api/recipes/match — fuzzy search for a recipe in the local database
router.post("/match", optionalAuth, async (req: Request, res: Response) => {
  const { query: matchQuery } = req.body;
  if (!matchQuery || typeof matchQuery !== "string" || !matchQuery.trim()) {
    return res.status(400).json({ error: "query is required" });
  }

  // Normalize: lowercase, strip possessives/apostrophes/punctuation, collapse whitespace
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[''\u2019]s\b/g, "") // strip possessive 's
      .replace(/[''\u2019]/g, "")     // strip remaining apostrophes
      .replace(/&/g, "and")
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  // Stop words: common conversational words that don't help identify a recipe
  const STOP_WORDS = new Set([
    "i", "we", "me", "us", "my", "our",
    "want", "need", "like", "make", "cook", "have", "get", "try",
    "a", "an", "the", "some", "any",
    "for", "with", "and", "or", "of", "on", "in", "to",
    "please", "tonight", "today", "dinner", "lunch", "meal",
    "something", "thing", "recipe", "food",
  ]);

  const normQuery = normalize(matchQuery);
  const allQueryWords = normQuery.split(" ").filter(Boolean);
  // Filter stop words, but fall back to all words if everything is a stop word
  const contentWords = allQueryWords.filter((w) => !STOP_WORDS.has(w));
  const queryWords = contentWords.length > 0 ? contentWords : allQueryWords;

  console.log(`[match] query="${matchQuery}" → normalized="${normQuery}" → contentWords=[${queryWords.join(", ")}] (filtered ${allQueryWords.length - queryWords.length} stop words)`);

  // Pull all recipe names from DB (fast — recipes table is small)
  const rows = await query<{ id: number; name: string }>("SELECT id, name FROM recipes");

  const scored: Array<{ id: number; name: string; score: number }> = [];

  for (const row of rows) {
    const normName = normalize(row.name);

    // Exact normalized match → perfect score
    if (normName === normQuery) {
      scored.push({ ...row, score: 1 });
      continue;
    }

    // Word-overlap scoring: what fraction of the user's content words appear in the recipe name?
    const nameWords = normName.split(" ").filter(Boolean);
    const matchingWords = queryWords.filter((w) => nameWords.includes(w));
    if (matchingWords.length === 0) continue;

    // Use queryWords.length as denominator: "what % of what the user asked for was found?"
    const overlapScore = matchingWords.length / queryWords.length;

    if (overlapScore >= 0.4) {
      scored.push({ ...row, score: overlapScore });
    }
  }

  // Sort by score descending, take top 3
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 3);

  if (top.length > 0) {
    const matches = [];
    for (const t of top) {
      const fullRow = await queryOne("SELECT * FROM recipes WHERE id = $1", [t.id]);
      matches.push({
        recipe: rowToRecipe(fullRow),
        score: t.score,
      });
    }
    console.log(`[match] query="${matchQuery}" → ${matches.length} matches: ${matches.map((m) => `"${m.recipe.title}" (score=${m.score.toFixed(2)})`).join(", ")}`);
    return res.json({ matches });
  }

  console.log(`[match] query="${matchQuery}" → no matches found`);
  res.json({ matches: [] });
});

// POST /api/recipes/ai-match — AI-powered recipe matching using Claude
router.post("/ai-match", requireAuth, async (req: Request, res: Response) => {
  const { query: matchQuery, family_id } = req.body;
  if (!matchQuery || typeof matchQuery !== "string" || !matchQuery.trim()) {
    return res.status(400).json({ error: "query is required" });
  }
  if (!family_id || typeof family_id !== "number") {
    return res.status(400).json({ error: "family_id is required" });
  }

  // Verify family access
  const family = await verifyFamilyAccess(family_id, req.householdId);
  if (!family) {
    return res.status(403).json({ error: "Access denied to this family" });
  }

  try {
    const aiResults = await aiMatchRecipes({
      description: matchQuery.trim(),
      familyId: family_id,
      householdId: req.householdId,
    });

    if (aiResults.length === 0) {
      return res.json({ matches: [] });
    }

    // Fetch full recipe rows for each AI result
    const matches = [];
    for (const result of aiResults) {
      const fullRow = await queryOne("SELECT * FROM recipes WHERE id = $1", [result.recipe_id]);
      if (fullRow) {
        matches.push({
          recipe: rowToRecipe(fullRow),
          score: result.score,
          reasoning: result.reasoning,
        });
      }
    }

    console.log(`[ai-match] query="${matchQuery}" → ${matches.length} matches: ${matches.map((m) => `"${m.recipe.title}" (score=${m.score})`).join(", ")}`);
    res.json({ matches });
  } catch (error: any) {
    console.error("[ai-match] error:", error);
    // Never block the user — return empty on any failure
    res.json({ matches: [] });
  }
});

// GET /api/recipes/:id
router.get("/:id", async (req: Request, res: Response) => {
  const row = await queryOne("SELECT * FROM recipes WHERE id = $1", [req.params.id]);
  if (!row) return res.status(404).json({ error: "Recipe not found" });
  res.json(rowToRecipe(row));
});

// POST /api/recipes
router.post("/", optionalAuth, async (req: Request, res: Response) => {
  const validation = validateRecipe(req.body);
  if (!validation.isValid) {
    return res.status(400).json({ error: "Validation failed", details: validation.errors });
  }

  const r: RecipeInput = req.body;
  const sourceType = r.source_type || "user";

  // Check for existing recipe with same source URL to avoid duplicates
  if (r.source_url) {
    const existing = await queryOne(
      "SELECT * FROM recipes WHERE source_url = $1",
      [r.source_url],
    );
    if (existing) {
      // Backfill image_url if the existing record is missing it but the new request has one
      if (!existing.image_url && r.image_url) {
        await query("UPDATE recipes SET image_url = $1 WHERE id = $2", [r.image_url, existing.id]);
        existing.image_url = r.image_url;
      }
      return res.status(200).json(rowToRecipe(existing));
    }
  }

  const row = await queryOne(`
    INSERT INTO recipes (name, cuisine, vegetarian, protein_type, cook_minutes,
      allergens, kid_friendly, makes_leftovers, ingredients, tags,
      source_type, source_name, source_url, difficulty, leftovers_score,
      seasonal_tags, frequency_cap_per_month, household_id, created_by, image_url)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
    RETURNING *
  `, [
    r.title,           // DB column is `name`
    r.cuisine,
    r.vegetarian ?? false,
    r.protein_type || null,
    r.cook_minutes,
    JSON.stringify(r.allergens || []),
    r.kid_friendly ?? false,
    r.makes_leftovers ?? false,
    JSON.stringify(r.ingredients || []),
    JSON.stringify(r.tags || []),
    sourceType,
    r.source_name || null,
    r.source_url || null,
    r.difficulty || "medium",
    r.leftovers_score || 0,
    JSON.stringify(r.seasonal_tags || []),
    r.frequency_cap_per_month || null,
    req.householdId || null,
    req.user?.id || null,
    r.image_url || null,
  ]);

  const recipeId = row.id;

  // Insert recipe_ingredients from any provided ingredients
  let ingredients = r.ingredients || [];
  if (ingredients.length > 0) {
    for (const ing of ingredients) {
      await query(
        "INSERT INTO recipe_ingredients (recipe_id, item, quantity, unit, category) VALUES ($1, $2, $3, $4, $5)",
        [recipeId, ing.name, ing.quantity, ing.unit, ing.category],
      );
    }
  }

  res.status(201).json(rowToRecipe(row));
});

// PUT /api/recipes/:id
router.put("/:id", optionalAuth, async (req: Request, res: Response) => {
  const existing = await queryOne("SELECT * FROM recipes WHERE id = $1", [req.params.id]);
  if (!existing) return res.status(404).json({ error: "Recipe not found" });

  // Only user-created recipes can be edited
  if (existing.source_type !== "user") {
    return res.status(403).json({ error: "Only user-created recipes can be edited" });
  }

  // Verify household access for non-seed recipes
  if (existing.household_id && req.householdId !== existing.household_id) {
    return res.status(404).json({ error: "Recipe not found" });
  }

  const validation = validateRecipe(req.body);
  if (!validation.isValid) {
    return res.status(400).json({ error: "Validation failed", details: validation.errors });
  }

  const r: RecipeInput = req.body;
  await query(`
    UPDATE recipes SET name=$1, cuisine=$2, vegetarian=$3, protein_type=$4, cook_minutes=$5,
      allergens=$6, kid_friendly=$7, makes_leftovers=$8, ingredients=$9, tags=$10,
      source_type=$11, source_name=$12, source_url=$13, difficulty=$14, leftovers_score=$15,
      seasonal_tags=$16, frequency_cap_per_month=$17, image_url=$19
    WHERE id=$18
  `, [
    r.title,
    r.cuisine,
    r.vegetarian ?? false,
    r.protein_type || null,
    r.cook_minutes,
    JSON.stringify(r.allergens || []),
    r.kid_friendly ?? false,
    r.makes_leftovers ?? false,
    JSON.stringify(r.ingredients || []),
    JSON.stringify(r.tags || []),
    r.source_type || "user",
    r.source_name || null,
    r.source_url || null,
    r.difficulty || "medium",
    r.leftovers_score || 0,
    JSON.stringify(r.seasonal_tags || []),
    r.frequency_cap_per_month || null,
    req.params.id,
    r.image_url || null,
  ]);

  // Delete + reinsert recipe_ingredients
  await query("DELETE FROM recipe_ingredients WHERE recipe_id = $1", [req.params.id]);
  if (r.ingredients && r.ingredients.length > 0) {
    for (const ing of r.ingredients) {
      await query(
        "INSERT INTO recipe_ingredients (recipe_id, item, quantity, unit, category) VALUES ($1, $2, $3, $4, $5)",
        [req.params.id, ing.name, ing.quantity, ing.unit, ing.category],
      );
    }
  }

  const updated = await queryOne("SELECT * FROM recipes WHERE id = $1", [req.params.id]);
  res.json(rowToRecipe(updated));
});

// PATCH /api/recipes/:id/rename
router.patch("/:id/rename", async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  const existing = await queryOne("SELECT * FROM recipes WHERE id = $1", [req.params.id]);
  if (!existing) return res.status(404).json({ error: "Recipe not found" });

  const updated = await queryOne(
    "UPDATE recipes SET name = $1 WHERE id = $2 RETURNING *",
    [name.trim(), req.params.id],
  );
  res.json(rowToRecipe(updated));
});

// PATCH /api/recipes/:id/notes
router.patch("/:id/notes", async (req: Request, res: Response) => {
  const { notes } = req.body;
  if (notes !== null && typeof notes !== "string") {
    return res.status(400).json({ error: "notes must be a string or null" });
  }
  const existing = await queryOne("SELECT * FROM recipes WHERE id = $1", [req.params.id]);
  if (!existing) return res.status(404).json({ error: "Recipe not found" });

  const value = notes === null ? null : notes.trim() || null;
  const updated = await queryOne(
    "UPDATE recipes SET notes = $1 WHERE id = $2 RETURNING *",
    [value, req.params.id],
  );
  res.json(rowToRecipe(updated));
});

// DELETE /api/recipes/:id
router.delete("/:id", optionalAuth, async (req: Request, res: Response) => {
  const existing = await queryOne("SELECT * FROM recipes WHERE id = $1", [req.params.id]);
  if (!existing) return res.status(404).json({ error: "Recipe not found" });

  // Verify household access for non-seed recipes
  if (existing.household_id && req.householdId !== existing.household_id) {
    return res.status(404).json({ error: "Recipe not found" });
  }

  // Nullify references in meal_plan_items so we don't break plan history
  await query("UPDATE meal_plan_items SET recipe_id = NULL WHERE recipe_id = $1", [req.params.id]);
  await query("DELETE FROM recipe_ingredients WHERE recipe_id = $1", [req.params.id]);
  await query("DELETE FROM recipes WHERE id = $1", [req.params.id]);
  res.status(204).send();
});

// POST /api/recipes/import-from-url — extract full recipe details from a URL
router.post("/import-from-url", optionalAuth, async (req: Request, res: Response) => {
  const { url } = req.body;
  if (!url || typeof url !== "string" || !url.trim()) {
    return res.status(400).json({ error: "url is required" });
  }

  // Validate URL format before any AI calls
  if (!isValidHttpUrl(url.trim())) {
    return res.status(400).json({ error: "Please enter a valid URL starting with http:// or https://" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  // Check for existing recipe with same URL
  const existing = await queryOne("SELECT * FROM recipes WHERE source_url = $1", [url.trim()]);
  if (existing) {
    // image_url will be backfilled after re-extraction if missing (but we return early here)
    return res.status(200).json({ recipe: rowToRecipe(existing), alreadyExists: true, paywall_warning: null });
  }

  const client = new Anthropic({ apiKey });

  // Validate that the URL points to a recipe page
  const validation = await validateRecipeUrl(url.trim(), client);

  if (validation.status === "not_recipe") {
    return res.status(422).json({
      error: "not_recipe",
      reason: validation.reason || "This doesn't appear to be a recipe page.",
      detected_recipe_name: validation.detected_recipe_name,
      alternative_url: validation.alternative_url,
    });
  }

  const paywallWarning = validation.status === "paywall"
    ? "This recipe is from a paywalled source. Ingredients have been estimated by AI."
    : null;

  try {
    // Step 1: Extract recipe metadata from URL
    const message = await createWithRetry(client, {
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      tools: [
        { type: "web_search_20250305", name: "web_search", max_uses: 5 } as any,
      ],
      system: `You are a recipe extraction assistant. Given a recipe URL, fetch the page and extract the recipe metadata.

Return ONLY a JSON object with this exact structure:
{
  "title": "Full Recipe Title",
  "source_name": "Website Name (e.g. Bon Appetit, Food Network)",
  "cuisine": "american",
  "cook_minutes": 45,
  "vegetarian": false,
  "protein_type": "chicken",
  "difficulty": "medium",
  "kid_friendly": true,
  "makes_leftovers": false,
  "allergens": [],
  "tags": [],
  "image_url": "URL of the recipe's main photo (from JSON-LD schema.org/Recipe 'image' field, og:image meta tag, or primary article image)"
}

Constraints:
- cuisine must be one of: ${VALID_CUISINES.join(", ")}
- difficulty must be one of: ${VALID_DIFFICULTIES.join(", ")}
- protein_type should be null for vegetarian dishes
- cook_minutes should be total time (prep + cook)
- Return ONLY valid JSON, no markdown fences, no explanation.`,
      messages: [
        { role: "user", content: `Extract the full recipe details and ingredients from this URL: ${url.trim()}` },
      ],
    });

    let lastText = "";
    for (const block of message.content) {
      if ((block as any).type === "text") {
        lastText = (block as any).text;
      }
    }

    if (!lastText) {
      return res.status(500).json({ error: "No response from recipe extraction" });
    }

    const cleaned = lastText
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "")
      .trim();

    // Find JSON object
    const objStart = cleaned.indexOf("{");
    const objEnd = cleaned.lastIndexOf("}");
    if (objStart === -1 || objEnd === -1) {
      return res.status(500).json({ error: "Failed to parse recipe data" });
    }

    const parsed = JSON.parse(cleaned.slice(objStart, objEnd + 1));

    // Validate and normalize
    const cuisine = VALID_CUISINES.includes(parsed.cuisine) ? parsed.cuisine : "american";
    const difficulty = VALID_DIFFICULTIES.includes(parsed.difficulty) ? parsed.difficulty : "medium";

    const ingredients: any[] = [];

    // Create the recipe (ingredients extracted later at lock time)
    const row = await queryOne(`
      INSERT INTO recipes (name, cuisine, vegetarian, protein_type, cook_minutes,
        allergens, kid_friendly, makes_leftovers, ingredients, tags,
        source_type, source_name, source_url, difficulty, leftovers_score,
        seasonal_tags, frequency_cap_per_month, household_id, created_by, image_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *
    `, [
      parsed.title || "Untitled Recipe",
      cuisine,
      !!parsed.vegetarian,
      parsed.vegetarian ? null : (parsed.protein_type || null),
      parsed.cook_minutes || 30,
      JSON.stringify(parsed.allergens || []),
      parsed.kid_friendly !== false,
      !!parsed.makes_leftovers,
      JSON.stringify(ingredients),
      JSON.stringify(parsed.tags || []),
      "web_search",
      parsed.source_name || null,
      url.trim(),
      difficulty,
      0,
      JSON.stringify([]),
      null,
      req.householdId || null,
      req.user?.id || null,
      parsed.image_url || null,
    ]);

    console.log(`[import-from-url] Created recipe ${row.id}: "${row.name}" (ingredients deferred to lock time)`);

    res.status(201).json({ recipe: rowToRecipe(row), alreadyExists: false, paywall_warning: paywallWarning });
  } catch (error: any) {
    console.error("Import from URL error:", error);
    if (error instanceof RateLimitError) {
      return res.status(429).json({ error: error.message });
    }
    if (error instanceof SyntaxError) {
      return res.status(500).json({ error: "Failed to parse recipe data from URL" });
    }
    res.status(500).json({ error: error.message || "Failed to import recipe from URL" });
  }
});

// POST /api/recipes/backfill-ingredients — re-extract ingredients for web_search recipes with empty ingredients
router.post("/backfill-ingredients", async (_req: Request, res: Response) => {
  try {
    const emptyRecipes = await query<{ id: number; name: string; source_url: string }>(
      `SELECT id, name, source_url FROM recipes
       WHERE source_type = 'web_search'
         AND source_url IS NOT NULL
         AND (ingredients IS NULL OR ingredients = '[]' OR ingredients = '')`,
    );

    if (emptyRecipes.length === 0) {
      return res.json({ message: "No recipes need backfill", backfilled: [] });
    }

    console.log(`[backfill] Found ${emptyRecipes.length} recipes with empty ingredients:`, emptyRecipes.map(r => `${r.id}: ${r.name}`));

    const results = await Promise.all(
      emptyRecipes.map(async (recipe) => {
        const { ingredients: extracted, method } = await extractIngredientsForRecipe(recipe.name, recipe.source_url);
        if (extracted.length > 0) {
          await query("UPDATE recipes SET ingredients = $1 WHERE id = $2", [
            JSON.stringify(extracted),
            recipe.id,
          ]);
          for (const ing of extracted) {
            await query(
              "INSERT INTO recipe_ingredients (recipe_id, item, quantity, unit, category) VALUES ($1, $2, $3, $4, $5)",
              [recipe.id, ing.name, ing.quantity, ing.unit, ing.category],
            );
          }
          console.log(`[backfill] Recipe ${recipe.id} "${recipe.name}": extracted ${extracted.length} ingredients via ${method}`);
        } else {
          console.log(`[backfill] Recipe ${recipe.id} "${recipe.name}": extraction failed`);
        }
        return { id: recipe.id, name: recipe.name, ingredientCount: extracted.length };
      })
    );

    res.json({ message: `Backfilled ${results.filter(r => r.ingredientCount > 0).length}/${emptyRecipes.length} recipes`, results });
  } catch (error: any) {
    console.error("Backfill error:", error);
    res.status(500).json({ error: error.message || "Failed to backfill ingredients" });
  }
});

// POST /api/recipes/backfill-images — backfill image_url for recipes missing it
// Tier 1: JSON-LD / og:image from source_url. Tier 2: Spoonacular image search.
router.post("/backfill-images", async (_req: Request, res: Response) => {
  try {
    const missing = await query<{ id: number; name: string; source_url: string | null }>(
      `SELECT id, name, source_url FROM recipes
       WHERE (image_url IS NULL OR image_url = '')
       ORDER BY id
       LIMIT 50`,
    );

    if (missing.length === 0) {
      return res.json({ message: "No recipes need image backfill", backfilled: 0 });
    }

    console.log(`[backfill-images] Found ${missing.length} recipes missing images`);

    let backfilled = 0;
    const details: { id: number; name: string; method: string }[] = [];

    for (const recipe of missing) {
      try {
        // Tier 1: Extract from source URL (JSON-LD or og:image)
        if (recipe.source_url) {
          const imageUrl = await extractImageFromUrl(recipe.source_url);
          if (imageUrl) {
            await query("UPDATE recipes SET image_url = $1 WHERE id = $2", [imageUrl, recipe.id]);
            backfilled++;
            details.push({ id: recipe.id, name: recipe.name, method: "source_url" });
            console.log(`[backfill-images] Recipe ${recipe.id} "${recipe.name}": image from source URL`);
            continue;
          }
        }

        // Tier 2: Spoonacular search by name (try full name, then simplified)
        const searchNames = [recipe.name];
        // Strip common chef/source prefixes for a simplified search
        const simplified = recipe.name
          .replace(/\b(Ina Garten|Bobby Flay|Alton Brown|Geoffrey Zakarian|Gordon Ramsay|Marcella Hazan|Julia Child|Chrissy Teigen|Food Network|David Lieberman)('s)?\b/gi, "")
          .replace(/\s*\(.*?\)\s*/g, "")
          .replace(/\b(Perfect|Classic|Best|Ultimate)\b/gi, "")
          .replace(/\s+/g, " ")
          .trim();
        if (simplified && simplified !== recipe.name) searchNames.push(simplified);
        // Even more simplified: just the core dish name
        const core = simplified
          .replace(/\bwith\b.*/i, "")
          .replace(/\bMarinated\b/gi, "")
          .trim();
        if (core && core !== simplified && core.length > 3) searchNames.push(core);

        let found = false;
        for (const searchName of searchNames) {
          const results = await searchSpoonacular(searchName, { number: 1 });
          if (results.length > 0 && results[0].image_url) {
            await query("UPDATE recipes SET image_url = $1 WHERE id = $2", [results[0].image_url, recipe.id]);
            backfilled++;
            details.push({ id: recipe.id, name: recipe.name, method: "spoonacular" });
            console.log(`[backfill-images] Recipe ${recipe.id} "${recipe.name}": image from Spoonacular (searched: "${searchName}")`);
            found = true;
            break;
          }
        }
        if (!found) {
          details.push({ id: recipe.id, name: recipe.name, method: "failed" });
        }
      } catch (err: any) {
        console.warn(`[backfill-images] Failed for recipe ${recipe.id}:`, err.message);
        details.push({ id: recipe.id, name: recipe.name, method: "error" });
      }
    }

    res.json({ message: `Backfilled ${backfilled}/${missing.length} recipe images`, backfilled, total: missing.length, details });
  } catch (error: any) {
    console.error("Backfill images error:", error);
    res.status(500).json({ error: error.message || "Failed to backfill images" });
  }
});

export default router;
