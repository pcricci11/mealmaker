import type { DayOfWeek, Family } from "../../../shared/types";

const WEEKEND_DAYS = new Set<DayOfWeek>(["saturday", "sunday"]);

export function isWeekend(day: DayOfWeek): boolean {
  return WEEKEND_DAYS.has(day);
}

export function getMaxCookTime(family: Family, day: DayOfWeek): number {
  return isWeekend(day)
    ? family.max_cook_minutes_weekend
    : family.max_cook_minutes_weekday;
}

/**
 * Determine which unlocked days should be vegetarian based on the ratio.
 * Spreads veg days evenly across the week.
 */
export function assignVegDays(
  unlockedDays: DayOfWeek[],
  lockedVegCount: number,
  totalVegTarget: number,
): Set<DayOfWeek> {
  const remaining = Math.max(0, totalVegTarget - lockedVegCount);
  const vegDays = new Set<DayOfWeek>();

  if (remaining === 0 || unlockedDays.length === 0) return vegDays;

  // Spread veg days evenly
  const step = unlockedDays.length / remaining;
  let assigned = 0;
  for (let i = 0; i < unlockedDays.length && assigned < remaining; i++) {
    if (i >= assigned * step) {
      vegDays.add(unlockedDays[i]);
      assigned++;
    }
  }

  return vegDays;
}
