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
  specificMeals?: Array<{ day: string; description: string }>;
  locks?: Record<string, number>;
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
    specificMeals,
    locks,
  } = options;

  // Safeguard: if locks are provided, ensure only locked days + already-cooking days
  // have is_cooking: true. This prevents Claude misparsing from adding unwanted days.
  if (locks && Object.keys(locks).length > 0) {
    const lockedDays = new Set(Object.keys(locks).map(d => d.toLowerCase()));
    for (const daySchedule of cookingSchedule) {
      const dayLower = daySchedule.day.toLowerCase();
      if (!lockedDays.has(dayLower) && !daySchedule.is_cooking) {
        // Day is neither locked nor explicitly marked cooking — leave it alone
      } else if (lockedDays.has(dayLower) && !daySchedule.is_cooking) {
        // Day has a lock but wasn't marked cooking — force it on
        console.log(`[mealPlanGeneratorV3] Safeguard: forcing is_cooking=true for locked day "${daySchedule.day}"`);
        daySchedule.is_cooking = true;
        daySchedule.meal_mode = daySchedule.meal_mode || "one_main";
      }
    }
    console.log(`[mealPlanGeneratorV3] Locks provided:`, locks);
    console.log(`[mealPlanGeneratorV3] Cooking days after safeguard:`, cookingSchedule.filter((d: any) => d.is_cooking).map((d: any) => d.day));
  }

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
  // 3. Find existing plan or create a new one
  const existing = db
    .prepare(
      `SELECT id FROM meal_plans WHERE family_id = ? AND week_start = ? AND variant = 0`
    )
    .get(familyId, weekStart) as { id: number } | undefined;

  let mealPlanId: number;

  if (existing) {
    mealPlanId = existing.id;
  } else {
    const planResult = db
      .prepare(
        `INSERT INTO meal_plans (family_id, week_start, variant)
        VALUES (?, ?, 0)`
      )
      .run(familyId, weekStart);
    mealPlanId = planResult.lastInsertRowid as number;
  }

  // Always clear existing items before inserting — prevents duplicates
  // if the generator is called multiple times for the same plan
  const deleted = db.prepare(`DELETE FROM meal_plan_items WHERE meal_plan_id = ?`).run(mealPlanId);
  console.log(`[mealPlanGeneratorV3] Plan ${mealPlanId} (${existing ? "existing" : "new"}), cleared ${deleted.changes} old items`);

  // 4. Generate meals for each cooking day (deduplicate by day)
  const plannedMeals: any[] = [];
  const usedRecipeIds = new Set<number>();
  const seenDays = new Set<string>();

  // Build lookup for specific meal requests (e.g., "salmon on tuesday")
  const specificMealsByDay = new Map<string, string>();
  if (specificMeals) {
    for (const sm of specificMeals) {
      specificMealsByDay.set(sm.day.toLowerCase(), sm.description);
    }
  }

  for (const daySchedule of cookingSchedule) {
    if (seenDays.has(daySchedule.day)) continue;
    seenDays.add(daySchedule.day);
    if (!daySchedule.is_cooking) continue;

    const day = daySchedule.day;
    const isWeekend = day === "saturday" || day === "sunday";
    const maxCookTime = isWeekend
      ? maxCookMinutesWeekend
      : maxCookMinutesWeekday;

    if (daySchedule.meal_mode === "one_main") {
      // Check if this day has a locked recipe (direct ID assignment)
      let recipe: Recipe | null = null;
      const lockedRecipeId = locks?.[day];

      if (lockedRecipeId) {
        recipe = allRecipes.find(r => r.id === lockedRecipeId) || null;
        if (recipe) {
          console.log(`[mealPlanGeneratorV3] Locked recipe for ${day}: ${recipe.name} (id=${recipe.id})`);
        } else {
          console.log(`[mealPlanGeneratorV3] Locked recipe id=${lockedRecipeId} for ${day} not found in recipes, falling back`);
        }
      }

      // Check if user requested a specific meal for this day (keyword matching)
      const specificDescription = specificMealsByDay.get(day);

      if (!recipe && specificDescription) {
        // Try to find a recipe matching the specific request
        const keywordMatches = findRecipesByKeyword(specificDescription, allRecipes);
        console.log(`[mealPlanGeneratorV3] Keyword "${specificDescription}" matched ${keywordMatches.length} recipes:`, keywordMatches.map(m => `${m.recipe.name} (score=${m.score})`));

        // For explicit user requests, only enforce allergy constraints (safety),
        // not dietary style preferences or cook time — the user made a conscious choice.
        for (const { recipe: candidate, score } of keywordMatches) {
          if (usedRecipeIds.has(candidate.id)) {
            console.log(`[mealPlanGeneratorV3]   Skipping "${candidate.name}": already used`);
            continue;
          }

          let compatible = true;
          let rejectReason = "";
          for (const member of members) {
            for (const allergy of member.allergies) {
              if (candidate.allergens.includes(allergy)) {
                compatible = false;
                rejectReason = `${member.name} has ${allergy} allergy`;
                break;
              }
            }
            if (!compatible) break;
          }

          if (compatible) {
            recipe = candidate;
            console.log(`[mealPlanGeneratorV3] Matched specific request "${specificDescription}" on ${day} → ${candidate.name} (score=${score})`);
            break;
          } else {
            console.log(`[mealPlanGeneratorV3]   Skipping "${candidate.name}": ${rejectReason}`);
          }
        }

        if (!recipe) {
          console.log(`[mealPlanGeneratorV3] No compatible match for "${specificDescription}" on ${day}, falling back to normal selection`);
        }
      }

      // Fall back to normal selection if no specific match
      if (!recipe) {
        recipe = selectRecipe({
          recipes: allRecipes,
          members: members,
          memberIds: members.map((m) => m.id),
          maxCookTime,
          usedRecipeIds,
          vegetarianRatio,
          isVegetarianDay: shouldBeVegetarianDay(plannedMeals, vegetarianRatio),
        });
      }

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
      let assignments = daySchedule.main_assignments;

      // If no explicit assignments provided, generate default ones
      // so that customize_mains still produces meals
      if (!assignments || assignments.length === 0) {
        const numMains = daySchedule.num_mains || 2;
        assignments = Array.from({ length: numMains }, (_, i) => ({
          main_number: i + 1,
          member_ids: members.map((m: any) => m.id),
        }));
      }

      for (const assignment of assignments) {
        const memberIds = assignment.member_ids || [];

        // Use all members if none specified for this assignment
        const effectiveMemberIds = memberIds.length > 0
          ? memberIds
          : members.map((m: any) => m.id);

        const assignedMembers = members.filter((m) =>
          effectiveMemberIds.includes(m.id)
        );

        const recipe = selectRecipe({
          recipes: allRecipes,
          members: assignedMembers,
          memberIds: effectiveMemberIds,
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
            assigned_member_ids: JSON.stringify(effectiveMemberIds),
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

  // 6. Log and insert all planned meals
  console.log(`[mealPlanGeneratorV3] Total meals to insert: ${plannedMeals.length}`);
  const mainsByDay: Record<string, number> = {};
  for (const meal of plannedMeals) {
    if (meal.meal_type === "main") {
      mainsByDay[meal.day] = (mainsByDay[meal.day] || 0) + 1;
    }
  }
  console.log("[mealPlanGeneratorV3] Mains per day:", mainsByDay);
  const duplicateMainDays = Object.entries(mainsByDay).filter(([, count]) => count > 1);
  if (duplicateMainDays.length > 0) {
    console.warn("[mealPlanGeneratorV3] DUPLICATE MAINS:", duplicateMainDays);
  }
  console.log("[mealPlanGeneratorV3] All planned meals:", plannedMeals.map(m => `${m.day}/${m.meal_type}/${m.recipe_id}`));

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

// Helper: Extract meaningful food words from a description like "Ina Garten's mac and cheese"
function extractFoodWords(description: string): string[] {
  const lower = description.toLowerCase();

  // Common stop words and non-food words to filter out
  const stopWords = new Set([
    "a", "an", "the", "and", "or", "with", "in", "on", "for", "of", "my",
    "her", "his", "their", "our", "your", "its", "from", "to", "at", "by",
    "style", "recipe", "dish", "homemade", "classic", "famous", "best",
    "easy", "quick", "simple", "favorite", "favourite", "night", "dinner",
    "lunch", "meal", "like", "type", "kind", "some", "good", "great",
    "really", "super", "ina", "garten", "giada", "julia", "child",
    "gordon", "ramsay", "jamie", "oliver", "bobby", "flay", "ree",
    "drummond", "alton", "brown", "martha", "stewart", "rachael", "ray",
    "barefoot", "contessa", "pioneer", "woman",
  ]);

  // Split on non-alpha characters, possessives, etc.
  const words = lower
    .replace(/[''`]/g, " ")   // possessives like "garten's" → "garten s"
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !stopWords.has(w));

  return words;
}

// Helper: Find recipes matching a keyword description (e.g., "salmon", "tacos", "Ina Garten's mac and cheese")
function findRecipesByKeyword(keyword: string, recipes: Recipe[]): { recipe: Recipe; score: number }[] {
  const kw = keyword.toLowerCase();
  const foodWords = extractFoodWords(keyword);

  // Related terms for fallback matching
  const relatedTerms: Record<string, string[]> = {
    salmon: ["fish", "seafood"],
    tuna: ["fish", "seafood"],
    shrimp: ["shellfish", "seafood"],
    steak: ["beef"],
    burger: ["beef", "ground beef"],
    tacos: ["taco", "mexican"],
    taco: ["tacos", "mexican"],
    pasta: ["noodles", "italian"],
    pizza: ["italian"],
    curry: ["indian", "thai"],
    sushi: ["japanese", "fish"],
    chicken: ["poultry"],
    pork: ["pork chop", "pulled pork"],
    mac: ["macaroni", "pasta"],
    cheese: ["cheddar", "cheesy"],
    macaroni: ["mac", "pasta"],
  };

  const matches: { recipe: Recipe; score: number }[] = [];

  for (const recipe of recipes) {
    let score = 0;
    const nameLower = recipe.name.toLowerCase();
    const proteinLower = (recipe.protein_type || "").toLowerCase();
    const cuisineLower = (recipe.cuisine || "").toLowerCase();
    const tagsLower = recipe.tags.map((t) => t.toLowerCase());
    const ingredientNames = recipe.ingredients.map((ing: any) =>
      (typeof ing === "string" ? ing : ing.name || "").toLowerCase()
    );

    // Exact full-string name match
    if (nameLower === kw) {
      score = 200;
    }
    // Name contains full keyword string
    else if (nameLower.includes(kw)) {
      score = 150;
    }

    // If no full-string match, try matching individual food words
    if (score === 0 && foodWords.length > 0) {
      let nameHits = 0;
      let proteinHits = 0;
      let tagHits = 0;
      let ingredientHits = 0;
      let relatedHits = 0;

      for (const word of foodWords) {
        if (nameLower.includes(word)) {
          nameHits++;
        }
        if (proteinLower.includes(word)) {
          proteinHits++;
        }
        if (tagsLower.some((t) => t.includes(word)) || cuisineLower.includes(word)) {
          tagHits++;
        }
        if (ingredientNames.some((name) => name.includes(word))) {
          ingredientHits++;
        }
        // Check related terms for each food word
        if (relatedTerms[word]) {
          for (const related of relatedTerms[word]) {
            if (nameLower.includes(related) || proteinLower.includes(related) ||
                ingredientNames.some((name) => name.includes(related)) ||
                tagsLower.some((t) => t.includes(related))) {
              relatedHits++;
              break;
            }
          }
        }
      }

      const totalHits = nameHits + proteinHits + tagHits + ingredientHits + relatedHits;
      const hitRatio = totalHits / foodWords.length;

      // Require at least half the food words to match something
      if (hitRatio >= 0.5) {
        // Score based on where matches occurred and how many words matched
        if (nameHits >= 2) {
          score = 140; // Multiple food words in recipe name — strong match
        } else if (nameHits === 1 && (ingredientHits > 0 || relatedHits > 0)) {
          score = 120; // Name + ingredient/related match
        } else if (nameHits === 1) {
          score = 100; // Single name word match
        } else if (proteinHits > 0) {
          score = 80;
        } else if (ingredientHits >= 2) {
          score = 70; // Multiple ingredient matches
        } else if (tagHits > 0 || ingredientHits > 0) {
          score = 60;
        } else if (relatedHits > 0) {
          score = 40;
        }

        // Bonus for matching more food words
        score += Math.min(totalHits - 1, 3) * 5;
      }
    }

    // Single-word fallback: protein, tag/cuisine, ingredient, related terms
    if (score === 0 && foodWords.length <= 1) {
      const singleWord = foodWords[0] || kw;
      if (proteinLower.includes(singleWord)) {
        score = 100;
      } else if (tagsLower.some((t) => t.includes(singleWord)) || cuisineLower.includes(singleWord)) {
        score = 80;
      } else if (ingredientNames.some((name) => name.includes(singleWord))) {
        score = 50;
      }

      if (score === 0 && relatedTerms[singleWord]) {
        for (const related of relatedTerms[singleWord]) {
          if (proteinLower.includes(related)) {
            score = 60;
            break;
          }
          if (cuisineLower.includes(related) || tagsLower.some((t) => t.includes(related))) {
            score = 40;
            break;
          }
          if (ingredientNames.some((name) => name.includes(related))) {
            score = 30;
            break;
          }
        }
      }
    }

    if (score > 0) {
      matches.push({ recipe, score });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches;
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
