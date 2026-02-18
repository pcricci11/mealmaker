import dotenv from "dotenv";
dotenv.config();

import { query, queryOne, transaction } from "./db";
import { initDb } from "./migrate";
import { SEED_RECIPES } from "./seed-data";

async function seed() {
  // Run migrations first
  await initDb();

  // Clear existing data
  await query("DELETE FROM recipe_ingredients");
  await query("DELETE FROM meal_plan_items");
  await query("DELETE FROM meal_plans");
  await query("DELETE FROM family_members");
  await query("DELETE FROM recipes");

  await transaction(async (client) => {
    for (const r of SEED_RECIPES) {
      const result = await client.query(
        `INSERT INTO recipes (name, cuisine, vegetarian, protein_type, cook_minutes,
          allergens, kid_friendly, makes_leftovers, ingredients, tags,
          source_type, source_name, source_url, difficulty, leftovers_score,
          seasonal_tags, frequency_cap_per_month)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING id`,
        [
          r.title,           // DB column is `name`
          r.cuisine,
          r.vegetarian ?? false,
          r.protein_type,
          r.cook_minutes,
          JSON.stringify(r.allergens),
          r.kid_friendly ?? false,
          r.makes_leftovers ?? false,
          JSON.stringify(r.ingredients),
          JSON.stringify(r.tags),
          r.source_type,
          r.source_name,
          r.source_url,
          r.difficulty,
          r.leftovers_score,
          JSON.stringify(r.seasonal_tags),
          r.frequency_cap_per_month,
        ],
      );

      const recipeId = result.rows[0].id;
      for (const ing of r.ingredients) {
        await client.query(
          "INSERT INTO recipe_ingredients (recipe_id, item, quantity, unit, category) VALUES ($1, $2, $3, $4, $5)",
          [recipeId, ing.name, ing.quantity, ing.unit, ing.category],
        );
      }
    }
  });

  console.log(`Seeded ${SEED_RECIPES.length} recipes with ingredients.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
