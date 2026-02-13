// routes/meal-plans-v3.ts
// Enhanced meal plan generation with multi-main and lunch support

import { Router, Request, Response } from "express";
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

export default router;
