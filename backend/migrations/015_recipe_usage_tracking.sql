-- 015_recipe_usage_tracking.sql
-- Track when recipes are used to enforce frequency preferences

CREATE TABLE IF NOT EXISTS recipe_usage_history (
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  recipe_id INTEGER REFERENCES recipes(id) ON DELETE CASCADE,
  favorite_meal_id INTEGER REFERENCES family_favorite_meals(id) ON DELETE CASCADE,
  used_date TEXT NOT NULL,     -- YYYY-MM-DD when this recipe was in a meal plan
  meal_plan_id INTEGER REFERENCES meal_plans(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((recipe_id IS NOT NULL AND favorite_meal_id IS NULL) OR 
         (recipe_id IS NULL AND favorite_meal_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_recipe_usage_family ON recipe_usage_history(family_id);
CREATE INDEX IF NOT EXISTS idx_recipe_usage_recipe ON recipe_usage_history(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_usage_favorite ON recipe_usage_history(favorite_meal_id);
CREATE INDEX IF NOT EXISTS idx_recipe_usage_date ON recipe_usage_history(used_date);
