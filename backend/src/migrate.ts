import fs from "fs";
import path from "path";
import { query, queryOne, transaction } from "./db";

function findBackendRoot(): string {
  let dir = __dirname;
  while (!fs.existsSync(path.join(dir, "package.json"))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error("Could not find backend root (package.json)");
    dir = parent;
  }
  return dir;
}

const BACKEND_ROOT = findBackendRoot();
const MIGRATIONS_DIR = path.join(BACKEND_ROOT, "migrations");

export async function runMigrations(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const applied = new Set(
    (await query<{ name: string }>("SELECT name FROM _migrations")).map((r) => r.name),
  );

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
    await query(sql);
    await query("INSERT INTO _migrations (name) VALUES ($1)", [file]);
    console.log(`Applied migration: ${file}`);
  }
}

export async function runBackfills(): Promise<void> {
  const hasTable = await queryOne(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'recipe_ingredients'",
  );
  if (!hasTable) return;

  const countRow = await queryOne<{ c: string }>("SELECT COUNT(*) as c FROM recipe_ingredients");
  if (parseInt(countRow?.c ?? "0") > 0) return;

  const recipes = await query<{ id: number; ingredients: string }>(
    "SELECT id, ingredients FROM recipes",
  );
  if (recipes.length === 0) return;

  await transaction(async (client) => {
    for (const recipe of recipes) {
      const ingredients = JSON.parse(recipe.ingredients) as Array<{
        name: string;
        quantity: number;
        unit: string;
        category: string;
      }>;
      for (const ing of ingredients) {
        await client.query(
          "INSERT INTO recipe_ingredients (recipe_id, item, quantity, unit, category) VALUES ($1, $2, $3, $4, $5)",
          [recipe.id, ing.name, ing.quantity, ing.unit, ing.category],
        );
      }
    }
  });
  console.log(`Backfilled recipe_ingredients for ${recipes.length} recipes.`);
}

export async function initDb(): Promise<void> {
  await runMigrations();
  await runBackfills();

  // Clean up orphaned meal_plan_items
  await query(`
    DELETE FROM meal_plan_items
    WHERE meal_plan_id NOT IN (SELECT id FROM meal_plans)
  `);
}

// Run directly via: npx tsx src/migrate.ts
if (require.main === module) {
  initDb()
    .then(() => {
      console.log("Migrations complete.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
