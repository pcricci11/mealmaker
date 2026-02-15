import Database from "better-sqlite3";
import path from "path";
import { runMigrations, runBackfills } from "./migrate";

const DB_PATH = path.join(__dirname, "..", "mealmaker.db");

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function initDb() {
  runMigrations(db);
  runBackfills(db);

  // Clean up orphaned meal_plan_items (e.g. from manual DB edits without foreign_keys ON)
  db.prepare(`
    DELETE FROM meal_plan_items
    WHERE meal_plan_id NOT IN (SELECT id FROM meal_plans)
  `).run();
}

export default db;
