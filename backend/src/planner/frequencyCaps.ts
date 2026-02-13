import type { ScoreModifier } from "./types";

const FREQUENCY_CAP_PENALTY = -1000;

/**
 * Penalize recipes that have exceeded their frequency_cap_per_month
 * within the trailing 30-day window (recentRecipeHistory).
 */
export const enforceFrequencyCap: ScoreModifier = (recipe, context) => {
  if (recipe.frequency_cap_per_month == null) return { delta: 0 };

  const count = context.recentRecipeHistory.filter((id) => id === recipe.id).length;

  if (count >= recipe.frequency_cap_per_month) {
    return {
      delta: FREQUENCY_CAP_PENALTY,
      reason: {
        type: "excluded",
        code: "FREQUENCY_CAP",
        message: `Used ${count}x in last 30 days (cap: ${recipe.frequency_cap_per_month})`,
      },
    };
  }

  return { delta: 0 };
};
