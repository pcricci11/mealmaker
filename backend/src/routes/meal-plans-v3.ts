// routes/meal-plans-v3.ts
// Enhanced meal plan generation with multi-main and lunch support

import { Router, Request, Response } from "express";
import { generateMealPlanV3 } from "../services/mealPlanGeneratorV3";
import db from "../db";

const router = Router();

// Generate meal plan V3 (enhanced)
router.post("/generate-v3", async (req: Request, res: Response) => {
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
    } = req.body;

    if (!family_id || !week_start || !cooking_schedule) {
      return res.status(400).json({
        error: "family_id, week_start, and cooking_schedule are required",
      });
    }

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
    });

    res.status(201).json(mealPlan);
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

// Mark a meal item as "loved"
router.post("/items/:id/love", async (req, res) => {
  try {
    const itemId = parseInt(req.params.id);

    // Get the recipe_id from the meal item
    const item: any = db
      .prepare("SELECT recipe_id FROM meal_plan_items WHERE id = ?")
      .get(itemId);

    if (!item || !item.recipe_id) {
      return res.status(404).json({ error: "Meal item not found or has no recipe" });
    }

    // For now, we'll just log it
    // In Phase 8, we'll actually use this to boost recipe scores
    console.log(`Recipe ${item.recipe_id} was loved!`);

    // TODO: Store this in a "loved_recipes" table or update recipe metadata
    // For now, just return success
    res.json({ message: "Meal marked as loved", recipe_id: item.recipe_id });
  } catch (error) {
    console.error("Mark as loved error:", error);
    res.status(500).json({ error: "Failed to mark meal as loved" });
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

export default router;
