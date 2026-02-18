// services/sideSelector.ts
// Smart side selection based on main dish characteristics

import { query } from "../db";

interface MainDish {
  id: number;
  name: string;
  cuisine: string;
  ingredients: any[];
  tags: string[];
}

interface Side {
  id: number;
  name: string;
  category: string;
  weight: string; // light, medium, heavy
  cuisine_affinity: string[] | null;
  avoid_with_main_types: string[] | null;
}

export async function selectSmartSides(
  mainDish: MainDish,
  count: number = 1,
  excludeIds: number[] = []
): Promise<Side[]> {
  // Analyze main dish characteristics
  const mainWeight = determineMainWeight(mainDish);
  const mainCategories = categorizeMain(mainDish);

  // Build query with constraints
  let sql = `
    SELECT id, name, category, weight, cuisine_affinity, avoid_with_main_types
    FROM sides_library
    WHERE 1=1
  `;

  const params: any[] = [];
  let paramIndex = 1;

  // Exclude already used sides
  if (excludeIds.length > 0) {
    const placeholders = excludeIds.map((_, i) => `$${paramIndex + i}`).join(",");
    sql += ` AND id NOT IN (${placeholders})`;
    params.push(...excludeIds);
    paramIndex += excludeIds.length;
  }

  // Weight matching: heavy main → light side
  if (mainWeight === "heavy") {
    sql += ` AND weight = 'light'`;
  } else if (mainWeight === "light") {
    sql += ` AND weight IN ('medium', 'heavy')`;
  }

  // Get all potential sides
  const allSides: Side[] = (await query(sql, params)).map((s: any) => ({
    ...s,
    cuisine_affinity: s.cuisine_affinity
      ? JSON.parse(s.cuisine_affinity)
      : null,
    avoid_with_main_types: s.avoid_with_main_types
      ? JSON.parse(s.avoid_with_main_types)
      : null,
  }));

  // Score each side
  const scored = allSides.map((side) => {
    let score = 100;

    // Cuisine matching
    if (
      side.cuisine_affinity &&
      side.cuisine_affinity.includes(mainDish.cuisine)
    ) {
      score += 50;
    }

    // Avoid certain combinations
    if (side.avoid_with_main_types) {
      for (const avoidType of side.avoid_with_main_types) {
        if (mainCategories.includes(avoidType)) {
          score -= 100; // Strong penalty
        }
      }
    }

    // Category diversity
    if (side.category === "veggie" || side.category === "salad") {
      score += 20; // Prefer veggies/salads
    }

    return { side, score };
  });

  // Sort by score and select top N
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, count).map((s) => s.side);
}

function determineMainWeight(main: MainDish): "light" | "medium" | "heavy" {
  const ingredientNames = main.ingredients
    .map((i) => i.name.toLowerCase())
    .join(" ");

  // Heavy indicators
  if (
    ingredientNames.includes("pasta") ||
    ingredientNames.includes("rice") ||
    ingredientNames.includes("potato") ||
    ingredientNames.includes("bread")
  ) {
    return "heavy";
  }

  // Light indicators
  if (
    ingredientNames.includes("salad") ||
    ingredientNames.includes("soup") ||
    main.tags.includes("light")
  ) {
    return "light";
  }

  return "medium";
}

function categorizeMain(main: MainDish): string[] {
  const categories: string[] = [];
  const ingredientNames = main.ingredients
    .map((i) => i.name.toLowerCase())
    .join(" ");

  if (ingredientNames.includes("pasta")) categories.push("pasta");
  if (ingredientNames.includes("rice")) categories.push("rice");
  if (ingredientNames.includes("potato")) categories.push("potatoes");
  if (ingredientNames.includes("quinoa")) categories.push("quinoa");
  if (ingredientNames.includes("bread")) categories.push("bread");

  return categories;
}
