import { Router, Request, Response } from "express";
import db from "../db";
import { rowToRecipe } from "../helpers";
import { generatePlan } from "../planner";
import type { Family, DayOfWeek, GeneratePlanRequest, GroceryItem, Ingredient, GroceryCategory } from "../../../shared/types";

const router = Router();

function rowToFamily(row: any): Family {
  return {
    id: row.id,
    name: row.name,
    allergies: JSON.parse(row.allergies),
    vegetarian_ratio: row.vegetarian_ratio,
    gluten_free: !!row.gluten_free,
    dairy_free: !!row.dairy_free,
    nut_free: !!row.nut_free,
    max_cook_minutes_weekday: row.max_cook_minutes_weekday,
    max_cook_minutes_weekend: row.max_cook_minutes_weekend,
    leftovers_nights_per_week: row.leftovers_nights_per_week,
    picky_kid_mode: !!row.picky_kid_mode,
    created_at: row.created_at,
  };
}

// POST /api/meal-plans/generate
router.post("/generate", (req: Request, res: Response) => {
  const { family_id, locks } = req.body as GeneratePlanRequest;

  const familyRow = db.prepare("SELECT * FROM families WHERE id = ?").get(family_id);
  if (!familyRow) return res.status(404).json({ error: "Family not found" });
  const family = rowToFamily(familyRow);

  const recipeRows = db.prepare("SELECT * FROM recipes").all();
  const allRecipes = recipeRows.map(rowToRecipe);

  try {
    const planSlots = generatePlan(family, allRecipes, locks || {});

    // Save to DB
    const planResult = db.prepare("INSERT INTO meal_plans (family_id) VALUES (?)").run(family_id);
    const planId = planResult.lastInsertRowid as number;

    const insertItem = db.prepare(`
      INSERT INTO meal_plan_items (meal_plan_id, day, recipe_id, locked, lunch_leftover_label)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertAll = db.transaction(() => {
      for (const slot of planSlots) {
        insertItem.run(planId, slot.day, slot.recipe.id, slot.locked ? 1 : 0, slot.lunch_leftover_label);
      }
    });
    insertAll();

    // Return the full plan
    const items = db.prepare(`
      SELECT mpi.id as item_id, mpi.meal_plan_id, mpi.day, mpi.recipe_id, mpi.locked, mpi.lunch_leftover_label,
             r.id as r_id, r.name, r.cuisine, r.vegetarian, r.protein_type,
             r.cook_minutes, r.allergens, r.kid_friendly, r.makes_leftovers, r.ingredients, r.tags
      FROM meal_plan_items mpi
      JOIN recipes r ON r.id = mpi.recipe_id
      WHERE mpi.meal_plan_id = ?
      ORDER BY CASE mpi.day
        WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2 WHEN 'wednesday' THEN 3
        WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5 WHEN 'saturday' THEN 6 WHEN 'sunday' THEN 7
      END
    `).all(planId);

    res.status(201).json({
      id: planId,
      family_id,
      items: items.map((row: any) => ({
        id: row.item_id,
        meal_plan_id: row.meal_plan_id,
        day: row.day,
        recipe_id: row.recipe_id,
        locked: !!row.locked,
        lunch_leftover_label: row.lunch_leftover_label,
        recipe: rowToRecipe({ ...row, id: row.r_id }),
      })),
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/meal-plans/:id
router.get("/:id", (req: Request, res: Response) => {
  const plan = db.prepare("SELECT * FROM meal_plans WHERE id = ?").get(req.params.id);
  if (!plan) return res.status(404).json({ error: "Meal plan not found" });

  const items = db.prepare(`
    SELECT mpi.id as item_id, mpi.meal_plan_id, mpi.day, mpi.recipe_id, mpi.locked, mpi.lunch_leftover_label,
           r.id as r_id, r.name, r.cuisine, r.vegetarian, r.protein_type,
           r.cook_minutes, r.allergens, r.kid_friendly, r.makes_leftovers, r.ingredients, r.tags
    FROM meal_plan_items mpi
    JOIN recipes r ON r.id = mpi.recipe_id
    WHERE mpi.meal_plan_id = ?
    ORDER BY CASE mpi.day
      WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2 WHEN 'wednesday' THEN 3
      WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5 WHEN 'saturday' THEN 6 WHEN 'sunday' THEN 7
    END
  `).all(req.params.id);

  res.json({
    ...(plan as any),
    items: items.map((row: any) => ({
      id: row.item_id,
      meal_plan_id: row.meal_plan_id,
      day: row.day,
      recipe_id: row.recipe_id,
      locked: !!row.locked,
      lunch_leftover_label: row.lunch_leftover_label,
      recipe: rowToRecipe({ ...row, id: row.r_id }),
    })),
  });
});

// GET /api/meal-plans/:id/grocery-list
router.get("/:id/grocery-list", (req: Request, res: Response) => {
  const plan = db.prepare("SELECT * FROM meal_plans WHERE id = ?").get(req.params.id);
  if (!plan) return res.status(404).json({ error: "Meal plan not found" });

  const items = db.prepare(`
    SELECT r.ingredients FROM meal_plan_items mpi
    JOIN recipes r ON r.id = mpi.recipe_id
    WHERE mpi.meal_plan_id = ?
  `).all(req.params.id);

  // Consolidate ingredients
  const consolidated = new Map<string, { total_quantity: number; unit: string; category: GroceryCategory }>();

  for (const row of items) {
    const ingredients: Ingredient[] = JSON.parse((row as any).ingredients);
    for (const ing of ingredients) {
      const key = `${ing.name.toLowerCase()}|${ing.unit}`;
      const existing = consolidated.get(key);
      if (existing) {
        existing.total_quantity += ing.quantity;
      } else {
        consolidated.set(key, {
          total_quantity: ing.quantity,
          unit: ing.unit,
          category: ing.category,
        });
      }
    }
  }

  const groceryItems: GroceryItem[] = [];
  for (const [key, val] of consolidated) {
    const name = key.split("|")[0];
    groceryItems.push({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      total_quantity: Math.round(val.total_quantity * 100) / 100,
      unit: val.unit,
      category: val.category,
      checked: false,
    });
  }

  // Sort by category then name
  groceryItems.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.name.localeCompare(b.name);
  });

  res.json({ meal_plan_id: Number(req.params.id), items: groceryItems });
});

export default router;
