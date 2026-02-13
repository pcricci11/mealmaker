import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DB_PATH = path.join(__dirname, "..", "mealmaker.db");
const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    (db.prepare("SELECT name FROM _migrations").all() as Array<{ name: string }>)
      .map((r) => r.name),
  );

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const insert = db.prepare("INSERT INTO _migrations (name) VALUES (?)");

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
    db.exec(sql);
    insert.run(file);
    console.log(`Applied migration: ${file}`);
  }
}

export function runBackfills(db: Database.Database): void {
  // Backfill recipe_ingredients from recipes.ingredients JSON
  const hasTable = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='recipe_ingredients'",
  ).get();
  if (!hasTable) return;

  const count = (db.prepare("SELECT COUNT(*) as c FROM recipe_ingredients").get() as { c: number }).c;
  if (count > 0) return;

  const recipes = db.prepare("SELECT id, ingredients FROM recipes").all() as Array<{
    id: number;
    ingredients: string;
  }>;

  if (recipes.length === 0) return;

  const insert = db.prepare(
    "INSERT INTO recipe_ingredients (recipe_id, item, quantity, unit, category) VALUES (?, ?, ?, ?, ?)",
  );

  const tx = db.transaction(() => {
    for (const recipe of recipes) {
      const ingredients = JSON.parse(recipe.ingredients) as Array<{
        name: string;
        quantity: number;
        unit: string;
        category: string;
      }>;
      for (const ing of ingredients) {
        insert.run(recipe.id, ing.name, ing.quantity, ing.unit, ing.category);
      }
    }
  });
  tx();
  console.log(`Backfilled recipe_ingredients for ${recipes.length} recipes.`);
}

// Run directly via: npx tsx src/migrate.ts
if (require.main === module) {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  runBackfills(db);
  db.close();
  console.log("Migrations complete.");
}
