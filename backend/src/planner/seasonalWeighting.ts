import type { ScoreModifier } from "./types";

const SEASONAL_BOOST = 15;
const OUT_OF_SEASON_PENALTY = -5;

/**
 * Map month numbers (0-11) to seasons.
 * Uses Northern Hemisphere meteorological seasons.
 */
function getCurrentSeason(): string {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  if (month >= 8 && month <= 10) return "fall";
  return "winter";
}

/** Boost in-season recipes, lightly penalize out-of-season ones. */
export const scoreSeasonality: ScoreModifier = (recipe) => {
  if (recipe.seasonal_tags.length === 0) return { delta: 0 };

  const season = getCurrentSeason();

  if (recipe.seasonal_tags.includes(season)) {
    return {
      delta: SEASONAL_BOOST,
      reason: { type: "included", code: "SEASONAL_BOOST", message: `In season (${season})` },
    };
  }

  return {
    delta: OUT_OF_SEASON_PENALTY,
    reason: { type: "info", code: "OUT_OF_SEASON", message: `Out of season (current: ${season})` },
  };
};
