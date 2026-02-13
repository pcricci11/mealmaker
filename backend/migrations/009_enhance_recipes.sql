-- 009_enhance_recipes.sql
-- Add difficulty, total time, and frequency preference to recipes

ALTER TABLE recipes ADD COLUMN total_time_minutes INTEGER;
ALTER TABLE recipes ADD COLUMN frequency_preference TEXT;

-- Note: difficulty already exists in your schema from migration 003
-- But let's ensure the constraint is correct
-- SQLite doesn't support modifying constraints, so we document it here:
-- difficulty should be CHECK (difficulty IN ('easy', 'medium', 'hard'))
-- frequency_preference should be CHECK (frequency_preference IN ('always', 'weekly', 'twice_month', 'monthly', 'bimonthly', 'rarely'))

-- For new tables, we'll enforce these constraints
-- For existing data, validation happens in the backend
