-- 019_serving_multiplier_to_number.sql
-- Convert serving_multiplier from text labels to numeric values
-- 'normal' -> 1.0, 'hearty' -> 1.5, 'extra_large' -> 2.0

-- Disable FK checks while we rebuild the table (other tables reference families)
PRAGMA foreign_keys = OFF;

-- SQLite doesn't support ALTER COLUMN, so we recreate the table
CREATE TABLE families_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  allergies TEXT NOT NULL DEFAULT '[]',
  vegetarian_ratio INTEGER NOT NULL DEFAULT 0,
  gluten_free INTEGER NOT NULL DEFAULT 0,
  dairy_free INTEGER NOT NULL DEFAULT 0,
  nut_free INTEGER NOT NULL DEFAULT 0,
  max_cook_minutes_weekday INTEGER NOT NULL DEFAULT 45,
  max_cook_minutes_weekend INTEGER NOT NULL DEFAULT 90,
  leftovers_nights_per_week INTEGER NOT NULL DEFAULT 1,
  picky_kid_mode INTEGER NOT NULL DEFAULT 0,
  planning_mode TEXT NOT NULL DEFAULT 'strictest_household',
  serving_multiplier REAL NOT NULL DEFAULT 1.0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO families_new (id, name, allergies, vegetarian_ratio, gluten_free, dairy_free, nut_free,
  max_cook_minutes_weekday, max_cook_minutes_weekend, leftovers_nights_per_week, picky_kid_mode,
  planning_mode, serving_multiplier, created_at)
SELECT id, name, allergies, vegetarian_ratio, gluten_free, dairy_free, nut_free,
  max_cook_minutes_weekday, max_cook_minutes_weekend, leftovers_nights_per_week, picky_kid_mode,
  planning_mode,
  CASE serving_multiplier
    WHEN 'hearty' THEN 1.5
    WHEN 'extra_large' THEN 2.0
    ELSE 1.0
  END,
  created_at
FROM families;

DROP TABLE families;
ALTER TABLE families_new RENAME TO families;

-- Re-enable FK checks
PRAGMA foreign_keys = ON;
