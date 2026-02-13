// routes/meal-plans-v3.ts
// Enhanced meal plan generation with multi-main and lunch support

import { Router, Request, Response } from "express";
import db from "../db";
import { generateMealPlanV3 } from "../services/mealPlanGeneratorV3";

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

// Get meal plan with full details (V3 format)
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const mealPlan = db
      .prepare(
        `SELECT
          id, family_id, week_start, variant, created_at
        FROM meal_plans
        WHERE id = ?`
      )
      .get(id) as any;

    if (!mealPlan) {
      return res.status(404).json({ error: "Meal plan not found" });
    }

    // Get all meal items for this plan
    const items = db
      .prepare(
        `SELECT
          mpi.id, mpi.meal_plan_id, mpi.day, mpi.recipe_id, mpi.locked,
          mpi.meal_type, mpi.main_number, mpi.assigned_member_ids,
          mpi.parent_meal_item_id, mpi.is_custom, mpi.notes,
          r.name as recipe_name, r.cuisine, r.vegetarian, r.protein_type,
          r.cook_minutes, r.allergens, r.kid_friendly, r.makes_leftovers,
          r.ingredients, r.tags, r.difficulty
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
          END,
          mpi.meal_type,
          mpi.main_number`
      )
      .all(id) as any[];

    // Parse JSON fields
    const parsedItems = items.map((item: any) => ({
      ...item,
      locked: Boolean(item.locked),
      is_custom: Boolean(item.is_custom),
      assigned_member_ids: item.assigned_member_ids
        ? JSON.parse(item.assigned_member_ids)
        : null,
      allergens: item.allergens ? JSON.parse(item.allergens) : [],
      ingredients: item.ingredients ? JSON.parse(item.ingredients) : [],
      tags: item.tags ? JSON.parse(item.tags) : [],
      kid_friendly: Boolean(item.kid_friendly),
      makes_leftovers: Boolean(item.makes_leftovers),
      vegetarian: Boolean(item.vegetarian),
    }));

    res.json({
      ...mealPlan,
      items: parsedItems,
    });
  } catch (error) {
    console.error("Get meal plan error:", error);
    res.status(500).json({ error: "Failed to fetch meal plan" });
  }
});

export default router;
