import type { Recipe } from "../../shared/types";

/** Convert a raw SQLite row into a typed Recipe. DB column `name` maps to `title`. */
export function rowToRecipe(row: any): Recipe {
  return {
    id: row.id,
    title: row.name,
    cuisine: row.cuisine,
    vegetarian: !!row.vegetarian,
    protein_type: row.protein_type,
    cook_minutes: row.cook_minutes,
    allergens: JSON.parse(row.allergens),
    kid_friendly: !!row.kid_friendly,
    makes_leftovers: !!row.makes_leftovers,
    leftovers_score: row.leftovers_score ?? 0,
    ingredients: JSON.parse(row.ingredients),
    tags: JSON.parse(row.tags),
    source_type: row.source_type ?? "seeded",
    source_name: row.source_name ?? null,
    source_url: row.source_url ?? null,
    difficulty: row.difficulty ?? "medium",
    seasonal_tags: JSON.parse(row.seasonal_tags ?? "[]"),
    frequency_cap_per_month: row.frequency_cap_per_month ?? null,
  };
}
