import db, { initDb } from "./db";
import { SEED_RECIPES } from "./seed-data";

initDb();

// Clear existing recipes
db.exec("DELETE FROM meal_plan_items");
db.exec("DELETE FROM meal_plans");
db.exec("DELETE FROM recipes");

const insert = db.prepare(`
  INSERT INTO recipes (name, cuisine, vegetarian, protein_type, cook_minutes, allergens, kid_friendly, makes_leftovers, ingredients, tags)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertMany = db.transaction(() => {
  for (const r of SEED_RECIPES) {
    insert.run(
      r.name,
      r.cuisine,
      r.vegetarian ? 1 : 0,
      r.protein_type,
      r.cook_minutes,
      JSON.stringify(r.allergens),
      r.kid_friendly ? 1 : 0,
      r.makes_leftovers ? 1 : 0,
      JSON.stringify(r.ingredients),
      JSON.stringify(r.tags),
    );
  }
});

insertMany();
console.log(`Seeded ${SEED_RECIPES.length} recipes.`);
