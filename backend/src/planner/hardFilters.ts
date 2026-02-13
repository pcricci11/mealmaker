import type { Recipe, Family, FamilyMember } from "../../../shared/types";
import type { FilterResult } from "./types";

/**
 * Apply hard filters that eliminate recipes entirely.
 *
 * Rules:
 * - Allergies are ALWAYS hard exclusions (family-level + all member-level), regardless of planning_mode.
 * - Family dietary flags (gluten_free, dairy_free, nut_free) are always hard.
 * - Picky kid mode: only kid_friendly recipes.
 * - strictest_household: enforce the strictest member dietary_style as a hard rule.
 *   Hierarchy: vegan > vegetarian > omnivore.
 * - split_household: dietary_style is NOT a hard filter (handled as soft scoring).
 */
export function applyHardFilters(
  recipes: Recipe[],
  family: Family,
  members: FamilyMember[],
): FilterResult {
  const passed: Recipe[] = [];
  const excluded: FilterResult["excluded"] = [];

  // Collect ALL allergies: family-level + every member
  const allAllergies = new Set<string>(
    family.allergies.map((a) => a.toLowerCase()),
  );
  for (const m of members) {
    for (const a of m.allergies) {
      allAllergies.add(a.toLowerCase());
    }
  }

  // Determine strictest dietary style across members (only for strictest_household)
  let strictestStyle: "omnivore" | "vegetarian" | "vegan" = "omnivore";
  if (family.planning_mode === "strictest_household" && members.length > 0) {
    for (const m of members) {
      if (m.dietary_style === "vegan") {
        strictestStyle = "vegan";
        break; // can't get stricter
      }
      if (m.dietary_style === "vegetarian") {
        strictestStyle = "vegetarian";
      }
    }
  }

  for (const r of recipes) {
    const recipeAllergens = r.allergens.map((a) => a.toLowerCase());

    // Allergen check — always hard
    const matchedAllergen = recipeAllergens.find((a) => allAllergies.has(a));
    if (matchedAllergen) {
      excluded.push({ recipe: r, reason: "ALLERGEN_MATCH" });
      continue;
    }

    // Family dietary flags — always hard
    if (family.gluten_free && recipeAllergens.includes("gluten")) {
      excluded.push({ recipe: r, reason: "GLUTEN_FREE" });
      continue;
    }
    if (family.dairy_free && recipeAllergens.includes("dairy")) {
      excluded.push({ recipe: r, reason: "DAIRY_FREE" });
      continue;
    }
    if (family.nut_free && recipeAllergens.includes("nuts")) {
      excluded.push({ recipe: r, reason: "NUT_FREE" });
      continue;
    }

    // Picky kid mode — always hard
    if (family.picky_kid_mode && !r.kid_friendly) {
      excluded.push({ recipe: r, reason: "NOT_KID_FRIENDLY" });
      continue;
    }

    // Dietary style enforcement (strictest_household only)
    if (family.planning_mode === "strictest_household") {
      if (strictestStyle === "vegan") {
        // Vegan: must be vegetarian AND no dairy/eggs allergens
        if (!r.vegetarian || recipeAllergens.includes("dairy") || recipeAllergens.includes("eggs")) {
          excluded.push({ recipe: r, reason: "VEGAN_HOUSEHOLD" });
          continue;
        }
      } else if (strictestStyle === "vegetarian") {
        if (!r.vegetarian) {
          excluded.push({ recipe: r, reason: "VEGETARIAN_HOUSEHOLD" });
          continue;
        }
      }
    }

    passed.push(r);
  }

  return { passed, excluded };
}

/** Filter by cook time for a specific day. */
export function filterByCookTime(
  recipes: Recipe[],
  maxMinutes: number,
): FilterResult {
  const passed: Recipe[] = [];
  const excluded: FilterResult["excluded"] = [];

  for (const r of recipes) {
    if (r.cook_minutes <= maxMinutes) {
      passed.push(r);
    } else {
      excluded.push({ recipe: r, reason: "COOK_TIME" });
    }
  }

  return { passed, excluded };
}
