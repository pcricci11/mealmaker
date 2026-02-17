-- 018_side_ingredients.sql
-- Cache estimated ingredients for sides (from Claude)

CREATE TABLE IF NOT EXISTS side_ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  side_library_id INTEGER REFERENCES sides_library(id),
  side_name TEXT,
  item TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  category TEXT NOT NULL,
  servings INTEGER NOT NULL DEFAULT 4,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_side_ingredients_library_id ON side_ingredients(side_library_id);
CREATE INDEX idx_side_ingredients_name ON side_ingredients(side_name);
