import type { DayOfWeek } from "../../../shared/types";
import type { ScoreModifier } from "./types";

const WEEKEND_DAYS = new Set<DayOfWeek>(["saturday", "sunday"]);

/**
 * Pick which days should have leftover-producing meals.
 * Prefer Mon–Thu so next-day lunch works.
 */
export function pickLeftoverDays(
  unlockedDays: DayOfWeek[],
  count: number,
): Set<DayOfWeek> {
  const leftoverDays = new Set<DayOfWeek>();
  const preferred = unlockedDays.filter(
    (d) => !WEEKEND_DAYS.has(d) && d !== "friday" && d !== "sunday",
  );

  let picked = 0;
  for (const day of preferred) {
    if (picked >= count) break;
    leftoverDays.add(day);
    picked++;
  }

  // Fall back to any remaining unlocked days
  if (picked < count) {
    for (const day of unlockedDays) {
      if (picked >= count) break;
      if (!leftoverDays.has(day)) {
        leftoverDays.add(day);
        picked++;
      }
    }
  }

  return leftoverDays;
}

/** Boost recipes with high leftovers_score on designated leftover days. */
export function createLeftoversScorer(leftoverDays: Set<DayOfWeek>): ScoreModifier {
  return (recipe, _ctx, _plan, day) => {
    if (!leftoverDays.has(day)) return { delta: 0 };

    if (recipe.leftovers_score >= 3) {
      return { delta: recipe.leftovers_score * 5, reason: "GOOD_LEFTOVERS" };
    }

    return { delta: -10, reason: "LOW_LEFTOVERS" };
  };
}
