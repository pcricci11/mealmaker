import { Router, Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import db from "../db";
import { rowToRecipe } from "../helpers";
import { validateRecipe } from "../validation";
import { extractIngredientsFromUrl } from "../services/ingredientExtractor";
import { createWithRetry, RateLimitError } from "../services/claudeRetry";
import type { RecipeInput } from "../../../shared/types";
import { VALID_CUISINES, VALID_DIFFICULTIES } from "../../../shared/types";

const router = Router();

// GET /api/recipes
router.get("/", (_req: Request, res: Response) => {
  const rows = db.prepare("SELECT * FROM recipes ORDER BY name").all();
  res.json(rows.map(rowToRecipe));
});

// POST /api/recipes/search — web search for recipes via Claude
router.post("/search", async (req: Request, res: Response) => {
  const { query } = req.body;
  if (!query || typeof query !== "string" || !query.trim()) {
    return res.status(400).json({ error: "query is required" });
  }

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
- Return ONLY the JSON array, no markdown fences, no explanation.`,
      messages: [
        { role: "user", content: `Search for recipes: "${query.trim()}"` },
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
      return res.status(500).json({ error: "No text response from Claude" });
    }

    // Strip markdown fences if present
    const cleaned = lastText
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "")
      .trim();
    const results = JSON.parse(cleaned);

    res.json({ results });
  } catch (error: any) {
    console.error("Recipe search error:", error);
    if (error instanceof RateLimitError) {
      return res.status(429).json({ error: error.message });
    }
    if (error instanceof SyntaxError) {
      return res.status(500).json({ error: "Failed to parse Claude response" });
    }
    res.status(500).json({ error: error.message || "Failed to search recipes" });
  }
});

// POST /api/recipes/batch-search — batch web search for multiple recipes via Claude
router.post("/batch-search", async (req: Request, res: Response) => {
  const { queries } = req.body;
  if (!Array.isArray(queries) || queries.length === 0 || queries.some((q: any) => typeof q !== "string" || !q.trim())) {
    return res.status(400).json({ error: "queries must be a non-empty array of strings" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  const client = new Anthropic({ apiKey });
  const cappedQueries = queries.slice(0, 5);

  try {
    const message = await createWithRetry(client, {
      model: "claude-sonnet-4-5-20250929",
      max_tokens: Math.min(1500 * cappedQueries.length, 6000),
      tools: [
        { type: "web_search_20250305", name: "web_search", max_uses: Math.min(2 * cappedQueries.length, 10) } as any,
      ],
      system: `Search the web for each recipe query. Return a JSON object: keys are the EXACT original query strings, values are arrays of 3-5 results. Each result: { "name": string, "source_name": string, "source_url": string, "cook_minutes": number, "cuisine": string, "vegetarian": boolean, "protein_type": string|null, "difficulty": string, "kid_friendly": boolean, "description": string (1 sentence max) }. cuisine: one of ${VALID_CUISINES.join(", ")}. difficulty: one of ${VALID_DIFFICULTIES.join(", ")}. protein_type: null if vegetarian. Return ONLY valid JSON, no fences or explanation.`,
      messages: [
        {
          role: "user",
          content: `Search for recipes for each of these:\n${cappedQueries.map((q: string, i: number) => `${i + 1}. "${q.trim()}"`).join("\n")}`,
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
      return res.status(500).json({ error: "No text response from Claude" });
    }

    // Strip markdown fences if present
    const cleaned = lastText
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "")
      .trim();
    const parsed = JSON.parse(cleaned);

    res.json({ results: parsed });
  } catch (error: any) {
    console.error("Batch recipe search error:", error);
    if (error instanceof RateLimitError) {
      return res.status(429).json({ error: error.message });
    }
    if (error instanceof SyntaxError) {
      return res.status(500).json({ error: "Failed to parse Claude response" });
    }
    res.status(500).json({ error: error.message || "Failed to batch search recipes" });
  }
});

// POST /api/recipes/match — fuzzy search for a recipe in the local database
router.post("/match", (req: Request, res: Response) => {
  const { query } = req.body;
  if (!query || typeof query !== "string" || !query.trim()) {
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

  const normQuery = normalize(query);
  const queryWords = normQuery.split(" ").filter(Boolean);

  // Pull all recipe names from DB (fast — recipes table is small)
  const rows = db
    .prepare("SELECT id, name FROM recipes")
    .all() as Array<{ id: number; name: string }>;

  let bestRow: { id: number; name: string } | null = null;
  let bestScore = 0;

  for (const row of rows) {
    const normName = normalize(row.name);

    // Exact normalized match → perfect score
    if (normName === normQuery) {
      bestRow = row;
      bestScore = 1;
      break;
    }

    // Word-overlap scoring (handles containment proportionally)
    const nameWords = normName.split(" ").filter(Boolean);
    const matchingWords = queryWords.filter((w) => nameWords.includes(w));
    if (matchingWords.length === 0) continue;

    const overlapScore =
      matchingWords.length / Math.max(queryWords.length, nameWords.length);

    if (overlapScore > bestScore) {
      bestScore = overlapScore;
      bestRow = row;
    }
  }

  // Require at least 70% word overlap to consider it a match
  if (bestRow && bestScore >= 0.7) {
    const full = db
      .prepare("SELECT * FROM recipes WHERE id = ?")
      .get(bestRow.id);
    return res.json({ match: rowToRecipe(full), score: bestScore });
  }

  res.json({ match: null, score: 0 });
});

// GET /api/recipes/:id
router.get("/:id", (req: Request, res: Response) => {
  const row = db.prepare("SELECT * FROM recipes WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Recipe not found" });
  res.json(rowToRecipe(row));
});

// POST /api/recipes
router.post("/", async (req: Request, res: Response) => {
  const validation = validateRecipe(req.body);
  if (!validation.isValid) {
    return res.status(400).json({ error: "Validation failed", details: validation.errors });
  }

  const r: RecipeInput = req.body;
  const sourceType = r.source_type || "user";

  // Check for existing recipe with same source URL to avoid duplicates
  if (r.source_url) {
    const existing = db.prepare(
      "SELECT * FROM recipes WHERE source_url = ?"
    ).get(r.source_url);
    if (existing) {
      return res.status(200).json(rowToRecipe(existing));
    }
  }

  const result = db.prepare(`
    INSERT INTO recipes (name, cuisine, vegetarian, protein_type, cook_minutes,
      allergens, kid_friendly, makes_leftovers, ingredients, tags,
      source_type, source_name, source_url, difficulty, leftovers_score,
      seasonal_tags, frequency_cap_per_month)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    r.title,           // DB column is `name`
    r.cuisine,
    r.vegetarian ? 1 : 0,
    r.protein_type || null,
    r.cook_minutes,
    JSON.stringify(r.allergens || []),
    r.kid_friendly ? 1 : 0,
    r.makes_leftovers ? 1 : 0,
    JSON.stringify(r.ingredients || []),
    JSON.stringify(r.tags || []),
    sourceType,
    r.source_name || null,
    r.source_url || null,
    r.difficulty || "medium",
    r.leftovers_score || 0,
    JSON.stringify(r.seasonal_tags || []),
    r.frequency_cap_per_month || null,
  );

  const recipeId = result.lastInsertRowid as number;

  // Insert recipe_ingredients from any provided ingredients
  let ingredients = r.ingredients || [];
  if (ingredients.length > 0) {
    const insertIng = db.prepare(
      "INSERT INTO recipe_ingredients (recipe_id, item, quantity, unit, category) VALUES (?, ?, ?, ?, ?)",
    );
    for (const ing of ingredients) {
      insertIng.run(recipeId, ing.name, ing.quantity, ing.unit, ing.category);
    }
  }

  const created = db.prepare("SELECT * FROM recipes WHERE id = ?").get(recipeId);
  res.status(201).json(rowToRecipe(created));

  // Fire-and-forget: extract ingredients in background for web_search recipes
  if (
    sourceType === "web_search" &&
    r.source_url &&
    (!r.ingredients || r.ingredients.length === 0)
  ) {
    extractIngredientsFromUrl(r.title, r.source_url)
      .then((extracted) => {
        if (extracted.length > 0) {
          db.prepare("UPDATE recipes SET ingredients = ? WHERE id = ?").run(
            JSON.stringify(extracted),
            recipeId,
          );
          const insertIng = db.prepare(
            "INSERT INTO recipe_ingredients (recipe_id, item, quantity, unit, category) VALUES (?, ?, ?, ?, ?)",
          );
          for (const ing of extracted) {
            insertIng.run(recipeId, ing.name, ing.quantity, ing.unit, ing.category);
          }
          console.log(`[create] Background extraction for recipe ${recipeId}: ${extracted.length} ingredients`);
        }
      })
      .catch((err) => {
        console.error(`[create] Background ingredient extraction failed for recipe ${recipeId}:`, err);
      });
  }
});

// PUT /api/recipes/:id
router.put("/:id", (req: Request, res: Response) => {
  const existing = db.prepare("SELECT * FROM recipes WHERE id = ?").get(req.params.id) as any;
  if (!existing) return res.status(404).json({ error: "Recipe not found" });

  // Only user-created recipes can be edited
  if (existing.source_type !== "user") {
    return res.status(403).json({ error: "Only user-created recipes can be edited" });
  }

  const validation = validateRecipe(req.body);
  if (!validation.isValid) {
    return res.status(400).json({ error: "Validation failed", details: validation.errors });
  }

  const r: RecipeInput = req.body;
  db.prepare(`
    UPDATE recipes SET name=?, cuisine=?, vegetarian=?, protein_type=?, cook_minutes=?,
      allergens=?, kid_friendly=?, makes_leftovers=?, ingredients=?, tags=?,
      source_type=?, source_name=?, source_url=?, difficulty=?, leftovers_score=?,
      seasonal_tags=?, frequency_cap_per_month=?
    WHERE id=?
  `).run(
    r.title,
    r.cuisine,
    r.vegetarian ? 1 : 0,
    r.protein_type || null,
    r.cook_minutes,
    JSON.stringify(r.allergens || []),
    r.kid_friendly ? 1 : 0,
    r.makes_leftovers ? 1 : 0,
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
  );

  // Delete + reinsert recipe_ingredients
  db.prepare("DELETE FROM recipe_ingredients WHERE recipe_id = ?").run(req.params.id);
  if (r.ingredients && r.ingredients.length > 0) {
    const insertIng = db.prepare(
      "INSERT INTO recipe_ingredients (recipe_id, item, quantity, unit, category) VALUES (?, ?, ?, ?, ?)",
    );
    for (const ing of r.ingredients) {
      insertIng.run(req.params.id, ing.name, ing.quantity, ing.unit, ing.category);
    }
  }

  const updated = db.prepare("SELECT * FROM recipes WHERE id = ?").get(req.params.id);
  res.json(rowToRecipe(updated));
});

// PATCH /api/recipes/:id/rename
router.patch("/:id/rename", (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  const existing = db.prepare("SELECT * FROM recipes WHERE id = ?").get(req.params.id) as any;
  if (!existing) return res.status(404).json({ error: "Recipe not found" });

  db.prepare("UPDATE recipes SET name = ? WHERE id = ?").run(name.trim(), req.params.id);
  const updated = db.prepare("SELECT * FROM recipes WHERE id = ?").get(req.params.id);
  res.json(rowToRecipe(updated));
});

// DELETE /api/recipes/:id
router.delete("/:id", (req: Request, res: Response) => {
  const existing = db.prepare("SELECT * FROM recipes WHERE id = ?").get(req.params.id) as any;
  if (!existing) return res.status(404).json({ error: "Recipe not found" });

  // Nullify references in meal_plan_items so we don't break plan history
  db.prepare("UPDATE meal_plan_items SET recipe_id = NULL WHERE recipe_id = ?").run(req.params.id);
  db.prepare("DELETE FROM recipe_ingredients WHERE recipe_id = ?").run(req.params.id);
  db.prepare("DELETE FROM recipes WHERE id = ?").run(req.params.id);
  res.status(204).send();
});

// POST /api/recipes/:id/suggest-ingredients
router.post("/:id/suggest-ingredients", async (req: Request, res: Response) => {
  const recipe = db.prepare("SELECT id, name FROM recipes WHERE id = ?").get(req.params.id) as { id: number; name: string } | undefined;
  if (!recipe) return res.status(404).json({ error: "Recipe not found" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1024,
      system: `You are a cooking assistant. Given a recipe name, suggest a typical ingredient list for a family of 4. Return ONLY a JSON array of ingredients with this structure:
[
  { "name": "ingredient name", "quantity": 1.5, "unit": "lb", "category": "protein" }
]

Valid categories: "produce", "dairy", "pantry", "protein", "spices", "grains", "frozen", "other".
Valid units: "lb", "oz", "cup", "cups", "tbsp", "tsp", "count", "cloves", "can", "bag", "bunch".
Return ONLY valid JSON, no markdown fences, no explanation.`,
      messages: [
        { role: "user", content: `Suggest ingredients for: "${recipe.name}"` },
      ],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      return res.status(500).json({ error: "Unexpected response from Claude" });
    }

    const rawText = content.text
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "")
      .trim();
    const ingredients = JSON.parse(rawText);

    res.json(ingredients);
  } catch (error: any) {
    console.error("Suggest ingredients error:", error);
    if (error instanceof SyntaxError) {
      return res.status(500).json({ error: "Failed to parse Claude response" });
    }
    res.status(500).json({ error: error.message || "Failed to suggest ingredients" });
  }
});

// POST /api/recipes/import-from-url — extract full recipe details from a URL
router.post("/import-from-url", async (req: Request, res: Response) => {
  const { url } = req.body;
  if (!url || typeof url !== "string" || !url.trim()) {
    return res.status(400).json({ error: "url is required" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  // Check for existing recipe with same URL
  const existing = db.prepare("SELECT * FROM recipes WHERE source_url = ?").get(url.trim());
  if (existing) {
    return res.status(200).json({ recipe: rowToRecipe(existing), alreadyExists: true });
  }

  const client = new Anthropic({ apiKey });

  try {
    // Step 1: Extract recipe metadata from URL
    const message = await createWithRetry(client, {
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      tools: [
        { type: "web_search_20250305", name: "web_search", max_uses: 5 } as any,
      ],
      system: `You are a recipe extraction assistant. Given a recipe URL, fetch the page and extract ALL recipe details.

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
  "ingredients": [
    { "name": "ingredient name", "quantity": 1.5, "unit": "lb", "category": "protein" }
  ]
}

Constraints:
- cuisine must be one of: ${VALID_CUISINES.join(", ")}
- difficulty must be one of: ${VALID_DIFFICULTIES.join(", ")}
- protein_type should be null for vegetarian dishes
- cook_minutes should be total time (prep + cook)
- Extract the ACTUAL ingredients from the recipe page exactly as specified
- Valid ingredient units: lb, oz, cup, cups, tbsp, tsp, count, cloves, can, bag, bunch, inch, box, slices, head, pint
- Valid ingredient categories: produce, dairy, pantry, protein, spices, grains, frozen, other
- For items counted by number (e.g. "3 eggs"), use unit "count"
- For items like "salt and pepper to taste", use quantity 1 and unit "tsp"
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

    const VALID_UNITS = new Set([
      "lb", "oz", "cup", "cups", "tbsp", "tsp", "count", "cloves", "can",
      "bag", "bunch", "inch", "box", "slices", "head", "pint",
    ]);
    const VALID_CATEGORIES = new Set([
      "produce", "dairy", "pantry", "protein", "spices", "grains", "frozen", "other",
    ]);

    const ingredients = (parsed.ingredients || []).filter((ing: any) => {
      if (!ing || typeof ing !== "object") return false;
      if (typeof ing.name !== "string" || !ing.name.trim()) return false;
      if (typeof ing.quantity !== "number" || ing.quantity <= 0) return false;
      if (!VALID_UNITS.has(ing.unit)) return false;
      if (!VALID_CATEGORIES.has(ing.category)) return false;
      return true;
    }).map((ing: any) => ({
      name: ing.name.trim(),
      quantity: ing.quantity,
      unit: ing.unit,
      category: ing.category,
    }));

    // Create the recipe
    const recipeData: RecipeInput = {
      title: parsed.title || "Untitled Recipe",
      cuisine,
      vegetarian: !!parsed.vegetarian,
      protein_type: parsed.vegetarian ? null : (parsed.protein_type || null),
      cook_minutes: parsed.cook_minutes || 30,
      allergens: parsed.allergens || [],
      kid_friendly: parsed.kid_friendly !== false,
      makes_leftovers: !!parsed.makes_leftovers,
      leftovers_score: 0,
      ingredients,
      tags: parsed.tags || [],
      source_type: "web_search",
      source_name: parsed.source_name || null,
      source_url: url.trim(),
      difficulty,
      seasonal_tags: [],
      frequency_cap_per_month: null,
    };

    const result = db.prepare(`
      INSERT INTO recipes (name, cuisine, vegetarian, protein_type, cook_minutes,
        allergens, kid_friendly, makes_leftovers, ingredients, tags,
        source_type, source_name, source_url, difficulty, leftovers_score,
        seasonal_tags, frequency_cap_per_month)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      recipeData.title, recipeData.cuisine, recipeData.vegetarian ? 1 : 0,
      recipeData.protein_type, recipeData.cook_minutes,
      JSON.stringify(recipeData.allergens), recipeData.kid_friendly ? 1 : 0,
      recipeData.makes_leftovers ? 1 : 0, JSON.stringify(ingredients),
      JSON.stringify(recipeData.tags), recipeData.source_type,
      recipeData.source_name, recipeData.source_url, recipeData.difficulty,
      0, JSON.stringify([]), null,
    );

    const recipeId = result.lastInsertRowid as number;

    // Insert recipe_ingredients
    if (ingredients.length > 0) {
      const insertIng = db.prepare(
        "INSERT INTO recipe_ingredients (recipe_id, item, quantity, unit, category) VALUES (?, ?, ?, ?, ?)",
      );
      for (const ing of ingredients) {
        insertIng.run(recipeId, ing.name, ing.quantity, ing.unit, ing.category);
      }
    }

    const created = db.prepare("SELECT * FROM recipes WHERE id = ?").get(recipeId);
    console.log(`[import-from-url] Created recipe ${recipeId}: "${recipeData.title}" with ${ingredients.length} ingredients`);

    res.status(201).json({ recipe: rowToRecipe(created), alreadyExists: false });
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
    const emptyRecipes = db.prepare(
      `SELECT id, name, source_url FROM recipes
       WHERE source_type = 'web_search'
         AND source_url IS NOT NULL
         AND (ingredients IS NULL OR ingredients = '[]' OR ingredients = '')`
    ).all() as Array<{ id: number; name: string; source_url: string }>;

    if (emptyRecipes.length === 0) {
      return res.json({ message: "No recipes need backfill", backfilled: [] });
    }

    console.log(`[backfill] Found ${emptyRecipes.length} recipes with empty ingredients:`, emptyRecipes.map(r => `${r.id}: ${r.name}`));

    const results = await Promise.all(
      emptyRecipes.map(async (recipe) => {
        const extracted = await extractIngredientsFromUrl(recipe.name, recipe.source_url);
        if (extracted.length > 0) {
          db.prepare("UPDATE recipes SET ingredients = ? WHERE id = ?").run(
            JSON.stringify(extracted),
            recipe.id,
          );
          const insertIng = db.prepare(
            "INSERT INTO recipe_ingredients (recipe_id, item, quantity, unit, category) VALUES (?, ?, ?, ?, ?)",
          );
          for (const ing of extracted) {
            insertIng.run(recipe.id, ing.name, ing.quantity, ing.unit, ing.category);
          }
          console.log(`[backfill] Recipe ${recipe.id} "${recipe.name}": extracted ${extracted.length} ingredients`);
        } else {
          console.log(`[backfill] Recipe ${recipe.id} "${recipe.name}": extraction still failed`);
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

export default router;
