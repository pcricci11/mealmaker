-- 008_family_favorites.sql
-- Create tables for Family Favorites: Chefs, Meals, and Sides

CREATE TABLE IF NOT EXISTS family_favorite_chefs (
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS family_favorite_meals (
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  recipe_url TEXT,  -- Optional: URL if they pasted a recipe
  difficulty TEXT,  -- easy, medium, hard
  total_time_minutes INTEGER,
  frequency_preference TEXT, -- always, weekly, twice_month, monthly, bimonthly, rarely
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (difficulty IS NULL OR difficulty IN ('easy', 'medium', 'hard')),
  CHECK (frequency_preference IS NULL OR frequency_preference IN ('always', 'weekly', 'twice_month', 'monthly', 'bimonthly', 'rarely'))
);

CREATE TABLE IF NOT EXISTS family_favorite_sides (
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  recipe_url TEXT,  -- Optional: URL if they pasted a recipe
  category TEXT,    -- veggie, salad, starch, grain, etc.
  pairs_well_with TEXT, -- JSON array of cuisine types or meal types
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_fav_chefs_family ON family_favorite_chefs(family_id);
CREATE INDEX IF NOT EXISTS idx_fav_meals_family ON family_favorite_meals(family_id);
CREATE INDEX IF NOT EXISTS idx_fav_sides_family ON family_favorite_sides(family_id);
