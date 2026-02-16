import { Router, Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import db from "../db";
import { rowToRecipe } from "../helpers";
import { validateRecipe } from "../validation";
import { extractIngredientsFromUrl } from "../services/ingredientExtractor";
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
    const message = await client.messages.create({
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
    const message = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: Math.min(2048 * cappedQueries.length, 8192),
      tools: [
        { type: "web_search_20250305", name: "web_search", max_uses: Math.min(2 * cappedQueries.length, 10) } as any,
      ],
      system: `You are a recipe search assistant. The user will give you multiple recipe queries. For EACH query, use web search to find real recipes online. Then return a single JSON object where each key is the EXACT original query string and each value is an array of 3-5 recipe results.

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
- Return ONLY the JSON object, no markdown fences, no explanation.`,
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

// DELETE /api/recipes/:id
router.delete("/:id", (req: Request, res: Response) => {
  const existing = db.prepare("SELECT * FROM recipes WHERE id = ?").get(req.params.id) as any;
  if (!existing) return res.status(404).json({ error: "Recipe not found" });

  // Only user-created recipes can be deleted
  if (existing.source_type !== "user") {
    return res.status(403).json({ error: "Only user-created recipes can be deleted" });
  }

  // Check if used in any meal plans
  const usage = db.prepare("SELECT COUNT(*) as c FROM meal_plan_items WHERE recipe_id = ?").get(req.params.id) as { c: number };
  if (usage.c > 0) {
    return res.status(409).json({ error: "Recipe is used in existing meal plans and cannot be deleted" });
  }

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
