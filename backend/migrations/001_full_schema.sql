-- Consolidated Phase 2 schema for Yes Chef (PostgreSQL)

-- ===== FAMILIES =====
CREATE TABLE IF NOT EXISTS families (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  allergies TEXT NOT NULL DEFAULT '[]',
  vegetarian_ratio INTEGER NOT NULL DEFAULT 0,
  gluten_free BOOLEAN NOT NULL DEFAULT FALSE,
  dairy_free BOOLEAN NOT NULL DEFAULT FALSE,
  nut_free BOOLEAN NOT NULL DEFAULT FALSE,
  max_cook_minutes_weekday INTEGER NOT NULL DEFAULT 45,
  max_cook_minutes_weekend INTEGER NOT NULL DEFAULT 90,
  leftovers_nights_per_week INTEGER NOT NULL DEFAULT 1,
  picky_kid_mode BOOLEAN NOT NULL DEFAULT FALSE,
  planning_mode TEXT NOT NULL DEFAULT 'strictest_household'
    CHECK (planning_mode IN ('strictest_household', 'split_household')),
  serving_multiplier REAL NOT NULL DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===== RECIPES =====
CREATE TABLE IF NOT EXISTS recipes (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  cuisine TEXT NOT NULL,
  vegetarian BOOLEAN NOT NULL DEFAULT FALSE,
  protein_type TEXT,
  cook_minutes INTEGER NOT NULL,
  allergens TEXT NOT NULL DEFAULT '[]',
  kid_friendly BOOLEAN NOT NULL DEFAULT FALSE,
  makes_leftovers BOOLEAN NOT NULL DEFAULT FALSE,
  ingredients TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '[]',
  source_type TEXT NOT NULL DEFAULT 'seeded',
  source_name TEXT,
  source_url TEXT,
  difficulty TEXT NOT NULL DEFAULT 'medium',
  leftovers_score INTEGER NOT NULL DEFAULT 0,
  seasonal_tags TEXT NOT NULL DEFAULT '[]',
  frequency_cap_per_month INTEGER,
  total_time_minutes INTEGER,
  frequency_preference TEXT,
  notes TEXT
);

-- ===== RECIPE INGREDIENTS =====
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id SERIAL PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other'
);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id ON recipe_ingredients(recipe_id);

-- ===== FAMILY MEMBERS =====
CREATE TABLE IF NOT EXISTS family_members (
  id SERIAL PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  dietary_style TEXT NOT NULL DEFAULT 'omnivore'
    CHECK (dietary_style IN ('omnivore', 'vegetarian', 'vegan')),
  allergies TEXT NOT NULL DEFAULT '[]',
  dislikes TEXT NOT NULL DEFAULT '[]',
  favorites TEXT NOT NULL DEFAULT '[]',
  no_spicy BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_family_members_family_id ON family_members(family_id);

-- ===== MEAL PLANS =====
CREATE TABLE IF NOT EXISTS meal_plans (
  id SERIAL PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id),
  week_start TEXT,
  variant INTEGER NOT NULL DEFAULT 0,
  settings_snapshot TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_plans_family_week_variant
  ON meal_plans(family_id, week_start, variant);
CREATE INDEX IF NOT EXISTS idx_meal_plans_week ON meal_plans(week_start);

-- ===== MEAL PLAN ITEMS =====
CREATE TABLE IF NOT EXISTS meal_plan_items (
  id SERIAL PRIMARY KEY,
  meal_plan_id INTEGER NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  recipe_id INTEGER REFERENCES recipes(id),
  locked BOOLEAN NOT NULL DEFAULT FALSE,
  lunch_leftover_label TEXT,
  notes TEXT,
  leftover_lunch_recipe_id INTEGER,
  reasons_json TEXT NOT NULL DEFAULT '[]',
  meal_type TEXT NOT NULL DEFAULT 'main',
  main_number INTEGER,
  assigned_member_ids TEXT,
  parent_meal_item_id INTEGER REFERENCES meal_plan_items(id) ON DELETE CASCADE,
  is_custom BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_mpi_plan ON meal_plan_items(meal_plan_id);
CREATE INDEX IF NOT EXISTS idx_mpi_recipe ON meal_plan_items(recipe_id);
CREATE INDEX IF NOT EXISTS idx_meal_plan_items_parent ON meal_plan_items(parent_meal_item_id);
CREATE INDEX IF NOT EXISTS idx_meal_plan_items_type ON meal_plan_items(meal_type);

-- ===== FAMILY FAVORITE CHEFS =====
CREATE TABLE IF NOT EXISTS family_favorite_chefs (
  id SERIAL PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cuisines TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fav_chefs_family ON family_favorite_chefs(family_id);

-- ===== FAMILY FAVORITE MEALS =====
CREATE TABLE IF NOT EXISTS family_favorite_meals (
  id SERIAL PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  recipe_url TEXT,
  difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')),
  total_time_minutes INTEGER,
  frequency_preference TEXT CHECK (frequency_preference IN ('always', 'weekly', 'twice_month', 'monthly', 'bimonthly', 'rarely')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fav_meals_family ON family_favorite_meals(family_id);

-- ===== FAMILY FAVORITE SIDES =====
CREATE TABLE IF NOT EXISTS family_favorite_sides (
  id SERIAL PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  recipe_url TEXT,
  category TEXT,
  pairs_well_with TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fav_sides_family ON family_favorite_sides(family_id);

-- ===== FAMILY FAVORITE WEBSITES =====
CREATE TABLE IF NOT EXISTS family_favorite_websites (
  id SERIAL PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===== WEEKLY COOKING SCHEDULE =====
CREATE TABLE IF NOT EXISTS weekly_cooking_schedule (
  id SERIAL PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  week_start TEXT NOT NULL,
  day TEXT NOT NULL CHECK (day IN ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')),
  is_cooking BOOLEAN NOT NULL DEFAULT FALSE,
  meal_mode TEXT CHECK (meal_mode IN ('one_main', 'customize_mains')),
  num_mains INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(family_id, week_start, day)
);
CREATE INDEX IF NOT EXISTS idx_cooking_schedule_family_week ON weekly_cooking_schedule(family_id, week_start);

-- ===== COOKING DAY MAIN ASSIGNMENTS =====
CREATE TABLE IF NOT EXISTS cooking_day_main_assignments (
  id SERIAL PRIMARY KEY,
  schedule_id INTEGER NOT NULL REFERENCES weekly_cooking_schedule(id) ON DELETE CASCADE,
  main_number INTEGER NOT NULL CHECK (main_number > 0),
  member_ids TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_main_assignments_schedule ON cooking_day_main_assignments(schedule_id);

-- ===== WEEKLY LUNCH NEEDS =====
CREATE TABLE IF NOT EXISTS weekly_lunch_needs (
  id SERIAL PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  week_start TEXT NOT NULL,
  member_id INTEGER NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  day TEXT NOT NULL CHECK (day IN ('monday','tuesday','wednesday','thursday','friday')),
  needs_lunch BOOLEAN NOT NULL DEFAULT FALSE,
  leftovers_ok BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(family_id, week_start, member_id, day)
);
CREATE INDEX IF NOT EXISTS idx_lunch_needs_family_week ON weekly_lunch_needs(family_id, week_start);
CREATE INDEX IF NOT EXISTS idx_lunch_needs_member ON weekly_lunch_needs(member_id);

-- ===== SIDES LIBRARY =====
CREATE TABLE IF NOT EXISTS sides_library (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('veggie','salad','starch','grain','bread','fruit','other')),
  weight TEXT NOT NULL CHECK (weight IN ('light','medium','heavy')),
  cuisine_affinity TEXT,
  avoid_with_main_types TEXT,
  prep_time_minutes INTEGER,
  vegetarian BOOLEAN NOT NULL DEFAULT TRUE,
  ingredients TEXT,
  recipe_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sides_category ON sides_library(category);
CREATE INDEX IF NOT EXISTS idx_sides_weight ON sides_library(weight);

-- Seed sides library
INSERT INTO sides_library (name, category, weight, cuisine_affinity, vegetarian, prep_time_minutes) VALUES
  ('Green Salad', 'salad', 'light', '[]', TRUE, 10),
  ('Caesar Salad', 'salad', 'light', '["italian","american"]', TRUE, 15),
  ('Roasted Broccoli', 'veggie', 'light', '[]', TRUE, 25),
  ('Steamed Green Beans', 'veggie', 'light', '[]', TRUE, 10),
  ('Mashed Potatoes', 'starch', 'heavy', '["american"]', TRUE, 30),
  ('Roasted Potatoes', 'starch', 'medium', '[]', TRUE, 40),
  ('White Rice', 'grain', 'medium', '["asian","mexican","indian"]', TRUE, 20),
  ('Brown Rice', 'grain', 'medium', '["asian"]', TRUE, 45),
  ('Garlic Bread', 'bread', 'medium', '["italian"]', TRUE, 15),
  ('Dinner Rolls', 'bread', 'medium', '["american"]', TRUE, 5),
  ('Corn on the Cob', 'veggie', 'medium', '["american","mexican"]', TRUE, 15),
  ('Coleslaw', 'salad', 'light', '["american"]', TRUE, 15),
  ('Caprese Salad', 'salad', 'light', '["italian"]', TRUE, 10),
  ('Quinoa Pilaf', 'grain', 'medium', '[]', TRUE, 25),
  ('Sautéed Spinach', 'veggie', 'light', '["italian","mediterranean"]', TRUE, 10),
  ('Roasted Brussels Sprouts', 'veggie', 'medium', '[]', TRUE, 30),
  ('Sweet Potato Fries', 'starch', 'medium', '["american"]', TRUE, 35),
  ('Cucumber Salad', 'salad', 'light', '["asian","mediterranean"]', TRUE, 10),
  ('French Fries', 'starch', 'heavy', '["american","french"]', TRUE, 30),
  ('Grilled Asparagus', 'veggie', 'light', '["italian","french"]', TRUE, 15)
ON CONFLICT DO NOTHING;

-- ===== RECIPE USAGE HISTORY =====
CREATE TABLE IF NOT EXISTS recipe_usage_history (
  id SERIAL PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  recipe_id INTEGER REFERENCES recipes(id) ON DELETE CASCADE,
  favorite_meal_id INTEGER REFERENCES family_favorite_meals(id) ON DELETE CASCADE,
  used_date TEXT NOT NULL,
  meal_plan_id INTEGER REFERENCES meal_plans(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((recipe_id IS NOT NULL AND favorite_meal_id IS NULL) OR (recipe_id IS NULL AND favorite_meal_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_recipe_usage_family ON recipe_usage_history(family_id);
CREATE INDEX IF NOT EXISTS idx_recipe_usage_recipe ON recipe_usage_history(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_usage_favorite ON recipe_usage_history(favorite_meal_id);
CREATE INDEX IF NOT EXISTS idx_recipe_usage_date ON recipe_usage_history(used_date);

-- ===== SIDE INGREDIENTS =====
CREATE TABLE IF NOT EXISTS side_ingredients (
  id SERIAL PRIMARY KEY,
  side_library_id INTEGER REFERENCES sides_library(id),
  side_name TEXT,
  item TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  category TEXT NOT NULL,
  servings INTEGER NOT NULL DEFAULT 4,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_side_ingredients_library_id ON side_ingredients(side_library_id);
CREATE INDEX IF NOT EXISTS idx_side_ingredients_name ON side_ingredients(side_name);
