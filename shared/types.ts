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

export const VALID_SOURCE_TYPES = ["seeded", "user", "imported", "chef"] as const;
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
}

export type RecipeInput = Omit<Recipe, "id">;

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

export interface MealPlan {
  id: number;
  family_id: number;
  week_start: string | null;
  variant?: number;
  created_at: string;
  settings_snapshot: any | null;
  items: MealPlanItem[];
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

export type ServingMultiplier = "normal" | "hearty" | "extra_large";

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
}
