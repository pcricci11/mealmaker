-- 004_extend_meal_plans.sql

ALTER TABLE meal_plans ADD COLUMN week_start TEXT;
ALTER TABLE meal_plans ADD COLUMN settings_snapshot TEXT;

-- Prevent duplicate plans for the same family + week
CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_plans_family_week
  ON meal_plans(family_id, week_start);

ALTER TABLE meal_plan_items ADD COLUMN notes TEXT;
ALTER TABLE meal_plan_items ADD COLUMN leftover_lunch_recipe_id INTEGER REFERENCES recipes(id);
