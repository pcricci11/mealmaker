// ── Family Profile ──
export interface Family {
  id: number;
  name: string;
  allergies: string[];              // e.g. ["peanuts","shellfish"]
  vegetarian_ratio: number;         // 0–100  (% of meals that should be vegetarian)
  gluten_free: boolean;
  dairy_free: boolean;
  nut_free: boolean;
  max_cook_minutes_weekday: number;
  max_cook_minutes_weekend: number;
  leftovers_nights_per_week: number; // 0–4
  picky_kid_mode: boolean;
  created_at?: string;
}

export type FamilyInput = Omit<Family, "id" | "created_at">;

// ── Recipe ──
export interface Ingredient {
  name: string;
  quantity: number;
  unit: string;
  category: GroceryCategory;
}

export type Cuisine =
  | "american"
  | "italian"
  | "mexican"
  | "indian"
  | "chinese"
  | "japanese"
  | "thai"
  | "mediterranean"
  | "korean"
  | "french"
  | "middle_eastern"
  | "ethiopian";

export type GroceryCategory =
  | "produce"
  | "dairy"
  | "pantry"
  | "protein"
  | "spices"
  | "grains"
  | "frozen"
  | "other";

export interface Recipe {
  id: number;
  name: string;
  cuisine: Cuisine;
  vegetarian: boolean;
  protein_type: string | null;      // e.g. "chicken", "beef", null for veg
  cook_minutes: number;
  allergens: string[];              // e.g. ["gluten","dairy","nuts"]
  kid_friendly: boolean;
  makes_leftovers: boolean;
  ingredients: Ingredient[];
  tags: string[];
}

export type RecipeInput = Omit<Recipe, "id">;

// ── Meal Plan ──
export type DayOfWeek = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

export interface MealPlanItem {
  id: number;
  meal_plan_id: number;
  day: DayOfWeek;
  recipe_id: number;
  recipe?: Recipe;
  locked: boolean;
  lunch_leftover_label: string | null; // e.g. "Leftover Chicken Stir-Fry for lunch"
}

export interface MealPlan {
  id: number;
  family_id: number;
  created_at: string;
  items: MealPlanItem[];
}

export interface GeneratePlanRequest {
  family_id: number;
  locks?: Record<DayOfWeek, number>; // day → recipe_id to keep
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
}
