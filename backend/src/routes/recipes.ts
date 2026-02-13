import { Router, Request, Response } from "express";
import db from "../db";
import { rowToRecipe } from "../helpers";
import { validateRecipe } from "../validation";
import type { RecipeInput } from "../../../shared/types";

const router = Router();

// GET /api/recipes
router.get("/", (_req: Request, res: Response) => {
  const rows = db.prepare("SELECT * FROM recipes ORDER BY name").all();
  res.json(rows.map(rowToRecipe));
});

// GET /api/recipes/:id
router.get("/:id", (req: Request, res: Response) => {
  const row = db.prepare("SELECT * FROM recipes WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Recipe not found" });
  res.json(rowToRecipe(row));
});

// POST /api/recipes
router.post("/", (req: Request, res: Response) => {
  const validation = validateRecipe(req.body);
  if (!validation.isValid) {
    return res.status(400).json({ error: "Validation failed", details: validation.errors });
  }

  const r: RecipeInput = req.body;
  const sourceType = r.source_type || "user";

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

  // Insert recipe_ingredients
  if (r.ingredients && r.ingredients.length > 0) {
    const insertIng = db.prepare(
      "INSERT INTO recipe_ingredients (recipe_id, item, quantity, unit, category) VALUES (?, ?, ?, ?, ?)",
    );
    for (const ing of r.ingredients) {
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

export default router;
