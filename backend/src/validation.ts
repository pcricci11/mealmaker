import {
  VALID_ALLERGENS,
  VALID_DIETARY_STYLES,
  VALID_PLANNING_MODES,
  VALID_DIFFICULTIES,
  VALID_CUISINES,
  VALID_SOURCE_TYPES,
  VALID_DAYS,
} from "../../shared/types";

export interface ValidationResult {
  isValid: boolean;
  errors: Array<{ field: string; message: string }>;
}

function ok(): ValidationResult {
  return { isValid: true, errors: [] };
}

function fail(errors: Array<{ field: string; message: string }>): ValidationResult {
  return { isValid: false, errors };
}

export function validateFamily(data: any): ValidationResult {
  const errors: Array<{ field: string; message: string }> = [];

  if (!data.name || typeof data.name !== "string" || !data.name.trim()) {
    errors.push({ field: "name", message: "Name is required" });
  }

  if (data.planning_mode && !(VALID_PLANNING_MODES as readonly string[]).includes(data.planning_mode)) {
    errors.push({ field: "planning_mode", message: `Must be one of: ${VALID_PLANNING_MODES.join(", ")}` });
  }

  if (data.allergies && Array.isArray(data.allergies)) {
    for (const a of data.allergies) {
      if (!(VALID_ALLERGENS as readonly string[]).includes(a)) {
        errors.push({ field: "allergies", message: `Invalid allergen: ${a}` });
      }
    }
  }

  if (data.vegetarian_ratio != null) {
    if (typeof data.vegetarian_ratio !== "number" || data.vegetarian_ratio < 0 || data.vegetarian_ratio > 100) {
      errors.push({ field: "vegetarian_ratio", message: "Must be between 0 and 100" });
    }
  }

  if (data.max_cook_minutes_weekday != null && (typeof data.max_cook_minutes_weekday !== "number" || data.max_cook_minutes_weekday <= 0)) {
    errors.push({ field: "max_cook_minutes_weekday", message: "Must be a positive number" });
  }

  if (data.max_cook_minutes_weekend != null && (typeof data.max_cook_minutes_weekend !== "number" || data.max_cook_minutes_weekend <= 0)) {
    errors.push({ field: "max_cook_minutes_weekend", message: "Must be a positive number" });
  }

  if (data.leftovers_nights_per_week != null) {
    if (typeof data.leftovers_nights_per_week !== "number" || data.leftovers_nights_per_week < 0 || data.leftovers_nights_per_week > 4) {
      errors.push({ field: "leftovers_nights_per_week", message: "Must be between 0 and 4" });
    }
  }

  return errors.length > 0 ? fail(errors) : ok();
}

export function validateFamilyMember(data: any): ValidationResult {
  const errors: Array<{ field: string; message: string }> = [];

  if (!data.name || typeof data.name !== "string" || !data.name.trim()) {
    errors.push({ field: "name", message: "Name is required" });
  }

  if (data.dietary_style && !(VALID_DIETARY_STYLES as readonly string[]).includes(data.dietary_style)) {
    errors.push({ field: "dietary_style", message: `Must be one of: ${VALID_DIETARY_STYLES.join(", ")}` });
  }

  if (data.allergies && Array.isArray(data.allergies)) {
    for (const a of data.allergies) {
      if (!(VALID_ALLERGENS as readonly string[]).includes(a)) {
        errors.push({ field: "allergies", message: `Invalid allergen: ${a}` });
      }
    }
  }

  return errors.length > 0 ? fail(errors) : ok();
}

export function validateRecipe(data: any): ValidationResult {
  const errors: Array<{ field: string; message: string }> = [];

  if (!data.title || typeof data.title !== "string" || !data.title.trim()) {
    errors.push({ field: "title", message: "Title is required" });
  }

  if (data.cuisine && !(VALID_CUISINES as readonly string[]).includes(data.cuisine)) {
    errors.push({ field: "cuisine", message: `Must be one of: ${VALID_CUISINES.join(", ")}` });
  }

  if (data.difficulty && !(VALID_DIFFICULTIES as readonly string[]).includes(data.difficulty)) {
    errors.push({ field: "difficulty", message: `Must be one of: ${VALID_DIFFICULTIES.join(", ")}` });
  }

  if (data.source_type && !(VALID_SOURCE_TYPES as readonly string[]).includes(data.source_type)) {
    errors.push({ field: "source_type", message: `Must be one of: ${VALID_SOURCE_TYPES.join(", ")}` });
  }

  if (data.cook_minutes != null && (typeof data.cook_minutes !== "number" || data.cook_minutes <= 0)) {
    errors.push({ field: "cook_minutes", message: "Must be a positive number" });
  }

  if (data.allergens && Array.isArray(data.allergens)) {
    for (const a of data.allergens) {
      if (!(VALID_ALLERGENS as readonly string[]).includes(a)) {
        errors.push({ field: "allergens", message: `Invalid allergen: ${a}` });
      }
    }
  }

  if (data.leftovers_score != null) {
    if (typeof data.leftovers_score !== "number" || data.leftovers_score < 0 || data.leftovers_score > 5) {
      errors.push({ field: "leftovers_score", message: "Must be between 0 and 5" });
    }
  }

  if (data.ingredients && !Array.isArray(data.ingredients)) {
    errors.push({ field: "ingredients", message: "Must be an array" });
  }

  return errors.length > 0 ? fail(errors) : ok();
}

export function validateGeneratePlanRequest(data: any): ValidationResult {
  const errors: Array<{ field: string; message: string }> = [];

  if (!data.family_id || typeof data.family_id !== "number" || data.family_id <= 0) {
    errors.push({ field: "family_id", message: "Must be a positive number" });
  }

  if (data.week_start && !/^\d{4}-\d{2}-\d{2}$/.test(data.week_start)) {
    errors.push({ field: "week_start", message: "Must be in YYYY-MM-DD format" });
  }

  if (data.variant != null && (typeof data.variant !== "number" || data.variant < 0)) {
    errors.push({ field: "variant", message: "Must be a non-negative number" });
  }

  if (data.locks) {
    for (const day of Object.keys(data.locks)) {
      if (!(VALID_DAYS as readonly string[]).includes(day)) {
        errors.push({ field: "locks", message: `Invalid day: ${day}` });
      }
    }
  }

  return errors.length > 0 ? fail(errors) : ok();
}

export function validateSwapRequest(data: any): ValidationResult {
  const errors: Array<{ field: string; message: string }> = [];

  if (!data.day || !(VALID_DAYS as readonly string[]).includes(data.day)) {
    errors.push({ field: "day", message: `Must be one of: ${VALID_DAYS.join(", ")}` });
  }

  return errors.length > 0 ? fail(errors) : ok();
}
