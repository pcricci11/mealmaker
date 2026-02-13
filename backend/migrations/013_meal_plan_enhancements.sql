-- 013_meal_plan_enhancements.sql
-- Support multiple mains per day and sides

-- Add new columns to meal_plan_items
ALTER TABLE meal_plan_items ADD COLUMN meal_type TEXT NOT NULL DEFAULT 'main';
-- Values: 'main', 'side', 'lunch'

ALTER TABLE meal_plan_items ADD COLUMN main_number INTEGER;
-- For multiple mains on same day: 1, 2, 3, etc. NULL for single main days

ALTER TABLE meal_plan_items ADD COLUMN assigned_member_ids TEXT;
-- JSON array of family member IDs who eat this main/meal
-- NULL means everyone eats it

ALTER TABLE meal_plan_items ADD COLUMN parent_meal_item_id INTEGER;
-- For sides: references the main meal item this side belongs to
-- For lunches: references the dinner that created leftovers
-- NULL for main meals

ALTER TABLE meal_plan_items ADD COLUMN is_custom INTEGER NOT NULL DEFAULT 0;
-- 1 if user entered a custom side, 0 if system-suggested

-- Add foreign key for parent relationship
-- Note: SQLite doesn't support ADD CONSTRAINT, so this is documentation
-- FOREIGN KEY (parent_meal_item_id) REFERENCES meal_plan_items(id) ON DELETE CASCADE

-- week_start already exists on meal_plans from migration 004
-- Skipping: ALTER TABLE meal_plans ADD COLUMN week_start TEXT;

-- Add variant to meal_plans (already exists from migration 006, but documenting)
-- variant column allows multiple plans for same week

CREATE INDEX IF NOT EXISTS idx_meal_plan_items_parent ON meal_plan_items(parent_meal_item_id);
CREATE INDEX IF NOT EXISTS idx_meal_plan_items_type ON meal_plan_items(meal_type);
CREATE INDEX IF NOT EXISTS idx_meal_plans_week ON meal_plans(week_start);
