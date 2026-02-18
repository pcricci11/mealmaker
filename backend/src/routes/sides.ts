// routes/sides.ts
// Sides library and side swapping/adding

import { Router } from "express";
import { query, queryOne } from "../db";

const router = Router();

// ===== SIDES LIBRARY =====

// Get all sides from library
router.get("/library", async (req, res) => {
  const category = req.query.category as string;
  const weight = req.query.weight as string;

  let sql = `
    SELECT
      id, name, category, weight, cuisine_affinity,
      avoid_with_main_types, prep_time_minutes,
      vegetarian, ingredients, recipe_url, created_at
    FROM sides_library
    WHERE 1=1
  `;

  const params: any[] = [];
  let paramIndex = 1;

  if (category) {
    sql += ` AND category = $${paramIndex++}`;
    params.push(category);
  }

  if (weight) {
    sql += ` AND weight = $${paramIndex++}`;
    params.push(weight);
  }

  sql += ` ORDER BY name ASC`;

  const sides = (await query(sql, params)).map((row: any) => ({
    ...row,
    cuisine_affinity: row.cuisine_affinity ? JSON.parse(row.cuisine_affinity) : null,
    avoid_with_main_types: row.avoid_with_main_types
      ? JSON.parse(row.avoid_with_main_types)
      : null,
    ingredients: row.ingredients ? JSON.parse(row.ingredients) : null,
    vegetarian: !!row.vegetarian,
  }));

  res.json(sides);
});

// Get single side from library
router.get("/library/:id", async (req, res) => {
  const id = parseInt(req.params.id);

  const side = await queryOne("SELECT * FROM sides_library WHERE id = $1", [id]);

  if (!side) {
    return res.status(404).json({ error: "Side not found" });
  }

  res.json({
    ...side,
    cuisine_affinity: side.cuisine_affinity
      ? JSON.parse(side.cuisine_affinity)
      : null,
    avoid_with_main_types: side.avoid_with_main_types
      ? JSON.parse(side.avoid_with_main_types)
      : null,
    ingredients: side.ingredients
      ? JSON.parse(side.ingredients)
      : null,
    vegetarian: !!side.vegetarian,
  });
});

// Suggest sides for a main dish
router.post("/suggest", async (req, res) => {
  const { main_recipe_id, cuisine, exclude_ids } = req.body;

  if (!main_recipe_id) {
    return res.status(400).json({ error: "main_recipe_id is required" });
  }

  // Get the main recipe details
  const mainRecipe: any = await queryOne(
    `SELECT name, cuisine, vegetarian, protein_type, ingredients, tags
    FROM recipes WHERE id = $1`,
    [main_recipe_id],
  );

  if (!mainRecipe) {
    return res.status(400).json({ error: "Main recipe not found" });
  }

  const mainIngredients = JSON.parse(mainRecipe.ingredients || "[]");

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
  let sql = `
    SELECT
      id, name, category, weight, cuisine_affinity,
      avoid_with_main_types, prep_time_minutes,
      vegetarian, ingredients, recipe_url
    FROM sides_library
    WHERE 1=1
  `;

  const params: any[] = [];
  let paramIndex = 1;

  // Exclude already used sides
  if (exclude_ids && Array.isArray(exclude_ids) && exclude_ids.length > 0) {
    const placeholders = exclude_ids.map((_, i) => `$${paramIndex + i}`).join(",");
    sql += ` AND id NOT IN (${placeholders})`;
    params.push(...exclude_ids);
    paramIndex += exclude_ids.length;
  }

  // Prefer lighter sides if main is heavy
  if (mainWeight === "heavy") {
    sql += ` AND weight = 'light'`;
  }

  // Prefer sides that match cuisine
  if (cuisine || mainRecipe.cuisine) {
    const cuisineToMatch = cuisine || mainRecipe.cuisine;
    sql += ` AND (
      cuisine_affinity LIKE $${paramIndex++} OR
      cuisine_affinity IS NULL
    )`;
    params.push(`%"${cuisineToMatch}"%`);
  }

  sql += ` ORDER BY RANDOM() LIMIT 2`;

  const suggestions = (await query(sql, params)).map((row: any) => ({
    ...row,
    cuisine_affinity: row.cuisine_affinity ? JSON.parse(row.cuisine_affinity) : null,
    avoid_with_main_types: row.avoid_with_main_types
      ? JSON.parse(row.avoid_with_main_types)
      : null,
    ingredients: row.ingredients ? JSON.parse(row.ingredients) : null,
    vegetarian: !!row.vegetarian,
  }));

  res.json(suggestions);
});

// ===== MEAL PLAN SIDES =====

// Swap a side in a meal plan
router.post("/swap/:meal_item_id", async (req, res) => {
  const mealItemId = parseInt(req.params.meal_item_id);
  const { new_side_id, custom_name } = req.body;

  if (!new_side_id && !custom_name) {
    return res.status(400).json({ error: "new_side_id or custom_name is required" });
  }

  // Get the current side
  const currentSide: any = await queryOne(
    `SELECT * FROM meal_plan_items
    WHERE id = $1 AND meal_type = 'side'`,
    [mealItemId],
  );

  if (!currentSide) {
    return res.status(404).json({ error: "Side meal item not found" });
  }

  if (custom_name) {
    await query(
      `UPDATE meal_plan_items
      SET is_custom = TRUE,
          notes = $1
      WHERE id = $2`,
      [JSON.stringify({ custom_side: true, side_name: custom_name }), mealItemId],
    );
    return res.json({ message: "Side swapped successfully" });
  }

  // Get the new side from library
  const newSide: any = await queryOne(
    "SELECT * FROM sides_library WHERE id = $1",
    [new_side_id],
  );

  if (!newSide) {
    return res.status(404).json({ error: "New side not found in library" });
  }

  await query(
    `UPDATE meal_plan_items
    SET is_custom = TRUE,
        notes = $1
    WHERE id = $2`,
    [JSON.stringify({ side_library_id: new_side_id, side_name: newSide.name }), mealItemId],
  );

  res.json({ message: "Side swapped successfully" });
});

// Add a side to a meal
router.post("/add/:meal_item_id", async (req, res) => {
  const mealItemId = parseInt(req.params.meal_item_id);
  const { side_id, custom_name } = req.body;

  // Get the main meal
  const mainMeal: any = await queryOne(
    `SELECT * FROM meal_plan_items
    WHERE id = $1 AND meal_type = 'main'`,
    [mealItemId],
  );

  if (!mainMeal) {
    return res.status(404).json({ error: "Main meal item not found" });
  }

  let sideData: any;

  if (side_id) {
    // Adding from library
    const librarySide: any = await queryOne(
      "SELECT * FROM sides_library WHERE id = $1",
      [side_id],
    );

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
  const newSide = await queryOne(
    `INSERT INTO meal_plan_items
    (meal_plan_id, day, meal_type, main_number, parent_meal_item_id, is_custom, notes)
    VALUES ($1, $2, 'side', $3, $4, TRUE, $5)
    RETURNING *`,
    [
      mainMeal.meal_plan_id,
      mainMeal.day,
      mainMeal.main_number || null,
      mealItemId,
      JSON.stringify(sideData),
    ],
  );

  res.status(201).json(newSide);
});

// Remove a side from a meal plan
router.delete("/:meal_item_id", async (req, res) => {
  const mealItemId = parseInt(req.params.meal_item_id);

  const side: any = await queryOne(
    `SELECT * FROM meal_plan_items WHERE id = $1 AND meal_type = 'side'`,
    [mealItemId],
  );

  if (!side) {
    return res.status(404).json({ error: "Side meal item not found" });
  }

  await query("DELETE FROM meal_plan_items WHERE id = $1", [mealItemId]);

  res.json({ message: "Side removed successfully" });
});

export default router;
