-- 012_lunch_planning.sql
-- Stores lunch needs for each family member on each weekday

CREATE TABLE IF NOT EXISTS weekly_lunch_needs (
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  week_start TEXT NOT NULL,     -- YYYY-MM-DD (Monday of the week)
  member_id INTEGER NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  day TEXT NOT NULL,            -- monday, tuesday, wednesday, thursday, friday
  needs_lunch INTEGER NOT NULL DEFAULT 0,     -- 0 = no, 1 = yes
  leftovers_ok INTEGER NOT NULL DEFAULT 0,    -- 0 = no, 1 = yes
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (day IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday')),
  UNIQUE(family_id, week_start, member_id, day)
);

CREATE INDEX IF NOT EXISTS idx_lunch_needs_family_week ON weekly_lunch_needs(family_id, week_start);
CREATE INDEX IF NOT EXISTS idx_lunch_needs_member ON weekly_lunch_needs(member_id);
