// routes/meal-plans-v3.ts
// Enhanced meal plan generation with multi-main and lunch support

import { Router, Request, Response } from "express";
import { generateMealPlanV3 } from "../services/mealPlanGeneratorV3";
import { extractIngredientsFromUrl } from "../services/ingredientExtractor";
import db from "../db";

const router = Router();
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
    });

    // Lazy backfill: extract ingredients for any assigned recipe that has none
    const assignedRecipes = db.prepare(`
      SELECT DISTINCT r.id, r.name, r.source_url, r.ingredients
      FROM meal_plan_items mpi
      JOIN recipes r ON r.id = mpi.recipe_id
      WHERE mpi.meal_plan_id = ?
        AND r.source_url IS NOT NULL
        AND (r.ingredients IS NULL OR r.ingredients = '[]' OR r.ingredients = '')
    `).all(mealPlan.id) as Array<{ id: number; name: string; source_url: string; ingredients: string }>;

    if (assignedRecipes.length > 0) {
      console.log(`[generate-v3] Lazy backfill: ${assignedRecipes.length} assigned recipes have no ingredients`);
      for (const recipe of assignedRecipes) {
        console.log(`[generate-v3] Extracting ingredients for #${recipe.id} "${recipe.name}"...`);
        const extracted = await extractIngredientsFromUrl(recipe.name, recipe.source_url);
        if (extracted.length > 0) {
          db.prepare("UPDATE recipes SET ingredients = ? WHERE id = ?").run(
            JSON.stringify(extracted),
            recipe.id,
          );
          // Also populate recipe_ingredients table
          const insertIng = db.prepare(
            "INSERT INTO recipe_ingredients (recipe_id, item, quantity, unit, category) VALUES (?, ?, ?, ?, ?)",
          );
          for (const ing of extracted) {
            insertIng.run(recipe.id, ing.name, ing.quantity, ing.unit, ing.category);
          }
          console.log(`[generate-v3] Extracted ${extracted.length} ingredients for #${recipe.id} "${recipe.name}"`);
        } else {
          console.warn(`[generate-v3] Failed to extract ingredients for #${recipe.id} "${recipe.name}"`);
        }
      }
    }

    // Fetch the generated items with recipe details
    const items = db.prepare(`
      SELECT mpi.id, mpi.meal_plan_id, mpi.day, mpi.recipe_id, mpi.locked,
             mpi.meal_type, mpi.main_number, mpi.assigned_member_ids,
             mpi.parent_meal_item_id, mpi.is_custom, mpi.notes,
             r.name as recipe_name, r.cuisine, r.vegetarian,
             r.protein_type, r.cook_minutes, r.makes_leftovers, r.kid_friendly
      FROM meal_plan_items mpi
      LEFT JOIN recipes r ON r.id = mpi.recipe_id
      WHERE mpi.meal_plan_id = ?
      ORDER BY CASE mpi.day
        WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2 WHEN 'wednesday' THEN 3
        WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5 WHEN 'saturday' THEN 6 WHEN 'sunday' THEN 7
      END, mpi.meal_type, mpi.main_number
    `).all(mealPlan.id) as any[];

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
  } catch (error: any) {
    console.error("Generate meal plan V3 error:", error);
    res.status(500).json({
      error: error.message || "Failed to generate meal plan",
    });
  }
});

// Get meal plan history for a family
router.get("/history", async (req, res) => {
  try {
    const familyId = req.query.family_id ? parseInt(req.query.family_id as string) : null;

    let query = `
      SELECT
        mp.id, mp.family_id, mp.week_start, mp.variant, mp.created_at
      FROM meal_plans mp
    `;

    const params: any[] = [];

    if (familyId) {
      query += ` WHERE mp.family_id = ?`;
      params.push(familyId);
    }

    query += ` ORDER BY mp.week_start DESC, mp.created_at DESC`;

    const plans = db.prepare(query).all(...params);

    // For each plan, get a summary of items
    const plansWithItems = plans.map((plan: any) => {
      const items = db
        .prepare(
          `SELECT
            mpi.id, mpi.day, mpi.meal_type, mpi.main_number,
            r.name as recipe_name
          FROM meal_plan_items mpi
          LEFT JOIN recipes r ON mpi.recipe_id = r.id
          WHERE mpi.meal_plan_id = ?
          ORDER BY
            CASE mpi.day
              WHEN 'monday' THEN 1
              WHEN 'tuesday' THEN 2
              WHEN 'wednesday' THEN 3
              WHEN 'thursday' THEN 4
              WHEN 'friday' THEN 5
              WHEN 'saturday' THEN 6
              WHEN 'sunday' THEN 7
            END`
        )
        .all(plan.id);

      return {
        ...plan,
        items,
      };
    });

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
    const item: any = db
      .prepare(
        `SELECT mpi.recipe_id, r.name as recipe_name, mp.family_id
         FROM meal_plan_items mpi
         JOIN recipes r ON r.id = mpi.recipe_id
         JOIN meal_plans mp ON mp.id = mpi.meal_plan_id
         WHERE mpi.id = ?`
      )
      .get(itemId);

    if (!item || !item.recipe_name) {
      return res.status(404).json({ error: "Meal item not found or has no recipe" });
    }

    // Check if already favorited
    const existing: any = db
      .prepare(
        "SELECT id FROM family_favorite_meals WHERE family_id = ? AND name = ?"
      )
      .get(item.family_id, item.recipe_name);

    if (existing) {
      // Already loved → unlove (toggle off)
      db.prepare("DELETE FROM family_favorite_meals WHERE id = ?").run(existing.id);
      res.json({ loved: false, recipe_id: item.recipe_id, name: item.recipe_name });
    } else {
      // Not loved → love (toggle on)
      const result = db
        .prepare("INSERT INTO family_favorite_meals (family_id, name) VALUES (?, ?)")
        .run(item.family_id, item.recipe_name);
      res.json({ loved: true, id: result.lastInsertRowid, recipe_id: item.recipe_id, name: item.recipe_name });
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
    const sourceItem: any = db
      .prepare(
        `SELECT mpi.*, mp.family_id FROM meal_plan_items mpi
         JOIN meal_plans mp ON mpi.meal_plan_id = mp.id
         WHERE mpi.id = ?`
      )
      .get(itemId);

    if (!sourceItem) {
      return res.status(404).json({ error: "Meal item not found" });
    }

    // Find or create a meal plan for the target week
    let targetPlan: any = db
      .prepare(
        `SELECT id FROM meal_plans
        WHERE family_id = ? AND week_start = ? AND variant = 0`
      )
      .get(sourceItem.family_id, target_week_start);

    if (!targetPlan) {
      // Create a new plan for that week
      const result = db
        .prepare(
          `INSERT INTO meal_plans (family_id, week_start, variant)
          VALUES (?, ?, 0)`
        )
        .run(sourceItem.family_id, target_week_start);

      targetPlan = { id: result.lastInsertRowid };
    }

    // Copy the meal item to the target plan and day
    db.prepare(
      `INSERT INTO meal_plan_items
      (meal_plan_id, day, recipe_id, locked, meal_type, main_number,
       assigned_member_ids, is_custom, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      targetPlan.id,
      target_day,
      sourceItem.recipe_id,
      sourceItem.locked,
      sourceItem.meal_type,
      sourceItem.main_number,
      sourceItem.assigned_member_ids,
      sourceItem.is_custom,
      sourceItem.notes
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
router.delete("/items/:id", (req, res) => {
  try {
    const itemId = parseInt(req.params.id);

    const item: any = db
      .prepare("SELECT * FROM meal_plan_items WHERE id = ?")
      .get(itemId);

    if (!item) {
      return res.status(404).json({ error: "Meal plan item not found" });
    }

    // If it's a main, also delete its child sides
    if (item.meal_type === "main") {
      db.prepare(
        "DELETE FROM meal_plan_items WHERE parent_meal_item_id = ?"
      ).run(itemId);
    }

    db.prepare("DELETE FROM meal_plan_items WHERE id = ?").run(itemId);

    res.json({ message: "Meal plan item removed successfully" });
  } catch (error) {
    console.error("Delete meal plan item error:", error);
    res.status(500).json({ error: "Failed to delete meal plan item" });
  }
});

export default router;
