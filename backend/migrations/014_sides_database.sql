-- 014_sides_database.sql
-- Create a general database of common sides for suggestions

CREATE TABLE IF NOT EXISTS sides_library (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,  -- veggie, salad, starch, grain, bread, fruit
  weight TEXT NOT NULL,    -- light, medium, heavy (for pairing logic)
  cuisine_affinity TEXT,   -- JSON array of cuisines this pairs well with
  avoid_with_main_types TEXT, -- JSON array of main characteristics to avoid
  prep_time_minutes INTEGER,
  vegetarian INTEGER NOT NULL DEFAULT 1,
  ingredients TEXT,        -- JSON array of simple ingredient list
  recipe_url TEXT,         -- Optional: link to recipe
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (category IN ('veggie', 'salad', 'starch', 'grain', 'bread', 'fruit', 'other')),
  CHECK (weight IN ('light', 'medium', 'heavy'))
);

-- Seed some common sides
INSERT INTO sides_library (name, category, weight, cuisine_affinity, avoid_with_main_types, prep_time_minutes, vegetarian, ingredients) VALUES
  ('Green Salad', 'salad', 'light', '["italian", "french", "mediterranean", "american"]', '["pasta", "rice"]', 10, 1, '["lettuce", "tomatoes", "cucumber", "dressing"]'),
  ('Caesar Salad', 'salad', 'light', '["italian", "american"]', '["pasta"]', 15, 1, '["romaine", "parmesan", "croutons", "caesar dressing"]'),
  ('Roasted Broccoli', 'veggie', 'light', '["american", "italian", "chinese"]', '[]', 25, 1, '["broccoli", "olive oil", "garlic", "salt", "pepper"]'),
  ('Steamed Green Beans', 'veggie', 'light', '["american", "french"]', '[]', 15, 1, '["green beans", "butter", "salt"]'),
  ('Mashed Potatoes', 'starch', 'heavy', '["american", "french"]', '["pasta", "rice", "potatoes"]', 30, 1, '["potatoes", "butter", "milk", "salt", "pepper"]'),
  ('Roasted Potatoes', 'starch', 'heavy', '["american", "mediterranean"]', '["pasta", "rice", "potatoes"]', 40, 1, '["potatoes", "olive oil", "rosemary", "salt", "pepper"]'),
  ('White Rice', 'grain', 'medium', '["chinese", "japanese", "thai", "indian", "korean"]', '["pasta", "rice", "quinoa"]', 20, 1, '["rice", "water", "salt"]'),
  ('Brown Rice', 'grain', 'medium', '["chinese", "japanese", "thai", "american"]', '["pasta", "rice", "quinoa"]', 45, 1, '["brown rice", "water", "salt"]'),
  ('Garlic Bread', 'bread', 'medium', '["italian", "american"]', '["pasta"]', 15, 1, '["bread", "butter", "garlic", "parsley"]'),
  ('Dinner Rolls', 'bread', 'medium', '["american", "french"]', '[]', 20, 1, '["flour", "yeast", "butter", "milk"]'),
  ('Corn on the Cob', 'veggie', 'medium', '["american", "mexican"]', '[]', 15, 1, '["corn", "butter", "salt"]'),
  ('Coleslaw', 'salad', 'light', '["american", "mexican"]', '[]', 15, 1, '["cabbage", "carrots", "mayo", "vinegar"]'),
  ('Caprese Salad', 'salad', 'light', '["italian", "mediterranean"]', '[]', 10, 1, '["tomatoes", "mozzarella", "basil", "olive oil"]'),
  ('Quinoa Pilaf', 'grain', 'medium', '["mediterranean", "middle_eastern"]', '["pasta", "rice", "quinoa"]', 25, 1, '["quinoa", "onion", "garlic", "broth"]'),
  ('Sautéed Spinach', 'veggie', 'light', '["italian", "mediterranean", "indian"]', '[]', 10, 1, '["spinach", "garlic", "olive oil", "salt"]'),
  ('Roasted Brussels Sprouts', 'veggie', 'light', '["american", "french"]', '[]', 30, 1, '["brussels sprouts", "olive oil", "balsamic", "salt"]'),
  ('Sweet Potato Fries', 'starch', 'medium', '["american"]', '["potatoes", "fries"]', 35, 1, '["sweet potatoes", "olive oil", "salt", "paprika"]'),
  ('Cucumber Salad', 'salad', 'light', '["mediterranean", "middle_eastern", "japanese"]', '[]', 10, 1, '["cucumber", "vinegar", "dill", "salt"]'),
  ('French Fries', 'starch', 'heavy', '["american", "french"]', '["potatoes"]', 30, 1, '["potatoes", "oil", "salt"]'),
  ('Grilled Asparagus', 'veggie', 'light', '["american", "french", "italian"]', '[]', 15, 1, '["asparagus", "olive oil", "lemon", "salt"]');

CREATE INDEX IF NOT EXISTS idx_sides_category ON sides_library(category);
CREATE INDEX IF NOT EXISTS idx_sides_weight ON sides_library(weight);
