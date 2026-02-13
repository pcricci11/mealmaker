-- 007_enhance_family_members.sql
-- Add no_spicy preference and ensure all dietary fields exist

ALTER TABLE family_members ADD COLUMN no_spicy INTEGER NOT NULL DEFAULT 0;

-- Note: allergies, dislikes, favorites already exist in your schema as TEXT (JSON arrays)
-- dietary_style already exists (omnivore, vegetarian, vegan)
