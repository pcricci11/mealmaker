// ── Validation Constants ──

export const VALID_ALLERGENS = [
  "gluten", "dairy", "nuts", "shellfish", "soy", "fish", "eggs",
] as const;
export type Allergen = (typeof VALID_ALLERGENS)[number];

export const VALID_DIETARY_STYLES = ["omnivore", "vegetarian", "vegan"] as const;
export type DietaryStyle = (typeof VALID_DIETARY_STYLES)[number];

export const VALID_PLANNING_MODES = ["strictest_household", "split_household"] as const;
export type PlanningMode = (typeof VALID_PLANNING_MODES)[number];

export const VALID_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof VALID_DIFFICULTIES)[number];

export const VALID_CUISINES = [
  "american", "italian", "mexican", "indian", "chinese", "japanese",
  "thai", "mediterranean", "korean", "french", "middle_eastern", "ethiopian",
] as const;
export type Cuisine = (typeof VALID_CUISINES)[number];

export const VALID_SOURCE_TYPES = ["seeded", "user", "imported", "chef", "web_search"] as const;
export type RecipeSourceType = (typeof VALID_SOURCE_TYPES)[number];

export const VALID_DAYS = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
] as const;
export type DayOfWeek = (typeof VALID_DAYS)[number];

export type GroceryCategory =
  | "produce"
  | "dairy"
  | "pantry"
  | "protein"
  | "spices"
  | "grains"
  | "frozen"
  | "other";

// ── Family Profile ──

export interface Family {
  id: number;
  name: string;
  allergies: string[];
  vegetarian_ratio: number;         // 0–100
  gluten_free: boolean;
  dairy_free: boolean;
  nut_free: boolean;
  max_cook_minutes_weekday: number;
  max_cook_minutes_weekend: number;
  leftovers_nights_per_week: number; // 0–4
  picky_kid_mode: boolean;
  planning_mode: PlanningMode;
  serving_multiplier?: ServingMultiplier;
  created_at?: string;
  members?: FamilyMember[];
}

export type FamilyInput = Omit<Family, "id" | "created_at" | "members">;

// ── Family Members ──

export interface FamilyMember {
  id: number;
  family_id: number;
  name: string;
  dietary_style: DietaryStyle;
  allergies: string[];
  dislikes: string[];
  favorites: string[];
  no_spicy: boolean;
  created_at?: string;
}

export type FamilyMemberInput = Omit<FamilyMember, "id" | "created_at">;

// ── Recipe ──

export interface Ingredient {
  name: string;
  quantity: number;
  unit: string;
  category: GroceryCategory;
}

export interface Recipe {
  id: number;
  title: string;
  cuisine: Cuisine;
  vegetarian: boolean;
  protein_type: string | null;
  cook_minutes: number;
  allergens: string[];
  kid_friendly: boolean;
  makes_leftovers: boolean;
  leftovers_score: number;          // 0–5
  ingredients: Ingredient[];
  tags: string[];
  source_type: RecipeSourceType;
  source_name: string | null;
  source_url: string | null;
  difficulty: Difficulty;
  seasonal_tags: string[];
  frequency_cap_per_month: number | null;
  notes: string | null;
}

export type RecipeInput = Omit<Recipe, "id" | "notes"> & { notes?: string | null };

export interface WebSearchRecipeResult {
  name: string;
  source_name: string;
  source_url: string;
  cook_minutes: number;
  cuisine: Cuisine;
  vegetarian: boolean;
  protein_type: string | null;
  difficulty: Difficulty;
  kid_friendly: boolean;
  description: string;
  is_paywalled?: boolean;
  ingredients?: Ingredient[];
  source?: "spoonacular" | "claude";
}

// ── Meal Plan ──

export interface MealPlanItem {
  id: number;
  meal_plan_id: number;
  day: DayOfWeek;
  recipe_id: number;
  recipe?: Recipe;
  locked: boolean;
  lunch_leftover_label: string | null;
  leftover_lunch_recipe_id: number | null;
  notes: string | null;
  reasons?: ReasonCodeValue[];
  leftovers_for_lunch?: boolean;
}

export type MealType = "main" | "side" | "lunch";

export interface MealPlanItemV3 extends MealPlanItem {
  meal_type: MealType;
  main_number: number | null;
  assigned_member_ids: number[] | null;
  parent_meal_item_id: number | null;
  is_custom: boolean;
  recipe_name: string | null;
}

export interface MealPlan {
  id: number;
  family_id: number;
  week_start: string | null;
  variant?: number;
  created_at: string;
  settings_snapshot: any | null;
  items: MealPlanItemV3[];
}

// ── Plan Generation ──

export interface PlanSettings {
  seed?: number;
  season_boost?: boolean;
  frequency_cap?: boolean;
  variant?: number;
}

export interface GeneratePlanRequest {
  family_id: number;
  week_start?: string;              // YYYY-MM-DD; normalized to Monday
  variant?: number;
  locks?: Partial<Record<DayOfWeek, number>>;
  settings?: PlanSettings;
}

export interface GeneratePlanResponse extends MealPlan {
  alreadyExisted?: boolean;
}

export interface SwapMealRequest {
  day: DayOfWeek;
}

// ── Reason Codes ──

export type ReasonCodeValue =
  | "ALLERGEN_MATCH"
  | "GLUTEN_FREE"
  | "DAIRY_FREE"
  | "NUT_FREE"
  | "NOT_KID_FRIENDLY"
  | "VEGAN_HOUSEHOLD"
  | "VEGETARIAN_HOUSEHOLD"
  | "COOK_TIME"
  | "FAVORITE"
  | "DISLIKED"
  | "SAME_CUISINE"
  | "SAME_PROTEIN"
  | "REPEAT_RECIPE"
  | "FREQUENCY_CAP"
  | "SEASONAL_BOOST"
  | "OUT_OF_SEASON"
  | "GOOD_LEFTOVERS"
  | "LOW_LEFTOVERS"
  | "VEG_DAY"
  | "LEFTOVERS_LUNCH"
  | "LOCKED";

// ── Frequency & Serving ──

export type FrequencyPreference =
  | "always"
  | "weekly"
  | "twice_month"
  | "monthly"
  | "bimonthly"
  | "rarely";

export type ServingMultiplier = number;

// ── V3 Aliases ──

// FamilyMember already includes no_spicy; V3 alias for compatibility
export type FamilyMemberV3 = FamilyMember;
export type FamilyMemberInputV3 = FamilyMemberInput;

// ── Family Favorites ──

export interface FamilyFavoriteChef {
  id: number;
  family_id: number;
  name: string;
  cuisines?: string[] | null;
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

export interface FamilyFavoriteWebsite {
  id: number;
  family_id: number;
  name: string;
  created_at?: string;
}

export interface FamilyFavoriteSide {
  id: number;
  family_id: number;
  name: string;
  recipe_url?: string | null;
  category?: string | null;
  pairs_well_with?: string[] | null;
  notes?: string | null;
  created_at?: string;
}

// ── Cooking Schedule ──

export const VALID_MEAL_MODES = ["one_main", "customize_mains"] as const;
export type MealMode = (typeof VALID_MEAL_MODES)[number];

export interface CookingDayMainAssignment {
  id: number;
  schedule_id: number;
  main_number: number;
  member_ids: number[];
}

export interface WeeklyCookingSchedule {
  id: number;
  family_id: number;
  week_start: string;
  day: DayOfWeek;
  is_cooking: boolean;
  meal_mode?: MealMode | null;
  num_mains?: number | null;
  created_at?: string;
  updated_at?: string;
  main_assignments?: CookingDayMainAssignment[];
}

// ── Lunch Planning ──

export interface WeeklyLunchNeed {
  id: number;
  family_id: number;
  week_start: string;
  member_id: number;
  day: "monday" | "tuesday" | "wednesday" | "thursday" | "friday";
  needs_lunch: boolean;
  leftovers_ok: boolean;
  created_at?: string;
  updated_at?: string;
}

// ── V3 Plan Generation ──

export interface GeneratePlanRequestV3 {
  family_id: number;
  week_start: string;
  cooking_schedule: Omit<WeeklyCookingSchedule, "id" | "created_at" | "updated_at" | "main_assignments">[];
  lunch_needs: Omit<WeeklyLunchNeed, "id" | "created_at" | "updated_at">[];
  max_cook_minutes_weekday: number;
  max_cook_minutes_weekend: number;
  vegetarian_ratio: number;
  locks?: Partial<Record<DayOfWeek, number>>;
  settings?: PlanSettings;
  specific_meals?: Array<{ day: string; description: string }>;
}

// ── Grocery List ──

export interface GroceryItem {
  name: string;
  total_quantity: number;
  unit: string;
  category: GroceryCategory;
  checked: boolean;
}

export interface GroceryList {
  meal_plan_id: number;
  items: GroceryItem[];
  missing_recipes: { recipe_id: number; name: string }[];
}
