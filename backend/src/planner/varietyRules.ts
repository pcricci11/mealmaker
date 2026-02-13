import type { ScoreModifier } from "./types";

const SAME_CUISINE_PENALTY = -50;
const SAME_PROTEIN_PENALTY = -40;
const REPEAT_RECIPE_PENALTY = -100;

/** No same cuisine as the immediately preceding day. */
export const penalizeSameCuisine: ScoreModifier = (recipe, _ctx, currentPlan) => {
  if (currentPlan.length === 0) return { delta: 0 };
  const prev = currentPlan[currentPlan.length - 1];
  if (prev.recipe.cuisine === recipe.cuisine) {
    return { delta: SAME_CUISINE_PENALTY, reason: "SAME_CUISINE" };
  }
  return { delta: 0 };
};

/** No same protein type within the last 2 days. */
export const penalizeSameProtein: ScoreModifier = (recipe, _ctx, currentPlan) => {
  if (!recipe.protein_type) return { delta: 0 };
  const recent = currentPlan.slice(-2);
  const match = recent.find((s) => s.recipe.protein_type === recipe.protein_type);
  if (match) {
    return { delta: SAME_PROTEIN_PENALTY, reason: "SAME_PROTEIN" };
  }
  return { delta: 0 };
};

/** Penalize recipes already used this week. */
export const penalizeRepeat: ScoreModifier = (recipe, _ctx, currentPlan) => {
  if (currentPlan.some((s) => s.recipe.id === recipe.id)) {
    return { delta: REPEAT_RECIPE_PENALTY, reason: "REPEAT_RECIPE" };
  }
  return { delta: 0 };
};
