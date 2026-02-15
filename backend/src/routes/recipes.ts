import { Router, Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import db from "../db";
import { rowToRecipe } from "../helpers";
import { validateRecipe } from "../validation";
import type { RecipeInput, Ingredient, GroceryCategory } from "../../../shared/types";
import { VALID_CUISINES, VALID_DIFFICULTIES } from "../../../shared/types";

const router = Router();

const VALID_UNITS = new Set([
  "lb", "oz", "cup", "cups", "tbsp", "tsp", "count", "cloves", "can",
  "bag", "bunch", "inch", "box", "slices", "head", "pint",
]);
const VALID_CATEGORIES = new Set([
  "produce", "dairy", "pantry", "protein", "spices", "grains", "frozen", "other",
]);

/**
 * Fetch a recipe URL via Claude web_search and extract a structured ingredient list.
 * Returns [] on any failure so recipe creation is never blocked.
 */
async function extractIngredientsFromUrl(
  recipeName: string,
  sourceUrl: string,
): Promise<Ingredient[]> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return [];

    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2048,
      tools: [
        { type: "web_search_20250305", name: "web_search", max_uses: 3 } as any,
      ],
      system: `You are a recipe ingredient extractor. Given a recipe name and URL, fetch the page and extract the REAL ingredient list exactly as the recipe specifies.

Return ONLY a JSON array of ingredients with this structure:
[
  { "name": "ingredient name", "quantity": 1.5, "unit": "lb", "category": "protein" }
]

Rules:
- Extract the ACTUAL ingredients from the recipe page, do not guess or make up ingredients
- quantity must be a positive number
- Valid units: lb, oz, cup, cups, tbsp, tsp, count, cloves, can, bag, bunch, inch, box, slices, head, pint
- Valid categories: produce, dairy, pantry, protein, spices, grains, frozen, other
- For items like "salt and pepper to taste", use quantity 1 and unit "tsp"
- For items counted by number (e.g. "3 eggs"), use unit "count"
- Return ONLY valid JSON, no markdown fences, no explanation.`,
      messages: [
        {
          role: "user",
          content: `Extract the ingredient list from this recipe:\nName: "${recipeName}"\nURL: ${sourceUrl}`,
        },
      ],
    });

    // Take the last text block (web search produces multiple content blocks)
    let lastText = "";
    for (const block of message.content) {
      if (block.type === "text") {
        lastText = block.text;
      }
    }
    if (!lastText) return [];

    // Strip markdown fences, then try to extract a JSON array from the text
    let cleaned = lastText
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "")
      .trim();

    // If the text isn't pure JSON, try to extract the JSON array from it
    const arrayStart = cleaned.indexOf("[");
    const arrayEnd = cleaned.lastIndexOf("]");
    if (arrayStart === -1 || arrayEnd === -1) return [];
    cleaned = cleaned.slice(arrayStart, arrayEnd + 1);

    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];

    // Validate and filter each ingredient
    return parsed.filter((ing: any) => {
      if (!ing || typeof ing !== "object") return false;
      if (typeof ing.name !== "string" || !ing.name.trim()) return false;
      if (typeof ing.quantity !== "number" || ing.quantity <= 0) return false;
      if (!VALID_UNITS.has(ing.unit)) return false;
      if (!VALID_CATEGORIES.has(ing.category)) return false;
      return true;
    }).map((ing: any): Ingredient => ({
      name: ing.name.trim(),
      quantity: ing.quantity,
      unit: ing.unit,
      category: ing.category as GroceryCategory,
    }));
  } catch (error) {
    console.error("extractIngredientsFromUrl failed (non-fatal):", error);
    return [];
  }
}

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

  // Check for existing recipe with same name and source URL to avoid duplicates
  if (r.source_url) {
    const existing = db.prepare(
      "SELECT * FROM recipes WHERE name = ? AND source_url = ?"
    ).get(r.title, r.source_url);
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

  // Auto-extract ingredients for web_search recipes that arrive with none
  let ingredients = r.ingredients || [];
  if (
    sourceType === "web_search" &&
    r.source_url &&
    (!r.ingredients || r.ingredients.length === 0)
  ) {
    const extracted = await extractIngredientsFromUrl(r.title, r.source_url);
    if (extracted.length > 0) {
      ingredients = extracted;
      // Update the recipes.ingredients JSON column with the extracted data
      db.prepare("UPDATE recipes SET ingredients = ? WHERE id = ?").run(
        JSON.stringify(extracted),
        recipeId,
      );
    }
  }

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
  res.status(201).json(rowToRecipe(created));
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

export default router;
