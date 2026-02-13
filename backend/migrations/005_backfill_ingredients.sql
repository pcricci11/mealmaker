-- 005_backfill_ingredients.sql
-- Marker migration. Actual backfill from recipes.ingredients JSON
-- into recipe_ingredients table runs in TypeScript (migrate.ts runBackfills).
SELECT 1;
