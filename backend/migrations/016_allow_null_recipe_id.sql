-- Allow meal_plan_items.recipe_id to be NULL for side items
-- SQLite doesn't support ALTER COLUMN, so we recreate the table

CREATE TABLE meal_plan_items_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meal_plan_id INTEGER NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  recipe_id INTEGER REFERENCES recipes(id),
  locked INTEGER NOT NULL DEFAULT 0,
  lunch_leftover_label TEXT,
  notes TEXT,
  leftover_lunch_recipe_id INTEGER,
  reasons_json TEXT NOT NULL DEFAULT '[]',
  meal_type TEXT NOT NULL DEFAULT 'main',
  main_number INTEGER,
  assigned_member_ids TEXT,
  parent_meal_item_id INTEGER,
  is_custom INTEGER NOT NULL DEFAULT 0
);

INSERT INTO meal_plan_items_new
  SELECT * FROM meal_plan_items;

DROP TABLE meal_plan_items;

ALTER TABLE meal_plan_items_new RENAME TO meal_plan_items;

CREATE INDEX IF NOT EXISTS idx_mpi_plan ON meal_plan_items(meal_plan_id);
CREATE INDEX IF NOT EXISTS idx_mpi_recipe ON meal_plan_items(recipe_id);
