-- 002_add_family_members.sql

CREATE TABLE IF NOT EXISTS family_members (
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  dietary_style TEXT NOT NULL DEFAULT 'omnivore',
  allergies TEXT NOT NULL DEFAULT '[]',
  dislikes TEXT NOT NULL DEFAULT '[]',
  favorites TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (dietary_style IN ('omnivore', 'vegetarian', 'vegan'))
);

CREATE INDEX IF NOT EXISTS idx_family_members_family_id ON family_members(family_id);
