// routes/meal-plans-v3.ts
// Enhanced meal plan generation with multi-main and lunch support

import { Router, Request, Response } from "express";
import { generateMealPlanV3 } from "../services/mealPlanGeneratorV3";
import { extractIngredientsFromUrl } from "../services/ingredientExtractor";
import { query, queryOne, queryRaw } from "../db";
import { requireAuth, verifyFamilyAccess } from "../middleware/auth";

const router = Router();

// All V3 meal plan routes require auth
router.use(requireAuth);
let generateCallCount = 0;

// Generate meal plan V3 (enhanced)
router.post("/generate-v3", async (req: Request, res: Response) => {
  generateCallCount++;
  const callId = generateCallCount;
  console.log(`[generate-v3] === CALL #${callId} START ===`);
  try {
    const {
      family_id,
      week_start,
      cooking_schedule,
      lunch_needs,
      max_cook_minutes_weekday,
      max_cook_minutes_weekend,
      vegetarian_ratio,
      settings,
      specific_meals,
      locks,
    } = req.body;

    if (!family_id || !week_start || !cooking_schedule) {
      return res.status(400).json({
        error: "family_id, week_start, and cooking_schedule are required",
      });
    }

    // Verify family belongs to household
    const familyRow = await verifyFamilyAccess(family_id, req.householdId);
    if (!familyRow) {
      return res.status(404).json({ error: "Family not found" });
    }

    // Debug: log incoming cooking schedule
    console.log("[generate-v3] cooking_schedule received:", JSON.stringify(cooking_schedule, null, 2));
    const dayCount: Record<string, number> = {};
    for (const entry of cooking_schedule) {
      dayCount[entry.day] = (dayCount[entry.day] || 0) + 1;
    }
    const duplicateDays = Object.entries(dayCount).filter(([, count]) => count > 1);
    if (duplicateDays.length > 0) {
      console.warn("[generate-v3] DUPLICATE DAYS in cooking_schedule:", duplicateDays);
    }
    console.log("[generate-v3] Days cooking:", cooking_schedule.filter((d: any) => d.is_cooking).map((d: any) => d.day));

    // Generate the meal plan
    const mealPlan = await generateMealPlanV3({
      familyId: family_id,
      weekStart: week_start,
      cookingSchedule: cooking_schedule,
      lunchNeeds: lunch_needs || [],
      maxCookMinutesWeekday: max_cook_minutes_weekday || 45,
      maxCookMinutesWeekend: max_cook_minutes_weekend || 90,
      vegetarianRatio: vegetarian_ratio || 40,
      settings: settings || {},
      specificMeals: specific_meals,
      locks: locks || undefined,
      householdId: req.householdId || null,
      createdBy: req.user!.id,
    });

    // Fetch the generated items with recipe details
    const items = await query(`
      SELECT mpi.id, mpi.meal_plan_id, mpi.day, mpi.recipe_id, mpi.locked,
             mpi.meal_type, mpi.main_number, mpi.assigned_member_ids,
             mpi.parent_meal_item_id, mpi.is_custom, mpi.notes,
             r.name as recipe_name, r.cuisine, r.vegetarian,
             r.protein_type, r.cook_minutes, r.makes_leftovers, r.kid_friendly
      FROM meal_plan_items mpi
      LEFT JOIN recipes r ON r.id = mpi.recipe_id
      WHERE mpi.meal_plan_id = $1
      ORDER BY CASE mpi.day
        WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2 WHEN 'wednesday' THEN 3
        WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5 WHEN 'saturday' THEN 6 WHEN 'sunday' THEN 7
      END, mpi.meal_type, mpi.main_number
    `, [mealPlan.id]);

    console.log(`[generate-v3] === CALL #${callId} END === planId=${mealPlan.id}, items=${items.length}`);

    res.status(201).json({
      ...mealPlan,
      items: items.map((row: any) => ({
        id: row.id,
        day: row.day,
        recipe_id: row.recipe_id,
        meal_type: row.meal_type || "main",
        main_number: row.main_number || null,
        is_custom: !!row.is_custom,
        notes: row.notes ? (() => { try { return JSON.parse(row.notes); } catch { return row.notes; } })() : null,
        recipe_name: row.recipe_name || (row.notes ? (() => { try { return JSON.parse(row.notes)?.side_name; } catch { return null; } })() : null),
        cuisine: row.cuisine || null,
        vegetarian: !!row.vegetarian,
        cook_minutes: row.cook_minutes || null,
        makes_leftovers: !!row.makes_leftovers,
        kid_friendly: !!row.kid_friendly,
      })),
    });

    // Fire-and-forget: extract ingredients in background for recipes that have none
    (async () => {
      const assignedRecipes = await query<{ id: number; name: string; source_url: string; ingredients: string }>(`
        SELECT DISTINCT r.id, r.name, r.source_url, r.ingredients
        FROM meal_plan_items mpi
        JOIN recipes r ON r.id = mpi.recipe_id
        WHERE mpi.meal_plan_id = $1
          AND r.source_url IS NOT NULL
          AND (r.ingredients IS NULL OR r.ingredients = '[]' OR r.ingredients = '')
      `, [mealPlan.id]);

      if (assignedRecipes.length > 0) {
        const famRow = await queryOne<{ serving_multiplier: number }>(
          "SELECT serving_multiplier FROM families WHERE id = $1",
          [family_id],
        );
        const servings = Math.round((famRow?.serving_multiplier ?? 1.0) * 4);

        console.log(`[generate-v3] Background backfill: ${assignedRecipes.length} recipes need ingredients (${servings} servings)`);
        for (const recipe of assignedRecipes) {
          console.log(`[generate-v3] Extracting ingredients for #${recipe.id} "${recipe.name}"...`);
          const extracted = await extractIngredientsFromUrl(recipe.name, recipe.source_url, servings);
          if (extracted.length > 0) {
            await query("UPDATE recipes SET ingredients = $1 WHERE id = $2", [
              JSON.stringify(extracted),
              recipe.id,
            ]);
            for (const ing of extracted) {
              await query(
                "INSERT INTO recipe_ingredients (recipe_id, item, quantity, unit, category) VALUES ($1, $2, $3, $4, $5)",
                [recipe.id, ing.name, ing.quantity, ing.unit, ing.category],
              );
            }
            console.log(`[generate-v3] Extracted ${extracted.length} ingredients for #${recipe.id} "${recipe.name}"`);
          } else {
            console.warn(`[generate-v3] Failed to extract ingredients for #${recipe.id} "${recipe.name}"`);
          }
        }
      }
    })().catch((err) => {
      console.error("[generate-v3] Background ingredient extraction failed:", err);
    });
  } catch (error: any) {
    console.error("Generate meal plan V3 error:", error);
    res.status(500).json({
      error: error.message || "Failed to generate meal plan",
    });
  }
});

// Clone an existing meal plan to the current week
router.post("/:id/clone", async (req: Request, res: Response) => {
  try {
    const sourcePlanId = parseInt(req.params.id);
    const { week_start, mode } = req.body as { week_start: string; mode?: "replace" | "merge" };
    const cloneMode = mode || "replace";

    if (!week_start) {
      return res.status(400).json({ error: "week_start is required" });
    }

    // Get the source plan
    const sourcePlan = await queryOne(
      "SELECT * FROM meal_plans WHERE id = $1 AND (household_id = $2 OR household_id IS NULL)",
      [sourcePlanId, req.householdId],
    );
    if (!sourcePlan) {
      return res.status(404).json({ error: "Source plan not found" });
    }

    // Get all main items from the source plan that have a recipe_id
    const sourceItems = await query<{ day: string; recipe_id: number; meal_type: string; main_number: number | null }>(`
      SELECT day, recipe_id, meal_type, main_number
      FROM meal_plan_items
      WHERE meal_plan_id = $1 AND recipe_id IS NOT NULL AND meal_type = 'main'
      ORDER BY CASE day
        WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2 WHEN 'wednesday' THEN 3
        WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5 WHEN 'saturday' THEN 6 WHEN 'sunday' THEN 7
      END, main_number
    `, [sourcePlanId]);

    if (sourceItems.length === 0) {
      return res.status(400).json({ error: "Source plan has no recipes to clone" });
    }

    // Find or create a plan for the target week
    const existing = await queryOne<{ id: number }>(
      "SELECT id FROM meal_plans WHERE family_id = $1 AND week_start = $2 AND variant = 0",
      [sourcePlan.family_id, week_start],
    );

    let newPlanId: number;
    if (existing) {
      newPlanId = existing.id;
      if (cloneMode === "replace") {
        await query("DELETE FROM meal_plan_items WHERE meal_plan_id = $1", [newPlanId]);
      }
    } else {
      const result = await queryOne<{ id: number }>(
        "INSERT INTO meal_plans (family_id, week_start, variant) VALUES ($1, $2, 0) RETURNING id",
        [sourcePlan.family_id, week_start],
      );
      newPlanId = result!.id;
    }

    // For merge mode, find the max main_number per day so we can append after existing mains
    const dayMainOffset: Record<string, number> = {};
    if (cloneMode === "merge" && existing) {
      const existingMains = await query<{ day: string; max_num: number | null }>(
        "SELECT day, MAX(main_number) as max_num FROM meal_plan_items WHERE meal_plan_id = $1 AND meal_type = 'main' GROUP BY day",
        [newPlanId],
      );
      for (const row of existingMains) {
        dayMainOffset[row.day] = row.max_num || 0;
      }
    }

    // Copy the items
    for (const item of sourceItems) {
      const offset = dayMainOffset[item.day] || 0;
      const mainNum = (item.main_number || 1) + offset;
      await query(
        "INSERT INTO meal_plan_items (meal_plan_id, day, recipe_id, meal_type, main_number, locked) VALUES ($1, $2, $3, $4, $5, TRUE)",
        [newPlanId, item.day, item.recipe_id, item.meal_type, mainNum],
      );
    }

    // Fetch the new plan with items
    const savedItems = await query(`
      SELECT mpi.id, mpi.meal_plan_id, mpi.day, mpi.recipe_id, mpi.locked,
             mpi.meal_type, mpi.main_number, mpi.is_custom, mpi.notes,
             r.name as recipe_name, r.cuisine, r.vegetarian,
             r.protein_type, r.cook_minutes, r.makes_leftovers, r.kid_friendly,
             r.source_url, r.difficulty, r.allergens, r.ingredients, r.tags,
             r.source_type, r.source_name, r.seasonal_tags, r.frequency_cap_per_month,
             r.kid_friendly as r_kid_friendly
      FROM meal_plan_items mpi
      LEFT JOIN recipes r ON r.id = mpi.recipe_id
      WHERE mpi.meal_plan_id = $1
      ORDER BY CASE mpi.day
        WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2 WHEN 'wednesday' THEN 3
        WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5 WHEN 'saturday' THEN 6 WHEN 'sunday' THEN 7
      END, mpi.meal_type, mpi.main_number
    `, [newPlanId]);

    res.status(201).json({
      id: newPlanId,
      family_id: sourcePlan.family_id,
      week_start,
      variant: 0,
      items: savedItems.map((row: any) => ({
        id: row.id,
        meal_plan_id: newPlanId,
        day: row.day,
        recipe_id: row.recipe_id,
        locked: !!row.locked,
        lunch_leftover_label: null,
        leftover_lunch_recipe_id: null,
        meal_type: row.meal_type || "main",
        main_number: row.main_number || null,
        assigned_member_ids: null,
        parent_meal_item_id: null,
        is_custom: !!row.is_custom,
        notes: null,
        recipe_name: row.recipe_name || null,
        recipe: row.recipe_id ? {
          id: row.recipe_id,
          title: row.recipe_name,
          cuisine: row.cuisine,
          vegetarian: !!row.vegetarian,
          protein_type: row.protein_type,
          cook_minutes: row.cook_minutes,
          allergens: JSON.parse(row.allergens || "[]"),
          kid_friendly: !!row.r_kid_friendly,
          makes_leftovers: !!row.makes_leftovers,
          leftovers_score: 0,
          ingredients: JSON.parse(row.ingredients || "[]"),
          tags: JSON.parse(row.tags || "[]"),
          source_type: row.source_type || "seeded",
          source_name: row.source_name || null,
          source_url: row.source_url || null,
          difficulty: row.difficulty || "medium",
          seasonal_tags: JSON.parse(row.seasonal_tags || "[]"),
          frequency_cap_per_month: row.frequency_cap_per_month || null,
          notes: null,
        } : null,
      })),
    });
  } catch (error: any) {
    console.error("Clone meal plan error:", error);
    res.status(500).json({ error: error.message || "Failed to clone meal plan" });
  }
});

// Get meal plan history for a family
router.get("/history", async (req, res) => {
  try {
    const familyId = req.query.family_id ? parseInt(req.query.family_id as string) : null;

    let sql = `
      SELECT
        mp.id, mp.family_id, mp.week_start, mp.variant, mp.created_at
      FROM meal_plans mp
      WHERE (mp.household_id = $1 OR mp.household_id IS NULL)
    `;

    const params: any[] = [req.householdId];
    let paramIndex = 2;

    if (familyId) {
      sql += ` AND mp.family_id = $${paramIndex++}`;
      params.push(familyId);
    }

    sql += ` ORDER BY mp.week_start DESC, mp.created_at DESC`;

    const plans = await query(sql, params);

    // For each plan, get a summary of items
    const plansWithItems = await Promise.all(plans.map(async (plan: any) => {
      const items = await query(
        `SELECT
          mpi.id, mpi.day, mpi.meal_type, mpi.main_number,
          r.name as recipe_name
        FROM meal_plan_items mpi
        LEFT JOIN recipes r ON mpi.recipe_id = r.id
        WHERE mpi.meal_plan_id = $1
        ORDER BY
          CASE mpi.day
            WHEN 'monday' THEN 1
            WHEN 'tuesday' THEN 2
            WHEN 'wednesday' THEN 3
            WHEN 'thursday' THEN 4
            WHEN 'friday' THEN 5
            WHEN 'saturday' THEN 6
            WHEN 'sunday' THEN 7
          END`,
        [plan.id],
      );

      return {
        ...plan,
        items,
      };
    }));

    res.json(plansWithItems);
  } catch (error) {
    console.error("Get history error:", error);
    res.status(500).json({ error: "Failed to fetch meal plan history" });
  }
});

// Toggle a meal item as "loved" (persists to family_favorite_meals)
router.post("/items/:id/love", async (req, res) => {
  try {
    const itemId = parseInt(req.params.id);

    // Get recipe name and family_id via meal_plan_items → recipes / meal_plans
    const item: any = await queryOne(
      `SELECT mpi.recipe_id, r.name as recipe_name, mp.family_id
       FROM meal_plan_items mpi
       JOIN recipes r ON r.id = mpi.recipe_id
       JOIN meal_plans mp ON mp.id = mpi.meal_plan_id
       WHERE mpi.id = $1`,
      [itemId],
    );

    if (!item || !item.recipe_name) {
      return res.status(404).json({ error: "Meal item not found or has no recipe" });
    }

    // Check if already favorited
    const existing: any = await queryOne(
      "SELECT id FROM family_favorite_meals WHERE family_id = $1 AND name = $2",
      [item.family_id, item.recipe_name],
    );

    if (existing) {
      // Already loved → unlove (toggle off)
      await query("DELETE FROM family_favorite_meals WHERE id = $1", [existing.id]);
      res.json({ loved: false, recipe_id: item.recipe_id, name: item.recipe_name });
    } else {
      // Not loved → love (toggle on)
      const result = await queryOne<{ id: number }>(
        "INSERT INTO family_favorite_meals (family_id, name) VALUES ($1, $2) RETURNING id",
        [item.family_id, item.recipe_name],
      );
      res.json({ loved: true, id: result!.id, recipe_id: item.recipe_id, name: item.recipe_name });
    }
  } catch (error) {
    console.error("Toggle love error:", error);
    res.status(500).json({ error: "Failed to toggle love" });
  }
});

// Copy a meal item to another day/week
router.post("/items/:id/copy", async (req, res) => {
  try {
    const itemId = parseInt(req.params.id);
    const { target_day, target_week_start } = req.body;

    if (!target_day || !target_week_start) {
      return res.status(400).json({
        error: "target_day and target_week_start are required"
      });
    }

    // Get the source meal item (join meal_plans to get family_id)
    const sourceItem: any = await queryOne(
      `SELECT mpi.*, mp.family_id FROM meal_plan_items mpi
       JOIN meal_plans mp ON mpi.meal_plan_id = mp.id
       WHERE mpi.id = $1`,
      [itemId],
    );

    if (!sourceItem) {
      return res.status(404).json({ error: "Meal item not found" });
    }

    // Find or create a meal plan for the target week
    let targetPlan: any = await queryOne(
      `SELECT id FROM meal_plans
      WHERE family_id = $1 AND week_start = $2 AND variant = 0`,
      [sourceItem.family_id, target_week_start],
    );

    if (!targetPlan) {
      targetPlan = await queryOne(
        `INSERT INTO meal_plans (family_id, week_start, variant)
        VALUES ($1, $2, 0) RETURNING id`,
        [sourceItem.family_id, target_week_start],
      );
    }

    // Copy the meal item to the target plan and day
    await query(
      `INSERT INTO meal_plan_items
      (meal_plan_id, day, recipe_id, locked, meal_type, main_number,
       assigned_member_ids, is_custom, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        targetPlan.id,
        target_day,
        sourceItem.recipe_id,
        sourceItem.locked,
        sourceItem.meal_type,
        sourceItem.main_number,
        sourceItem.assigned_member_ids,
        sourceItem.is_custom,
        sourceItem.notes,
      ],
    );

    res.json({
      message: "Meal copied successfully",
      target_plan_id: targetPlan.id
    });
  } catch (error) {
    console.error("Copy meal error:", error);
    res.status(500).json({ error: "Failed to copy meal" });
  }
});

// Delete a meal plan item (main or side); if main, also delete child sides
router.delete("/items/:id", async (req, res) => {
  try {
    const itemId = parseInt(req.params.id);

    const item: any = await queryOne(
      "SELECT * FROM meal_plan_items WHERE id = $1",
      [itemId],
    );

    if (!item) {
      return res.status(404).json({ error: "Meal plan item not found" });
    }

    // If it's a main, also delete its child sides
    if (item.meal_type === "main") {
      await query(
        "DELETE FROM meal_plan_items WHERE parent_meal_item_id = $1",
        [itemId],
      );
    }

    await query("DELETE FROM meal_plan_items WHERE id = $1", [itemId]);

    res.json({ message: "Meal plan item removed successfully" });
  } catch (error) {
    console.error("Delete meal plan item error:", error);
    res.status(500).json({ error: "Failed to delete meal plan item" });
  }
});

// Lock an existing meal plan: save draft items and extract ingredients (NO regeneration)
router.post("/lock", async (req: Request, res: Response) => {
  console.log("[lock] === Lock Plan START ===");
  try {
    const { family_id, week_start, items } = req.body as {
      family_id: number;
      week_start: string;
      items: Array<{ day: string; recipe_id: number }>;
    };

    if (!family_id || !week_start || !items || items.length === 0) {
      return res.status(400).json({
        error: "family_id, week_start, and items are required",
      });
    }

    // Verify family belongs to household
    const familyRow = await verifyFamilyAccess(family_id, req.householdId);
    if (!familyRow) {
      return res.status(404).json({ error: "Family not found" });
    }

    // Find or create the meal plan
    const existing = await queryOne<{ id: number }>(
      `SELECT id FROM meal_plans WHERE family_id = $1 AND week_start = $2 AND variant = 0`,
      [family_id, week_start],
    );

    let mealPlanId: number;
    if (existing) {
      mealPlanId = existing.id;
    } else {
      const planResult = await queryOne<{ id: number }>(
        `INSERT INTO meal_plans (family_id, week_start, variant) VALUES ($1, $2, 0) RETURNING id`,
        [family_id, week_start],
      );
      mealPlanId = planResult!.id;
    }

    // Clear existing items and insert the user's selections
    await query(`DELETE FROM meal_plan_items WHERE meal_plan_id = $1`, [mealPlanId]);
    console.log(`[lock] Plan ${mealPlanId}, cleared old items`);

    const dayMainCount: Record<string, number> = {};
    for (const item of items) {
      dayMainCount[item.day] = (dayMainCount[item.day] || 0) + 1;
      await query(
        `INSERT INTO meal_plan_items (meal_plan_id, day, recipe_id, meal_type, main_number, locked)
         VALUES ($1, $2, $3, 'main', $4, TRUE)`,
        [mealPlanId, item.day, item.recipe_id, dayMainCount[item.day]],
      );
    }
    console.log(`[lock] Inserted ${items.length} items`);

    // Fetch the saved items with recipe details
    const savedItems = await query(`
      SELECT mpi.id, mpi.meal_plan_id, mpi.day, mpi.recipe_id, mpi.locked,
             mpi.meal_type, mpi.main_number, mpi.is_custom, mpi.notes,
             r.name as recipe_name, r.cuisine, r.vegetarian,
             r.protein_type, r.cook_minutes, r.makes_leftovers, r.kid_friendly
      FROM meal_plan_items mpi
      LEFT JOIN recipes r ON r.id = mpi.recipe_id
      WHERE mpi.meal_plan_id = $1
      ORDER BY CASE mpi.day
        WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2 WHEN 'wednesday' THEN 3
        WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5 WHEN 'saturday' THEN 6 WHEN 'sunday' THEN 7
      END, mpi.meal_type, mpi.main_number
    `, [mealPlanId]);

    console.log(`[lock] === Lock Plan END === planId=${mealPlanId}, items=${savedItems.length}`);

    res.status(201).json({
      id: mealPlanId,
      family_id,
      week_start,
      variant: 0,
      items: savedItems.map((row: any) => ({
        id: row.id,
        day: row.day,
        recipe_id: row.recipe_id,
        meal_type: row.meal_type || "main",
        main_number: row.main_number || null,
        is_custom: !!row.is_custom,
        notes: row.notes ? (() => { try { return JSON.parse(row.notes); } catch { return row.notes; } })() : null,
        recipe_name: row.recipe_name || null,
        cuisine: row.cuisine || null,
        vegetarian: !!row.vegetarian,
        cook_minutes: row.cook_minutes || null,
        makes_leftovers: !!row.makes_leftovers,
        kid_friendly: !!row.kid_friendly,
      })),
    });

    // Fire-and-forget: extract ingredients in background for recipes that have none
    (async () => {
      const assignedRecipes = await query<{ id: number; name: string; source_url: string; ingredients: string }>(`
        SELECT DISTINCT r.id, r.name, r.source_url, r.ingredients
        FROM meal_plan_items mpi
        JOIN recipes r ON r.id = mpi.recipe_id
        WHERE mpi.meal_plan_id = $1
          AND r.source_url IS NOT NULL
          AND (r.ingredients IS NULL OR r.ingredients = '[]' OR r.ingredients = '')
      `, [mealPlanId]);

      if (assignedRecipes.length > 0) {
        const famRow = await queryOne<{ serving_multiplier: number }>(
          "SELECT serving_multiplier FROM families WHERE id = $1",
          [family_id],
        );
        const servings = Math.round((famRow?.serving_multiplier ?? 1.0) * 4);

        console.log(`[lock] Background backfill: ${assignedRecipes.length} recipes need ingredients (${servings} servings)`);
        for (const recipe of assignedRecipes) {
          console.log(`[lock] Extracting ingredients for #${recipe.id} "${recipe.name}"...`);
          const extracted = await extractIngredientsFromUrl(recipe.name, recipe.source_url, servings);
          if (extracted.length > 0) {
            await query("UPDATE recipes SET ingredients = $1 WHERE id = $2", [
              JSON.stringify(extracted),
              recipe.id,
            ]);
            for (const ing of extracted) {
              await query(
                "INSERT INTO recipe_ingredients (recipe_id, item, quantity, unit, category) VALUES ($1, $2, $3, $4, $5)",
                [recipe.id, ing.name, ing.quantity, ing.unit, ing.category],
              );
            }
            console.log(`[lock] Extracted ${extracted.length} ingredients for #${recipe.id}`);
          }
        }
      }
    })().catch((err) => {
      console.error("[lock] Background ingredient extraction failed:", err);
    });
  } catch (error: any) {
    console.error("Lock meal plan error:", error);
    res.status(500).json({
      error: error.message || "Failed to lock meal plan",
    });
  }
});

// Add a recipe to a specific day on an existing meal plan
router.post("/:planId/items", async (req: Request, res: Response) => {
  try {
    const planId = parseInt(req.params.planId);
    const { day, recipe_id, meal_type } = req.body;
    const type = meal_type || "main";

    if (!day || !recipe_id) {
      return res.status(400).json({ error: "day and recipe_id are required" });
    }

    // Validate plan exists
    const plan: any = await queryOne("SELECT id FROM meal_plans WHERE id = $1", [planId]);
    if (!plan) {
      return res.status(404).json({ error: "Meal plan not found" });
    }

    // Validate recipe exists
    const recipe: any = await queryOne("SELECT id, name FROM recipes WHERE id = $1", [recipe_id]);
    if (!recipe) {
      return res.status(404).json({ error: "Recipe not found" });
    }

    // Calculate next main_number for this day
    const maxRow: any = await queryOne(
      "SELECT MAX(main_number) as max_num FROM meal_plan_items WHERE meal_plan_id = $1 AND day = $2 AND meal_type = $3",
      [planId, day, type],
    );
    const mainNumber = (maxRow?.max_num ?? 0) + 1;

    const result = await queryOne<{ id: number }>(
      `INSERT INTO meal_plan_items (meal_plan_id, day, recipe_id, meal_type, main_number)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [planId, day, recipe_id, type, mainNumber],
    );

    res.status(201).json({
      id: result!.id,
      meal_plan_id: planId,
      day,
      recipe_id,
      meal_type: type,
      main_number: mainNumber,
      recipe_name: recipe.name,
    });
  } catch (error: any) {
    console.error("Add meal to day error:", error);
    res.status(500).json({ error: error.message || "Failed to add meal to day" });
  }
});

export default router;
