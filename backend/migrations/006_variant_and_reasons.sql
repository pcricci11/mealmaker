-- 006_variant_and_reasons.sql

-- Drop old unique index that only covered (family_id, week_start)
DROP INDEX IF EXISTS idx_meal_plans_family_week;

-- Add variant column to meal_plans
ALTER TABLE meal_plans ADD COLUMN variant INTEGER NOT NULL DEFAULT 0;

-- Add reasons_json column to meal_plan_items
ALTER TABLE meal_plan_items ADD COLUMN reasons_json TEXT NOT NULL DEFAULT '[]';

-- Create new unique index on (family_id, week_start, variant)
CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_plans_family_week_variant
  ON meal_plans(family_id, week_start, variant);
