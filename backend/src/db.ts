import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { runMigrations, runBackfills } from "./migrate";

function findBackendRoot(): string {
  let dir = __dirname;
  while (!fs.existsSync(path.join(dir, "package.json"))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error("Could not find backend root (package.json)");
    dir = parent;
  }
  return dir;
}

const DB_PATH = path.join(findBackendRoot(), "mealmaker.db");

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
