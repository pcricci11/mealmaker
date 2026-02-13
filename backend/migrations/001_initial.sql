-- 001_initial.sql
-- Captures the existing schema. For fresh databases, creates all tables.
-- For existing databases with these tables, CREATE IF NOT EXISTS is a no-op.

CREATE TABLE IF NOT EXISTS families (
  id INTEGER PRIMARY KEY,
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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (planning_mode IN ('strictest_household', 'split_household'))
);

CREATE TABLE IF NOT EXISTS recipes (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  cuisine TEXT NOT NULL,
  vegetarian INTEGER NOT NULL DEFAULT 0,
  protein_type TEXT,
  cook_minutes INTEGER NOT NULL,
  allergens TEXT NOT NULL DEFAULT '[]',
  kid_friendly INTEGER NOT NULL DEFAULT 0,
  makes_leftovers INTEGER NOT NULL DEFAULT 0,
  ingredients TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS meal_plans (
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS meal_plan_items (
  id INTEGER PRIMARY KEY,
  meal_plan_id INTEGER NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id),
  locked INTEGER NOT NULL DEFAULT 0,
  lunch_leftover_label TEXT
);
