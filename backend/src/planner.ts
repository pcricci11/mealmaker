import type { Family, Recipe, DayOfWeek } from "../../shared/types";

const DAYS: DayOfWeek[] = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
];

const WEEKEND_DAYS = new Set<DayOfWeek>(["saturday", "sunday"]);

interface PlanSlot {
  day: DayOfWeek;
  recipe: Recipe;
  locked: boolean;
  lunch_leftover_label: string | null;
}

/**
 * Deterministic meal planner. No external APIs, no randomness beyond shuffling.
 * Steps:
 *  1. Filter recipes by hard constraints (allergies, dietary, kid mode)
 *  2. Partition into weekday-eligible and weekend-eligible by cook time
 *  3. Decide which days need vegetarian meals to hit the ratio
 *  4. Pick leftover-producing meals for the required number of leftover nights
 *  5. Fill remaining days with variety: no same cuisine back-to-back, avoid repeating protein within 2 days
 */
export function generatePlan(
  family: Family,
  allRecipes: Recipe[],
  locks: Partial<Record<DayOfWeek, number>> = {},
): PlanSlot[] {
  // ── Step 1: Hard-filter recipes ──
  const eligible = allRecipes.filter((r) => {
    // Check allergies
    for (const allergy of family.allergies) {
      if (r.allergens.map((a) => a.toLowerCase()).includes(allergy.toLowerCase())) {
        return false;
      }
    }
    // Gluten-free
    if (family.gluten_free && r.allergens.includes("gluten")) return false;
    // Dairy-free
    if (family.dairy_free && r.allergens.includes("dairy")) return false;
    // Nut-free
    if (family.nut_free && r.allergens.includes("nuts")) return false;
    // Picky kid mode: only kid-friendly
    if (family.picky_kid_mode && !r.kid_friendly) return false;
    return true;
  });

  if (eligible.length === 0) {
    throw new Error("No recipes match the family's dietary restrictions. Try relaxing some constraints.");
  }

  // ── Step 2: Determine veg/meat day count ──
  const vegDays = Math.round((family.vegetarian_ratio / 100) * 7);
  const meatDays = 7 - vegDays;

  const vegRecipes = eligible.filter((r) => r.vegetarian);
  const meatRecipes = eligible.filter((r) => !r.vegetarian);

  // ── Step 3: Build the plan day by day ──
  const plan: PlanSlot[] = [];
  const usedRecipeIds = new Set<number>();

  // Pre-populate locked slots
  for (const day of DAYS) {
    if (locks[day] !== undefined) {
      const recipe = allRecipes.find((r) => r.id === locks[day]);
      if (recipe) {
        plan.push({ day, recipe, locked: true, lunch_leftover_label: null });
        usedRecipeIds.add(recipe.id);
      }
    }
  }

  // Decide which unlocked days should be vegetarian
  const lockedVegCount = plan.filter((s) => s.recipe.vegetarian).length;
  const lockedMeatCount = plan.filter((s) => !s.recipe.vegetarian).length;
  const unlockedDays = DAYS.filter((d) => !locks[d]);
  let remainingVeg = Math.max(0, vegDays - lockedVegCount);
  let remainingMeat = Math.max(0, meatDays - lockedMeatCount);

  // Adjust if locked meals threw off the ratio
  const totalUnlocked = unlockedDays.length;
  if (remainingVeg + remainingMeat !== totalUnlocked) {
    remainingVeg = Math.min(remainingVeg, totalUnlocked);
    remainingMeat = totalUnlocked - remainingVeg;
  }

  // Assign veg/meat to unlocked days, spreading them out
  const dayNeedsVeg = new Map<DayOfWeek, boolean>();
  let vegAssigned = 0;
  for (const day of unlockedDays) {
    if (vegAssigned < remainingVeg) {
      dayNeedsVeg.set(day, true);
      vegAssigned++;
    } else {
      dayNeedsVeg.set(day, false);
    }
  }

  // ── Step 4: Pick leftover meals ──
  const leftoverCount = family.leftovers_nights_per_week;
  const leftoverDays = new Set<DayOfWeek>();
  let leftoversPicked = 0;

  // Prefer weekdays (Mon-Thu) for leftovers so lunch the next day works
  const leftoverCandidateDays = unlockedDays.filter(
    (d) => !WEEKEND_DAYS.has(d) && d !== "friday" && d !== "sunday"
  );
  for (const day of leftoverCandidateDays) {
    if (leftoversPicked >= leftoverCount) break;
    leftoverDays.add(day);
    leftoversPicked++;
  }

  // ── Step 5: Fill each unlocked day ──
  // Seeded shuffle for consistent-ish but varied results
  const shuffled = <T>(arr: T[]): T[] => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  for (const day of unlockedDays) {
    const isWeekend = WEEKEND_DAYS.has(day);
    const maxTime = isWeekend ? family.max_cook_minutes_weekend : family.max_cook_minutes_weekday;
    const wantsVeg = dayNeedsVeg.get(day) ?? false;
    const wantsLeftovers = leftoverDays.has(day);

    // Get the candidate pool
    let pool = wantsVeg ? [...vegRecipes] : [...meatRecipes];

    // Fallback: if pool is empty, use all eligible
    if (pool.length === 0) pool = [...eligible];

    // Filter by cook time
    pool = pool.filter((r) => r.cook_minutes <= maxTime);

    // Filter out already-used recipes (prefer unique meals)
    let fresh = pool.filter((r) => !usedRecipeIds.has(r.id));
    if (fresh.length === 0) fresh = pool; // Allow repeats if we must

    // Prefer leftover-producing recipes if needed
    if (wantsLeftovers) {
      const leftoverPool = fresh.filter((r) => r.makes_leftovers);
      if (leftoverPool.length > 0) fresh = leftoverPool;
    }

    // Apply variety rules
    const recentSlots = plan.slice(-2);
    const recentCuisines = recentSlots.map((s) => s.recipe.cuisine);
    const recentProteins = recentSlots.map((s) => s.recipe.protein_type).filter(Boolean);

    let candidates = fresh.filter((r) => {
      // No same cuisine as last slot
      if (recentCuisines.length > 0 && r.cuisine === recentCuisines[recentCuisines.length - 1]) return false;
      // No same protein within last 2
      if (r.protein_type && recentProteins.includes(r.protein_type)) return false;
      return true;
    });

    // Relax if too restrictive
    if (candidates.length === 0) candidates = fresh;

    // Pick from shuffled candidates
    const shuffledCandidates = shuffled(candidates);
    const pick = shuffledCandidates[0];

    let leftoverLabel: string | null = null;
    if (wantsLeftovers && pick.makes_leftovers) {
      leftoverLabel = `Leftover ${pick.name} for lunch`;
    }

    plan.push({
      day,
      recipe: pick,
      locked: false,
      lunch_leftover_label: leftoverLabel,
    });
    usedRecipeIds.add(pick.id);
  }

  // Sort by day order
  plan.sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day));

  return plan;
}
