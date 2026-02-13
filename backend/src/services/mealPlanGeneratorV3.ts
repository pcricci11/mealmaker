// services/mealPlanGeneratorV3.ts
// Enhanced meal plan generation with multi-main, lunch, and sides support

import db from "../db";

interface GeneratePlanOptions {
  familyId: number;
  weekStart: string;
  cookingSchedule: any[];
  lunchNeeds: any[];
  maxCookMinutesWeekday: number;
  maxCookMinutesWeekend: number;
  vegetarianRatio: number;
  settings?: any;
}

interface Recipe {
  id: number;
  name: string;
  cuisine: string;
  vegetarian: boolean;
  protein_type: string | null;
  cook_minutes: number;
  allergens: string[];
  kid_friendly: boolean;
  makes_leftovers: boolean;
  ingredients: any[];
  tags: string[];
  difficulty: string;
}

export async function generateMealPlanV3(options: GeneratePlanOptions) {
  const {
    familyId,
    weekStart,
    cookingSchedule,
    lunchNeeds,
    maxCookMinutesWeekday,
    maxCookMinutesWeekend,
    vegetarianRatio,
  } = options;

  // 1. Get family members with dietary restrictions
  const members = (db
    .prepare(
      `SELECT id, name, dietary_style, allergies, dislikes, favorites, no_spicy
      FROM family_members
      WHERE family_id = ?`
    )
    .all(familyId) as any[])
    .map((m: any) => ({
      ...m,
      allergies: JSON.parse(m.allergies || "[]"),
      dislikes: JSON.parse(m.dislikes || "[]"),
      favorites: JSON.parse(m.favorites || "[]"),
      no_spicy: Boolean(m.no_spicy),
    }));

  // 2. Get all available recipes
  const allRecipes: Recipe[] = (db
    .prepare(
      `SELECT
        id, name, cuisine, vegetarian, protein_type, cook_minutes,
        allergens, kid_friendly, makes_leftovers, ingredients, tags, difficulty
      FROM recipes`
    )
    .all() as any[])
    .map((r: any) => ({
      ...r,
      vegetarian: Boolean(r.vegetarian),
      kid_friendly: Boolean(r.kid_friendly),
      makes_leftovers: Boolean(r.makes_leftovers),
      allergens: JSON.parse(r.allergens || "[]"),
      ingredients: JSON.parse(r.ingredients || "[]"),
      tags: JSON.parse(r.tags || "[]"),
    }));

  // 3-7. Generate plan inside a transaction
  const generatePlan = db.transaction(() => {
  // 3. Create meal plan record
  const planResult = db
    .prepare(
      `INSERT INTO meal_plans (family_id, week_start, variant)
      VALUES (?, ?, 0)`
    )
    .run(familyId, weekStart);

  const mealPlanId = planResult.lastInsertRowid as number;

  // 4. Generate meals for each cooking day
  const plannedMeals: any[] = [];
  const usedRecipeIds = new Set<number>();

  for (const daySchedule of cookingSchedule) {
    if (!daySchedule.is_cooking) continue;

    const day = daySchedule.day;
    const isWeekend = day === "saturday" || day === "sunday";
    const maxCookTime = isWeekend
      ? maxCookMinutesWeekend
      : maxCookMinutesWeekday;

    if (daySchedule.meal_mode === "one_main") {
      // Single main for everyone
      const recipe = selectRecipe({
        recipes: allRecipes,
        members: members,
        memberIds: members.map((m) => m.id),
        maxCookTime,
        usedRecipeIds,
        vegetarianRatio,
        isVegetarianDay: shouldBeVegetarianDay(plannedMeals, vegetarianRatio),
      });

      if (recipe) {
        plannedMeals.push({
          meal_plan_id: mealPlanId,
          day,
          recipe_id: recipe.id,
          meal_type: "main",
          main_number: null,
          assigned_member_ids: null, // Everyone
        });

        usedRecipeIds.add(recipe.id);

        // Add sides
        const sides = selectSidesForMain(recipe, 1);
        sides.forEach((side) => {
          plannedMeals.push({
            meal_plan_id: mealPlanId,
            day,
            recipe_id: null,
            meal_type: "side",
            parent_meal_item_id: null, // Will be set after insertion
            is_custom: 1,
            notes: JSON.stringify({
              side_library_id: side.id,
              side_name: side.name,
            }),
          });
        });
      }
    } else if (daySchedule.meal_mode === "customize_mains") {
      // Multiple mains for different members
      for (const assignment of daySchedule.main_assignments || []) {
        const memberIds = assignment.member_ids || [];
        if (memberIds.length === 0) continue;

        const assignedMembers = members.filter((m) =>
          memberIds.includes(m.id)
        );

        const recipe = selectRecipe({
          recipes: allRecipes,
          members: assignedMembers,
          memberIds,
          maxCookTime,
          usedRecipeIds,
          vegetarianRatio,
          isVegetarianDay: shouldBeVegetarianDay(plannedMeals, vegetarianRatio),
        });

        if (recipe) {
          plannedMeals.push({
            meal_plan_id: mealPlanId,
            day,
            recipe_id: recipe.id,
            meal_type: "main",
            main_number: assignment.main_number,
            assigned_member_ids: JSON.stringify(memberIds),
          });

          usedRecipeIds.add(recipe.id);

          // Add sides for this main
          const sides = selectSidesForMain(recipe, 1);
          sides.forEach((side) => {
            plannedMeals.push({
              meal_plan_id: mealPlanId,
              day,
              recipe_id: null,
              meal_type: "side",
              main_number: assignment.main_number,
              parent_meal_item_id: null,
              is_custom: 1,
              notes: JSON.stringify({
                side_library_id: side.id,
                side_name: side.name,
              }),
            });
          });
        }
      }
    }
  }

  // 5. Generate lunches based on lunch needs
  const daysOfWeek = ["monday", "tuesday", "wednesday", "thursday", "friday"];

  for (const lunchNeed of lunchNeeds) {
    if (!lunchNeed.needs_lunch) continue;

    const day = lunchNeed.day;
    const memberId = lunchNeed.member_id;

    if (lunchNeed.leftovers_ok) {
      // Use previous day's dinner as leftover
      const prevDayIndex = daysOfWeek.indexOf(day) - 1;
      if (prevDayIndex >= 0) {
        const prevDay = daysOfWeek[prevDayIndex];
        const prevDayMeal = plannedMeals.find(
          (m) => m.day === prevDay && m.meal_type === "main"
        );

        if (prevDayMeal && prevDayMeal.recipe_id) {
          plannedMeals.push({
            meal_plan_id: mealPlanId,
            day,
            recipe_id: prevDayMeal.recipe_id,
            meal_type: "lunch",
            assigned_member_ids: JSON.stringify([memberId]),
            parent_meal_item_id: null, // Reference to dinner
            notes: "Leftovers from previous night",
          });
        }
      }
    } else {
      // Need a separate lunch recipe (simple, quick)
      const lunchRecipe = selectLunchRecipe({
        recipes: allRecipes,
        members: members.filter((m) => m.id === memberId),
        usedRecipeIds,
      });

      if (lunchRecipe) {
        plannedMeals.push({
          meal_plan_id: mealPlanId,
          day,
          recipe_id: lunchRecipe.id,
          meal_type: "lunch",
          assigned_member_ids: JSON.stringify([memberId]),
        });
      }
    }
  }

  // 6. Insert all planned meals
  for (const meal of plannedMeals) {
    db.prepare(
      `INSERT INTO meal_plan_items
      (meal_plan_id, day, recipe_id, meal_type, main_number, assigned_member_ids,
       parent_meal_item_id, is_custom, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      meal.meal_plan_id,
      meal.day,
      meal.recipe_id,
      meal.meal_type,
      meal.main_number || null,
      meal.assigned_member_ids || null,
      meal.parent_meal_item_id || null,
      meal.is_custom || 0,
      meal.notes || null
    );
  }

  // 7. Return the complete meal plan
  return {
    id: mealPlanId,
    family_id: familyId,
    week_start: weekStart,
    variant: 0,
    created_at: new Date().toISOString(),
  };
  }); // end transaction

  return generatePlan();
}

// Helper: Select a recipe based on constraints
function selectRecipe(options: {
  recipes: Recipe[];
  members: any[];
  memberIds: number[];
  maxCookTime: number;
  usedRecipeIds: Set<number>;
  vegetarianRatio: number;
  isVegetarianDay: boolean;
}): Recipe | null {
  const {
    recipes,
    members,
    maxCookTime,
    usedRecipeIds,
    isVegetarianDay,
  } = options;

  // Filter compatible recipes
  let compatible = recipes.filter((recipe) => {
    // Cook time constraint
    if (recipe.cook_minutes > maxCookTime) return false;

    // Already used recently
    if (usedRecipeIds.has(recipe.id)) return false;

    // Vegetarian day constraint
    if (isVegetarianDay && !recipe.vegetarian) return false;

    // Check member compatibility
    for (const member of members) {
      // Dietary style
      if (member.dietary_style === "vegan" && !recipe.tags.includes("vegan")) {
        return false;
      }
      if (member.dietary_style === "vegetarian" && !recipe.vegetarian) {
        return false;
      }

      // Allergies
      for (const allergy of member.allergies) {
        if (recipe.allergens.includes(allergy)) {
          return false;
        }
      }

      // No spicy
      if (member.no_spicy && recipe.tags.includes("spicy")) {
        return false;
      }
    }

    return true;
  });

  if (compatible.length === 0) return null;

  // Score recipes based on preferences
  const scored = compatible.map((recipe) => {
    let score = 100;

    // Boost if any member favorites this
    for (const member of members) {
      if (member.favorites.some((fav: string) =>
        recipe.name.toLowerCase().includes(fav.toLowerCase())
      )) {
        score += 50;
      }

      // Penalty if anyone dislikes ingredients
      for (const dislike of member.dislikes) {
        if (recipe.ingredients.some((ing: any) =>
          ing.name.toLowerCase().includes(dislike.toLowerCase())
        )) {
          score -= 30;
        }
      }
    }

    return { recipe, score };
  });

  // Sort by score and pick top candidate
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.recipe || null;
}

// Helper: Determine if this should be a vegetarian day
function shouldBeVegetarianDay(
  plannedMeals: any[],
  vegetarianRatio: number
): boolean {
  const totalDinners = plannedMeals.filter(
    (m) => m.meal_type === "main"
  ).length;
  const vegetarianDinners = plannedMeals.filter(
    (m) => m.meal_type === "main" && m.vegetarian
  ).length;

  const targetVegCount = Math.round((vegetarianRatio / 100) * 7); // Assuming 7 days
  return vegetarianDinners < targetVegCount;
}

// Helper: Select lunch recipe (quick & easy)
function selectLunchRecipe(options: {
  recipes: Recipe[];
  members: any[];
  usedRecipeIds: Set<number>;
}): Recipe | null {
  const { recipes, members, usedRecipeIds } = options;

  const lunchRecipes = recipes.filter((recipe) => {
    // Quick meals only
    if (recipe.cook_minutes > 20) return false;

    // Not recently used
    if (usedRecipeIds.has(recipe.id)) return false;

    // Check member compatibility (same as dinner logic)
    for (const member of members) {
      if (member.dietary_style === "vegetarian" && !recipe.vegetarian) {
        return false;
      }
      for (const allergy of member.allergies) {
        if (recipe.allergens.includes(allergy)) return false;
      }
    }

    return true;
  });

  return lunchRecipes[0] || null;
}

// Helper: Select sides for a main
function selectSidesForMain(mainRecipe: Recipe, count: number = 1): any[] {
  const sides = db
    .prepare(
      `SELECT id, name, category, weight, cuisine_affinity, avoid_with_main_types
      FROM sides_library
      ORDER BY RANDOM()
      LIMIT ?`
    )
    .all(count) as any[];

  return sides.map((s: any) => ({
    ...s,
    cuisine_affinity: s.cuisine_affinity
      ? JSON.parse(s.cuisine_affinity)
      : null,
    avoid_with_main_types: s.avoid_with_main_types
      ? JSON.parse(s.avoid_with_main_types)
      : null,
  }));
}
