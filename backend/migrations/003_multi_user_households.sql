-- Migration 003: Multi-user household support

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  clerk_id TEXT UNIQUE NOT NULL,
  email TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE households (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE household_members (
  id SERIAL PRIMARY KEY,
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(household_id, user_id)
);

ALTER TABLE families ADD COLUMN household_id INTEGER REFERENCES households(id);
ALTER TABLE meal_plans ADD COLUMN household_id INTEGER REFERENCES households(id);
ALTER TABLE meal_plans ADD COLUMN created_by INTEGER REFERENCES users(id);
ALTER TABLE recipes ADD COLUMN household_id INTEGER REFERENCES households(id);
ALTER TABLE recipes ADD COLUMN created_by INTEGER REFERENCES users(id);

-- Mark all existing recipes as seed recipes
UPDATE recipes SET is_seed = TRUE WHERE is_seed = FALSE;
