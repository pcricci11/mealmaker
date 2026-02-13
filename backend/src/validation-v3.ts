// validation.ts - Updated with V3 validations
// Merge this with your existing validation.ts

import type { 
  FamilyMemberInput,
  DietaryStyle,
  Allergen,
  FrequencyPreference,
  ServingMultiplier,
} from "@shared/types";

// Validate family member input
export function validateFamilyMember(input: any): FamilyMemberInput {
  if (!input.family_id || typeof input.family_id !== "number") {
    throw new Error("family_id is required and must be a number");
  }

  if (!input.name || typeof input.name !== "string") {
    throw new Error("name is required and must be a string");
  }

  const validDietaryStyles: DietaryStyle[] = ["omnivore", "vegetarian", "vegan"];
  if (!input.dietary_style || !validDietaryStyles.includes(input.dietary_style)) {
    throw new Error(`dietary_style must be one of: ${validDietaryStyles.join(", ")}`);
  }

  if (input.allergies && !Array.isArray(input.allergies)) {
    throw new Error("allergies must be an array");
  }

  if (input.dislikes && !Array.isArray(input.dislikes)) {
    throw new Error("dislikes must be an array");
  }

  if (input.favorites && !Array.isArray(input.favorites)) {
    throw new Error("favorites must be an array");
  }

  if (input.no_spicy !== undefined && typeof input.no_spicy !== "boolean") {
    throw new Error("no_spicy must be a boolean");
  }

  return {
    family_id: input.family_id,
    name: input.name,
    dietary_style: input.dietary_style,
    allergies: input.allergies || [],
    dislikes: input.dislikes || [],
    favorites: input.favorites || [],
    no_spicy: input.no_spicy || false,
  };
}

// Validate frequency preference
export function validateFrequencyPreference(value: string): FrequencyPreference {
  const valid: FrequencyPreference[] = [
    "always",
    "weekly",
    "twice_month",
    "monthly",
    "bimonthly",
    "rarely",
  ];

  if (!valid.includes(value as FrequencyPreference)) {
    throw new Error(`frequency_preference must be one of: ${valid.join(", ")}`);
  }

  return value as FrequencyPreference;
}

// Validate serving multiplier
export function validateServingMultiplier(value: string): ServingMultiplier {
  const valid: ServingMultiplier[] = ["normal", "hearty", "extra_large"];

  if (!valid.includes(value as ServingMultiplier)) {
    throw new Error(`serving_multiplier must be one of: ${valid.join(", ")}`);
  }

  return value as ServingMultiplier;
}

// Validate day of week
export function validateDayOfWeek(value: string): string {
  const validDays = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ];

  if (!validDays.includes(value)) {
    throw new Error(`day must be one of: ${validDays.join(", ")}`);
  }

  return value;
}

// Validate meal mode
export function validateMealMode(value: string): "one_main" | "customize_mains" {
  if (value !== "one_main" && value !== "customize_mains") {
    throw new Error("meal_mode must be 'one_main' or 'customize_mains'");
  }

  return value;
}

// Validate difficulty
export function validateDifficulty(value: string): "easy" | "medium" | "hard" {
  if (value !== "easy" && value !== "medium" && value !== "hard") {
    throw new Error("difficulty must be 'easy', 'medium', or 'hard'");
  }

  return value;
}

// Validate side category
export function validateSideCategory(value: string): string {
  const validCategories = [
    "veggie",
    "salad",
    "starch",
    "grain",
    "bread",
    "fruit",
    "other",
  ];

  if (!validCategories.includes(value)) {
    throw new Error(`side category must be one of: ${validCategories.join(", ")}`);
  }

  return value;
}

// Validate side weight
export function validateSideWeight(value: string): "light" | "medium" | "heavy" {
  if (value !== "light" && value !== "medium" && value !== "heavy") {
    throw new Error("side weight must be 'light', 'medium', or 'heavy'");
  }

  return value;
}
