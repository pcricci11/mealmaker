import type { Recipe, Family, FamilyMember, DayOfWeek, ReasonCode } from "../../../shared/types";

export interface PlannerContext {
  family: Family;
  members: FamilyMember[];
  allRecipes: Recipe[];
  locks: Partial<Record<DayOfWeek, number>>;
  weekStart: string;           // YYYY-MM-DD, always a Monday
  seed: number;
  recentRecipeHistory: number[];  // recipe IDs from trailing 30 days
}

export interface ScoredRecipe {
  recipe: Recipe;
  score: number;
  reasons: ReasonCode[];
}

export interface PlanSlot {
  day: DayOfWeek;
  recipe: Recipe;
  locked: boolean;
  lunch_leftover_label: string | null;
  leftover_lunch_recipe_id: number | null;
  reasons: ReasonCode[];
}

export interface FilterResult {
  passed: Recipe[];
  excluded: Array<{ recipe: Recipe; reason: ReasonCode }>;
}

export type ScoreModifier = (
  recipe: Recipe,
  context: PlannerContext,
  currentPlan: PlanSlot[],
  day: DayOfWeek,
) => { delta: number; reason?: ReasonCode };
