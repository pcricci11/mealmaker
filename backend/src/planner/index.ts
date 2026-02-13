import type { DayOfWeek, Recipe, ReasonCode } from "../../../shared/types";
import { VALID_DAYS } from "../../../shared/types";
import type { PlannerContext, PlanSlot, ScoreModifier, ScoredRecipe } from "./types";
import { createRng, seededShuffle } from "./seededRandom";
import { applyHardFilters, filterByCookTime } from "./hardFilters";
import { scoreFavorites, scoreDislikes, scoreDietaryMismatch } from "./softScoring";
import { penalizeSameCuisine, penalizeSameProtein, penalizeRepeat } from "./varietyRules";
import { isWeekend, getMaxCookTime, assignVegDays } from "./scheduleRules";
import { pickLeftoverDays, createLeftoversScorer } from "./leftoversRules";
import { enforceFrequencyCap } from "./frequencyCaps";
import { scoreSeasonality } from "./seasonalWeighting";

const TOP_CANDIDATE_THRESHOLD = 10; // within 10pts of best score

/**
 * Main planner orchestrator.
 *
 * Flow:
 *  1. Hard-filter recipes once (allergens, dietary flags, picky-kid, dietary-style in strictest mode)
 *  2. Pre-populate locked slots
 *  3. Determine veg days and leftover days
 *  4. For each unlocked day: filter by cook time → score all candidates → pick from top band via seeded shuffle
 *  5. Return plan slots with reason codes
 */
export function generatePlan(ctx: PlannerContext): PlanSlot[] {
  const rng = createRng(ctx.seed);

  // ── Step 1: Hard filter (runs once) ──
  const { passed: eligible } = applyHardFilters(ctx.allRecipes, ctx.family, ctx.members);

  if (eligible.length === 0) {
    throw new Error("No recipes match the family's dietary restrictions. Try relaxing some constraints.");
  }

  // ── Step 2: Pre-populate locked slots ──
  const plan: PlanSlot[] = [];
  const unlockedDays: DayOfWeek[] = [];

  for (const day of VALID_DAYS) {
    const lockedRecipeId = ctx.locks[day];
    if (lockedRecipeId !== undefined) {
      const recipe = ctx.allRecipes.find((r) => r.id === lockedRecipeId);
      if (recipe) {
        plan.push({
          day,
          recipe,
          locked: true,
          lunch_leftover_label: null,
          leftover_lunch_recipe_id: null,
          reasons: [{ type: "info", code: "LOCKED", message: "Locked by user" }],
        });
        continue;
      }
    }
    unlockedDays.push(day);
  }

  // ── Step 3: Determine veg days and leftover days ──
  const lockedVegCount = plan.filter((s) => s.recipe.vegetarian).length;
  const totalVegTarget = Math.round((ctx.family.vegetarian_ratio / 100) * 7);
  const vegDays = assignVegDays(unlockedDays, lockedVegCount, totalVegTarget);

  const leftoverDays = pickLeftoverDays(unlockedDays, ctx.family.leftovers_nights_per_week);
  const leftoversScorer = createLeftoversScorer(leftoverDays);

  // ── Step 4: Assemble score modifiers ──
  const modifiers: ScoreModifier[] = [
    scoreFavorites,
    scoreDislikes,
    scoreDietaryMismatch,
    penalizeSameCuisine,
    penalizeSameProtein,
    penalizeRepeat,
    leftoversScorer,
    enforceFrequencyCap,
    scoreSeasonality,
  ];

  // ── Step 5: Fill each unlocked day ──
  for (const day of unlockedDays) {
    const maxTime = getMaxCookTime(ctx.family, day);
    const { passed: timeSuitable } = filterByCookTime(eligible, maxTime);

    if (timeSuitable.length === 0) {
      // Fallback: use any eligible recipe regardless of cook time
      const pick = selectBestCandidate(eligible, day, ctx, plan, modifiers, vegDays, rng);
      plan.push(buildSlot(day, pick, leftoverDays));
      continue;
    }

    const pick = selectBestCandidate(timeSuitable, day, ctx, plan, modifiers, vegDays, rng);
    plan.push(buildSlot(day, pick, leftoverDays));
  }

  // Sort by day order
  plan.sort((a, b) => VALID_DAYS.indexOf(a.day) - VALID_DAYS.indexOf(b.day));

  return plan;
}

/**
 * Score all candidates for a given day, then pick from the top band
 * (within TOP_CANDIDATE_THRESHOLD of the best score) via seeded shuffle.
 */
function selectBestCandidate(
  pool: Recipe[],
  day: DayOfWeek,
  ctx: PlannerContext,
  currentPlan: PlanSlot[],
  modifiers: ScoreModifier[],
  vegDays: Set<DayOfWeek>,
  rng: () => number,
): ScoredRecipe {
  const isVegDay = vegDays.has(day);

  const scored: ScoredRecipe[] = pool.map((recipe) => {
    let score = 0;
    const reasons: ReasonCode[] = [];

    // Veg day preference
    if (isVegDay) {
      if (recipe.vegetarian) {
        score += 30;
        reasons.push({ type: "included", code: "VEG_DAY", message: "Vegetarian day" });
      } else {
        score -= 30;
        reasons.push({ type: "info", code: "VEG_DAY", message: "Non-veg on vegetarian day" });
      }
    }

    // Apply all score modifiers
    for (const modifier of modifiers) {
      const result = modifier(recipe, ctx, currentPlan, day);
      score += result.delta;
      if (result.reason) {
        reasons.push(result.reason);
      }
    }

    return { recipe, score, reasons };
  });

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  // Find top band: all candidates within threshold of best
  const bestScore = scored[0].score;
  const topBand = scored.filter((s) => s.score >= bestScore - TOP_CANDIDATE_THRESHOLD);

  // Seeded shuffle within the top band, pick first
  const shuffled = seededShuffle(topBand, rng);
  return shuffled[0];
}

/** Build a PlanSlot from a scored recipe pick. */
function buildSlot(
  day: DayOfWeek,
  pick: ScoredRecipe,
  leftoverDays: Set<DayOfWeek>,
): PlanSlot {
  let leftoverLabel: string | null = null;
  let leftoverRecipeId: number | null = null;

  if (leftoverDays.has(day) && pick.recipe.leftovers_score >= 3) {
    leftoverLabel = `Leftover ${pick.recipe.title} for lunch`;
    leftoverRecipeId = pick.recipe.id;
  }

  const reasons = [...pick.reasons];
  if (leftoverDays.has(day)) {
    reasons.push({ type: "info", code: "LEFTOVER_DAY", message: "Designated leftover day" });
  }

  return {
    day,
    recipe: pick.recipe,
    locked: false,
    lunch_leftover_label: leftoverLabel,
    leftover_lunch_recipe_id: leftoverRecipeId,
    reasons,
  };
}

// Re-export utilities for use by API layer
export { normalizeToMonday, deriveSeed } from "./seededRandom";
export type { PlannerContext, PlanSlot } from "./types";
