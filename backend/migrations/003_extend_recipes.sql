-- 003_extend_recipes.sql

ALTER TABLE recipes ADD COLUMN source_type TEXT NOT NULL DEFAULT 'seeded';
ALTER TABLE recipes ADD COLUMN source_name TEXT;
ALTER TABLE recipes ADD COLUMN source_url TEXT;
ALTER TABLE recipes ADD COLUMN difficulty TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE recipes ADD COLUMN leftovers_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE recipes ADD COLUMN seasonal_tags TEXT NOT NULL DEFAULT '[]';
ALTER TABLE recipes ADD COLUMN frequency_cap_per_month INTEGER;

-- Backfill leftovers_score from the existing makes_leftovers boolean
UPDATE recipes SET leftovers_score = CASE WHEN makes_leftovers = 1 THEN 3 ELSE 0 END;

-- Normalized ingredients table
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id INTEGER PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other'
);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id ON recipe_ingredients(recipe_id);
