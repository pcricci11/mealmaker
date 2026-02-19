import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import { query, transaction } from "./db";
import { initDb } from "./migrate";

interface RawRecipe {
  name: string;
  cuisine: string;
  vegetarian: number;
  protein_type: string | null;
  cook_minutes: number;
  allergens: string;
  kid_friendly: number;
  makes_leftovers: number;
  ingredients: string;
  tags: string;
  source_type: string;
  source_name: string | null;
  source_url: string | null;
  difficulty: string;
  notes: string | null;
}

async function seed() {
  await initDb();

  const jsonPath = path.join(__dirname, "..", "seed_recipes.json");
  const raw: RawRecipe[] = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));

  // Clear existing data
  await query("DELETE FROM recipe_ingredients");
  await query("DELETE FROM meal_plan_items");
  await query("DELETE FROM meal_plans");
  await query("DELETE FROM family_members");
  await query("DELETE FROM recipes");

  await transaction(async (client) => {
    for (const r of raw) {
      const vegetarian = !!r.vegetarian;
      const kid_friendly = !!r.kid_friendly;
      const makes_leftovers = !!r.makes_leftovers;
      const allergens = JSON.parse(r.allergens);
      const ingredients = JSON.parse(r.ingredients);
      const tags = JSON.parse(r.tags);

      const result = await client.query(
        `INSERT INTO recipes (name, cuisine, vegetarian, protein_type, cook_minutes,
          allergens, kid_friendly, makes_leftovers, ingredients, tags,
          source_type, source_name, source_url, difficulty, notes, is_seed)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, TRUE)
        RETURNING id`,
        [
          r.name,
          r.cuisine,
          vegetarian,
          r.protein_type,
          r.cook_minutes,
          JSON.stringify(allergens),
          kid_friendly,
          makes_leftovers,
          JSON.stringify(ingredients),
          JSON.stringify(tags),
          r.source_type,
          r.source_name,
          r.source_url,
          r.difficulty,
          r.notes,
        ],
      );

      const recipeId = result.rows[0].id;
      for (const ing of ingredients) {
        await client.query(
          "INSERT INTO recipe_ingredients (recipe_id, item, quantity, unit, category) VALUES ($1, $2, $3, $4, $5)",
          [recipeId, ing.name, ing.quantity, ing.unit, ing.category],
        );
      }
    }
  });

  console.log(`Seeded ${raw.length} recipes with ingredients.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
