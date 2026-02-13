import type { Recipe } from "../../shared/types";

/** Convert a raw SQLite row into a typed Recipe */
export function rowToRecipe(row: any): Recipe {
  return {
    id: row.id,
    name: row.name,
    cuisine: row.cuisine,
    vegetarian: !!row.vegetarian,
    protein_type: row.protein_type,
    cook_minutes: row.cook_minutes,
    allergens: JSON.parse(row.allergens),
    kid_friendly: !!row.kid_friendly,
    makes_leftovers: !!row.makes_leftovers,
    ingredients: JSON.parse(row.ingredients),
    tags: JSON.parse(row.tags),
  };
}
