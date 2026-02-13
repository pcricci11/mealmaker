import type { ScoreModifier } from "./types";

const FAVORITE_BOOST = 20;
const DISLIKE_PENALTY = -30;
const DIETARY_MISMATCH_PENALTY = -25;

/** Boost recipes that are favorited by family members. */
export const scoreFavorites: ScoreModifier = (recipe, context) => {
  const count = context.members.filter((m) =>
    m.favorites.some(
      (f) => f.toLowerCase() === recipe.title.toLowerCase() || f === String(recipe.id),
    ),
  ).length;

  if (count > 0) {
    return { delta: FAVORITE_BOOST * count, reason: "FAVORITE" };
  }
  return { delta: 0 };
};

/** Penalize recipes that are disliked by family members. */
export const scoreDislikes: ScoreModifier = (recipe, context) => {
  const count = context.members.filter((m) =>
    m.dislikes.some(
      (d) => d.toLowerCase() === recipe.title.toLowerCase() || d === String(recipe.id),
    ),
  ).length;

  if (count > 0) {
    return { delta: DISLIKE_PENALTY * count, reason: "DISLIKED" };
  }
  return { delta: 0 };
};

/**
 * In split_household mode, penalize recipes that conflict with member dietary styles.
 * This is a soft penalty, not a hard exclusion.
 */
export const scoreDietaryMismatch: ScoreModifier = (recipe, context) => {
  if (context.family.planning_mode !== "split_household") return { delta: 0 };

  let penalty = 0;
  for (const m of context.members) {
    if (m.dietary_style === "vegan") {
      const allergens = recipe.allergens.map((a) => a.toLowerCase());
      if (!recipe.vegetarian || allergens.includes("dairy") || allergens.includes("eggs")) {
        penalty += DIETARY_MISMATCH_PENALTY;
      }
    } else if (m.dietary_style === "vegetarian") {
      if (!recipe.vegetarian) {
        penalty += DIETARY_MISMATCH_PENALTY;
      }
    }
  }

  if (penalty < 0) {
    return { delta: penalty, reason: "DISLIKED" };
  }
  return { delta: 0 };
};
