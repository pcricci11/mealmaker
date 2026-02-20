-- Migration 005: Add welcome carousel tracking flag
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_seen_welcome BOOLEAN NOT NULL DEFAULT FALSE;
