-- 010_serving_multiplier.sql
-- Add serving multiplier to families table

ALTER TABLE families ADD COLUMN serving_multiplier TEXT NOT NULL DEFAULT 'normal';

-- Values: 'normal' (1x), 'hearty' (1.5x), 'extra_large' (2x)
-- Check constraint for SQLite 3.37+:
-- CHECK (serving_multiplier IN ('normal', 'hearty', 'extra_large'))
