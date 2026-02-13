-- 011_weekly_cooking_schedule.sql
-- Stores which days family is cooking and meal configuration

CREATE TABLE IF NOT EXISTS weekly_cooking_schedule (
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  week_start TEXT NOT NULL,  -- YYYY-MM-DD (Monday of the week)
  day TEXT NOT NULL,         -- monday, tuesday, wednesday, etc.
  is_cooking INTEGER NOT NULL DEFAULT 0,  -- 0 = not cooking, 1 = cooking
  meal_mode TEXT,            -- 'one_main' or 'customize_mains'
  num_mains INTEGER,         -- Number of different mains if customize_mains
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (day IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')),
  CHECK (meal_mode IS NULL OR meal_mode IN ('one_main', 'customize_mains')),
  UNIQUE(family_id, week_start, day)
);

-- Stores which family members are assigned to which main for each cooking day
CREATE TABLE IF NOT EXISTS cooking_day_main_assignments (
  id INTEGER PRIMARY KEY,
  schedule_id INTEGER NOT NULL REFERENCES weekly_cooking_schedule(id) ON DELETE CASCADE,
  main_number INTEGER NOT NULL,  -- 1, 2, 3, etc.
  member_ids TEXT NOT NULL,      -- JSON array of family member IDs
  CHECK (main_number > 0)
);

CREATE INDEX IF NOT EXISTS idx_cooking_schedule_family_week ON weekly_cooking_schedule(family_id, week_start);
CREATE INDEX IF NOT EXISTS idx_main_assignments_schedule ON cooking_day_main_assignments(schedule_id);
