// types-v3.ts
// Updated shared types for MealMaker V3
// This file contains NEW types - merge with existing shared/types.ts

// ── Serving Multiplier ──

export const VALID_SERVING_MULTIPLIERS = [1.0, 1.5, 2.0] as const;
export type ServingMultiplier = number;

// ── Frequency Preferences ──

export const VALID_FREQUENCY_PREFERENCES = [
  "always",       // Include every week if possible
  "weekly",       // Once a week
  "twice_month",  // Twice a month (every 2 weeks)
  "monthly",      // Once a month
  "bimonthly",    // Once every 2 months
  "rarely",       // Special occasions only
] as const;
export type FrequencyPreference = (typeof VALID_FREQUENCY_PREFERENCES)[number];

// ── Family Member Enhancements ──

export interface FamilyMemberV3 extends FamilyMember {
  no_spicy: boolean;
  // Note: allergies, dietary_style, dislikes, favorites already exist
}

export type FamilyMemberInputV3 = Omit<FamilyMemberV3, "id" | "created_at">;

// ── Family Favorites ──

export interface FamilyFavoriteChef {
  id: number;
  family_id: number;
  name: string;
  created_at?: string;
}

export interface FamilyFavoriteMeal {
  id: number;
  family_id: number;
  name: string;
  recipe_url?: string | null;
  difficulty?: Difficulty | null;
  total_time_minutes?: number | null;
  frequency_preference?: FrequencyPreference | null;
  notes?: string | null;
  created_at?: string;
}

export interface FamilyFavoriteSide {
  id: number;
  family_id: number;
  name: string;
  recipe_url?: string | null;
  category?: string | null;  // veggie, salad, starch, grain, etc.
  pairs_well_with?: string[] | null;  // cuisine types
  notes?: string | null;
  created_at?: string;
}

export type FavoriteChefInput = Omit<FamilyFavoriteChef, "id" | "created_at">;
export type FavoriteMealInput = Omit<FamilyFavoriteMeal, "id" | "created_at">;
export type FavoriteSideInput = Omit<FamilyFavoriteSide, "id" | "created_at">;

// ── Recipe Enhancements ──

export interface RecipeV3 extends Recipe {
  total_time_minutes?: number | null;
  frequency_preference?: FrequencyPreference | null;
  // Note: difficulty already exists in Recipe type
}

// ── Cooking Schedule ──

export const VALID_MEAL_MODES = ["one_main", "customize_mains"] as const;
export type MealMode = (typeof VALID_MEAL_MODES)[number];

export interface WeeklyCookingSchedule {
  id: number;
  family_id: number;
  week_start: string;  // YYYY-MM-DD (Monday)
  day: DayOfWeek;
  is_cooking: boolean;
  meal_mode?: MealMode | null;
  num_mains?: number | null;
  created_at?: string;
  updated_at?: string;
  main_assignments?: CookingDayMainAssignment[];
}

export interface CookingDayMainAssignment {
  id: number;
  schedule_id: number;
  main_number: number;  // 1, 2, 3, etc.
  member_ids: number[];  // Array of family member IDs
}

export type CookingScheduleInput = Omit<WeeklyCookingSchedule, "id" | "created_at" | "updated_at" | "main_assignments">;

// ── Lunch Planning ──

export interface WeeklyLunchNeed {
  id: number;
  family_id: number;
  week_start: string;  // YYYY-MM-DD (Monday)
  member_id: number;
  day: "monday" | "tuesday" | "wednesday" | "thursday" | "friday";
  needs_lunch: boolean;
  leftovers_ok: boolean;
  created_at?: string;
  updated_at?: string;
}

export type LunchNeedInput = Omit<WeeklyLunchNeed, "id" | "created_at" | "updated_at">;

// ── Meal Plan Items V3 ──

export const VALID_MEAL_TYPES = ["main", "side", "lunch"] as const;
export type MealType = (typeof VALID_MEAL_TYPES)[number];

export interface MealPlanItemV3 extends MealPlanItem {
  meal_type: MealType;
  main_number?: number | null;  // For multiple mains: 1, 2, 3, etc.
  assigned_member_ids?: number[] | null;  // Who eats this meal (null = everyone)
  parent_meal_item_id?: number | null;  // For sides: references main; for lunches: references dinner
  is_custom: boolean;  // User-entered custom side/meal
}

// ── Sides Library ──

export const VALID_SIDE_CATEGORIES = [
  "veggie", "salad", "starch", "grain", "bread", "fruit", "other"
] as const;
export type SideCategory = (typeof VALID_SIDE_CATEGORIES)[number];

export const VALID_SIDE_WEIGHTS = ["light", "medium", "heavy"] as const;
export type SideWeight = (typeof VALID_SIDE_WEIGHTS)[number];

export interface SideLibraryItem {
  id: number;
  name: string;
  category: SideCategory;
  weight: SideWeight;
  cuisine_affinity?: string[] | null;  // Cuisines this pairs well with
  avoid_with_main_types?: string[] | null;  // Main characteristics to avoid
  prep_time_minutes?: number | null;
  vegetarian: boolean;
  ingredients?: Ingredient[] | null;
  recipe_url?: string | null;
  created_at?: string;
}

// ── Recipe Usage Tracking ──

export interface RecipeUsageHistory {
  id: number;
  family_id: number;
  recipe_id?: number | null;
  favorite_meal_id?: number | null;
  used_date: string;  // YYYY-MM-DD
  meal_plan_id?: number | null;
  created_at?: string;
}

// ── This Week Settings (UI State) ──

export interface ThisWeekSettings {
  family_id: number;
  week_start: string;  // YYYY-MM-DD (Monday)
  cooking_schedule: WeeklyCookingSchedule[];
  lunch_needs: WeeklyLunchNeed[];
  max_cook_minutes_weekday: number;
  max_cook_minutes_weekend: number;
  vegetarian_ratio: number;  // 0-100
}

// ── API Request/Response Types ──

export interface GeneratePlanRequestV3 {
  family_id: number;
  week_start: string;  // YYYY-MM-DD
  cooking_schedule: CookingScheduleInput[];
  lunch_needs: LunchNeedInput[];
  max_cook_minutes_weekday: number;
  max_cook_minutes_weekend: number;
  vegetarian_ratio: number;
  locks?: Partial<Record<DayOfWeek, number>>;
  settings?: PlanSettings;
}

export interface SwapSideRequest {
  meal_item_id: number;  // The side to swap
}

export interface AddSideRequest {
  meal_item_id: number;  // The main meal to add a side to
  side_id?: number;  // From sides_library
  custom_name?: string;  // Or user-entered custom side
}

export interface CopyMealFromHistoryRequest {
  source_meal_item_id: number;  // The meal to copy
  target_day: DayOfWeek;  // Which day to add it to
}

// ── Family V3 (Updated) ──

export interface FamilyV3 extends Omit<Family, "allergies" | "max_cook_minutes_weekday" | "max_cook_minutes_weekend" | "vegetarian_ratio"> {
  serving_multiplier: ServingMultiplier;
  // Removed family-level: allergies, cook times, veg ratio (now in ThisWeekSettings)
  members?: FamilyMemberV3[];
  favorite_chefs?: FamilyFavoriteChef[];
  favorite_meals?: FamilyFavoriteMeal[];
  favorite_sides?: FamilyFavoriteSide[];
}
