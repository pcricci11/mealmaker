// routes/sides.ts
// Sides library and side swapping/adding

import { Router } from "express";
import db from "../db";

const router = Router();

// ===== SIDES LIBRARY =====

// Get all sides from library
router.get("/library", (req, res) => {
  const category = req.query.category as string;
  const weight = req.query.weight as string;

  let query = `
    SELECT 
      id, name, category, weight, cuisine_affinity, 
      avoid_with_main_types, prep_time_minutes, 
      vegetarian, ingredients, recipe_url, created_at
    FROM sides_library
    WHERE 1=1
  `;

  const params: any[] = [];

  if (category) {
    query += ` AND category = ?`;
    params.push(category);
  }

  if (weight) {
    query += ` AND weight = ?`;
    params.push(weight);
  }

  query += ` ORDER BY name ASC`;

  const sides = db
    .prepare(query)
    .all(...params)
    .map((row: any) => ({
      ...row,
      cuisine_affinity: row.cuisine_affinity ? JSON.parse(row.cuisine_affinity) : null,
      avoid_with_main_types: row.avoid_with_main_types 
        ? JSON.parse(row.avoid_with_main_types) 
        : null,
      ingredients: row.ingredients ? JSON.parse(row.ingredients) : null,
      vegetarian: Boolean(row.vegetarian),
    }));

  res.json(sides);
});

// Get single side from library
router.get("/library/:id", (req, res) => {
  const id = parseInt(req.params.id);

  const side = db
    .prepare("SELECT * FROM sides_library WHERE id = ?")
    .get(id);

  if (!side) {
    return res.status(404).json({ error: "Side not found" });
  }

  res.json({
    ...(side as any),
    cuisine_affinity: (side as any).cuisine_affinity 
      ? JSON.parse((side as any).cuisine_affinity) 
      : null,
    avoid_with_main_types: (side as any).avoid_with_main_types 
      ? JSON.parse((side as any).avoid_with_main_types) 
      : null,
    ingredients: (side as any).ingredients 
      ? JSON.parse((side as any).ingredients) 
      : null,
    vegetarian: Boolean((side as any).vegetarian),
  });
});

// Suggest sides for a main dish
router.post("/suggest", (req, res) => {
  const { main_recipe_id, cuisine, exclude_ids } = req.body;

  if (!main_recipe_id) {
    return res.status(400).json({ error: "main_recipe_id is required" });
  }

  // Get the main recipe details
  const mainRecipe: any = db
    .prepare(
      `SELECT name, cuisine, vegetarian, protein_type, ingredients, tags
      FROM recipes WHERE id = ?`
    )
    .get(main_recipe_id);

  if (!mainRecipe) {
    return res.status(400).json({ error: "Main recipe not found" });
  }

  const mainIngredients = JSON.parse(mainRecipe.ingredients || "[]");
  const mainTags = JSON.parse(mainRecipe.tags || "[]");

  // Determine main "weight" based on ingredients/tags
  let mainWeight = "medium";
  const ingredientNames = mainIngredients.map((i: any) => i.name.toLowerCase());
  
  if (
    ingredientNames.some((n: string) => 
      n.includes("pasta") || n.includes("rice") || n.includes("potato")
    )
  ) {
    mainWeight = "heavy";
  }

  // Build query to find appropriate sides
  let query = `
    SELECT 
      id, name, category, weight, cuisine_affinity, 
      avoid_with_main_types, prep_time_minutes,
      vegetarian, ingredients, recipe_url
    FROM sides_library
    WHERE 1=1
  `;

  const params: any[] = [];

  // Exclude already used sides
  if (exclude_ids && Array.isArray(exclude_ids) && exclude_ids.length > 0) {
    query += ` AND id NOT IN (${exclude_ids.map(() => "?").join(",")})`;
    params.push(...exclude_ids);
  }

  // Prefer lighter sides if main is heavy
  if (mainWeight === "heavy") {
    query += ` AND weight = 'light'`;
  }

  // Prefer sides that match cuisine
  if (cuisine || mainRecipe.cuisine) {
    const cuisineToMatch = cuisine || mainRecipe.cuisine;
    query += ` AND (
      cuisine_affinity LIKE ? OR 
      cuisine_affinity IS NULL
    )`;
    params.push(`%"${cuisineToMatch}"%`);
  }

  query += ` ORDER BY RANDOM() LIMIT 2`;

  const suggestions = db
    .prepare(query)
    .all(...params)
    .map((row: any) => ({
      ...row,
      cuisine_affinity: row.cuisine_affinity ? JSON.parse(row.cuisine_affinity) : null,
      avoid_with_main_types: row.avoid_with_main_types 
        ? JSON.parse(row.avoid_with_main_types) 
        : null,
      ingredients: row.ingredients ? JSON.parse(row.ingredients) : null,
      vegetarian: Boolean(row.vegetarian),
    }));

  res.json(suggestions);
});

// ===== MEAL PLAN SIDES =====

// Swap a side in a meal plan
router.post("/swap/:meal_item_id", (req, res) => {
  const mealItemId = parseInt(req.params.meal_item_id);
  const { new_side_id } = req.body;

  if (!new_side_id) {
    return res.status(400).json({ error: "new_side_id is required" });
  }

  // Get the current side
  const currentSide: any = db
    .prepare(
      `SELECT * FROM meal_plan_items 
      WHERE id = ? AND meal_type = 'side'`
    )
    .get(mealItemId);

  if (!currentSide) {
    return res.status(404).json({ error: "Side meal item not found" });
  }

  // Get the new side from library
  const newSide: any = db
    .prepare("SELECT * FROM sides_library WHERE id = ?")
    .get(new_side_id);

  if (!newSide) {
    return res.status(404).json({ error: "New side not found in library" });
  }

  // Update the meal_plan_item to reference the new side
  // Note: You may want to create a recipe from the side, or handle this differently
  // For now, we'll just update with a custom flag
  db.prepare(
    `UPDATE meal_plan_items 
    SET is_custom = 1, 
        notes = ?
    WHERE id = ?`
  ).run(
    JSON.stringify({ side_library_id: new_side_id, side_name: newSide.name }),
    mealItemId
  );

  res.json({ message: "Side swapped successfully" });
});

// Add a side to a meal
router.post("/add/:meal_item_id", (req, res) => {
  const mealItemId = parseInt(req.params.meal_item_id);
  const { side_id, custom_name } = req.body;

  // Get the main meal
  const mainMeal: any = db
    .prepare(
      `SELECT * FROM meal_plan_items 
      WHERE id = ? AND meal_type = 'main'`
    )
    .get(mealItemId);

  if (!mainMeal) {
    return res.status(404).json({ error: "Main meal item not found" });
  }

  let sideData: any;

  if (side_id) {
    // Adding from library
    const librarySide: any = db
      .prepare("SELECT * FROM sides_library WHERE id = ?")
      .get(side_id);

    if (!librarySide) {
      return res.status(404).json({ error: "Side not found in library" });
    }

    sideData = {
      side_library_id: side_id,
      side_name: librarySide.name,
    };
  } else if (custom_name) {
    // Adding custom side
    sideData = {
      custom_side: true,
      side_name: custom_name,
    };
  } else {
    return res.status(400).json({ 
      error: "Either side_id or custom_name is required" 
    });
  }

  // Create new meal_plan_item for the side
  const result = db
    .prepare(
      `INSERT INTO meal_plan_items 
      (meal_plan_id, day, meal_type, parent_meal_item_id, is_custom, notes)
      VALUES (?, ?, 'side', ?, 1, ?)`
    )
    .run(
      mainMeal.meal_plan_id,
      mainMeal.day,
      mealItemId,
      JSON.stringify(sideData)
    );

  const newSide = db
    .prepare("SELECT * FROM meal_plan_items WHERE id = ?")
    .get(result.lastInsertRowid);

  res.status(201).json(newSide);
});

// Remove a side from a meal plan
router.delete("/:meal_item_id", (req, res) => {
  const mealItemId = parseInt(req.params.meal_item_id);

  const side: any = db
    .prepare(
      `SELECT * FROM meal_plan_items WHERE id = ? AND meal_type = 'side'`
    )
    .get(mealItemId);

  if (!side) {
    return res.status(404).json({ error: "Side meal item not found" });
  }

  db.prepare("DELETE FROM meal_plan_items WHERE id = ?").run(mealItemId);

  res.json({ message: "Side removed successfully" });
});

export default router;
