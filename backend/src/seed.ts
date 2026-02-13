import db, { initDb } from "./db";
import { SEED_RECIPES } from "./seed-data";

// Run migrations first
initDb();

// Clear existing data
db.exec("DELETE FROM recipe_ingredients");
db.exec("DELETE FROM meal_plan_items");
db.exec("DELETE FROM meal_plans");
db.exec("DELETE FROM family_members");
db.exec("DELETE FROM recipes");

const insertRecipe = db.prepare(`
  INSERT INTO recipes (name, cuisine, vegetarian, protein_type, cook_minutes,
    allergens, kid_friendly, makes_leftovers, ingredients, tags,
    source_type, source_name, source_url, difficulty, leftovers_score,
    seasonal_tags, frequency_cap_per_month)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertIngredient = db.prepare(`
  INSERT INTO recipe_ingredients (recipe_id, item, quantity, unit, category)
  VALUES (?, ?, ?, ?, ?)
`);

const seedAll = db.transaction(() => {
  for (const r of SEED_RECIPES) {
    const result = insertRecipe.run(
      r.title,           // DB column is `name`
      r.cuisine,
      r.vegetarian ? 1 : 0,
      r.protein_type,
      r.cook_minutes,
      JSON.stringify(r.allergens),
      r.kid_friendly ? 1 : 0,
      r.makes_leftovers ? 1 : 0,
      JSON.stringify(r.ingredients),
      JSON.stringify(r.tags),
      r.source_type,
      r.source_name,
      r.source_url,
      r.difficulty,
      r.leftovers_score,
      JSON.stringify(r.seasonal_tags),
      r.frequency_cap_per_month,
    );

    const recipeId = result.lastInsertRowid as number;
    for (const ing of r.ingredients) {
      insertIngredient.run(recipeId, ing.name, ing.quantity, ing.unit, ing.category);
    }
  }
});

seedAll();
console.log(`Seeded ${SEED_RECIPES.length} recipes with ingredients.`);
