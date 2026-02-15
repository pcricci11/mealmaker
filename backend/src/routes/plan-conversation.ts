// routes/plan-conversation.ts
// Single endpoint: take conversational text, parse with Claude, generate meal plan, return full plan

import { Router, Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import db from "../db";
import { generateMealPlanV3 } from "../services/mealPlanGeneratorV3";

const router = Router();

const SYSTEM_PROMPT = `You are a meal planning assistant. The user will describe what they want for their week in natural language. Parse their description and return a JSON object with this exact structure:

{
  "cooking_days": {
    "monday": { "is_cooking": false, "meal_mode": "one_main" },
    "tuesday": { "is_cooking": false, "meal_mode": "one_main" },
    "wednesday": { "is_cooking": false, "meal_mode": "one_main" },
    "thursday": { "is_cooking": false, "meal_mode": "one_main" },
    "friday": { "is_cooking": false, "meal_mode": "one_main" },
    "saturday": { "is_cooking": false, "meal_mode": "one_main" },
    "sunday": { "is_cooking": false, "meal_mode": "one_main" }
  },
  "preferences": {
    "max_cook_minutes_weekday": 45,
    "max_cook_minutes_weekend": 90,
    "vegetarian_ratio": 40
  }
}

Rules:
- CRITICAL: Default ALL days to is_cooking: false. ONLY set is_cooking: true for days the user EXPLICITLY mentions as cooking days. Be literal — do not infer or assume additional days.
- If the user lists specific days (e.g. "Monday, Wednesday, Thursday"), ONLY those days get is_cooking: true. All other days MUST be is_cooking: false.
- If the user says they're "eating out", "ordering in", "not cooking", or "off" on a day, set is_cooking to false for that day.
- meal_mode should always be "one_main" unless they explicitly say they need multiple mains for a day.
- For preferences, use these defaults unless the user says otherwise: weekday 45 min, weekend 90 min, vegetarian_ratio 40.
- If the user says "quick meals" or mentions a time limit, adjust max_cook_minutes accordingly.
- If the user mentions wanting vegetarian, vegan, or meatless meals, increase vegetarian_ratio.
- Return ONLY valid JSON, no markdown fences, no explanation.`;

// POST /api/plan/generate-from-conversation
router.post("/generate-from-conversation", async (req: Request, res: Response) => {
  const { text } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: "text is required" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  // Get or create a default family
  let family: any = db.prepare("SELECT * FROM families LIMIT 1").get();
  if (!family) {
    const result = db.prepare(
      `INSERT INTO families (name, allergies, vegetarian_ratio, gluten_free, dairy_free, nut_free)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run("My Family", "[]", 40, 0, 0, 0);
    family = { id: result.lastInsertRowid };
  }

  const familyId = family.id;

  // Get family members for context
  const members = db
    .prepare("SELECT id, name FROM family_members WHERE family_id = ?")
    .all(familyId) as { id: number; name: string }[];

  const memberContext = members.length > 0
    ? `Family members: ${members.map((m) => m.name).join(", ")}`
    : "Single person household.";

  // Step 1: Parse conversation with Claude
  const client = new Anthropic({ apiKey });

  let parsed: any;
  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `${memberContext}\n\nUser's description:\n"${text}"`,
        },
      ],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      return res.status(500).json({ error: "Unexpected response from Claude" });
    }

    const rawText = content.text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
    parsed = JSON.parse(rawText);
  } catch (error: any) {
    console.error("Claude parsing error:", error);
    if (error instanceof SyntaxError) {
      return res.status(500).json({ error: "Failed to parse Claude response" });
    }
    return res.status(500).json({ error: error.message || "Failed to parse conversation" });
  }

  // Step 2: Convert parsed data into cooking schedule format for V3 generator
  const cookingDays = parsed.cooking_days || {};
  const preferences = parsed.preferences || {};

  const daysOfWeek = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const cookingSchedule = daysOfWeek.map((day) => ({
    day,
    is_cooking: cookingDays[day]?.is_cooking ?? false,
    meal_mode: cookingDays[day]?.meal_mode || "one_main",
  }));

  // Calculate week_start (next Monday)
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek) % 7 || 7;
  const nextMonday = new Date(today);
  nextMonday.setDate(today.getDate() + daysUntilMonday);
  const weekStart = nextMonday.toISOString().split("T")[0];

  // Step 3: Generate the meal plan
  try {
    const planResult = await generateMealPlanV3({
      familyId,
      weekStart,
      cookingSchedule,
      lunchNeeds: [],
      maxCookMinutesWeekday: preferences.max_cook_minutes_weekday || 45,
      maxCookMinutesWeekend: preferences.max_cook_minutes_weekend || 90,
      vegetarianRatio: preferences.vegetarian_ratio || 40,
    });

    // Step 4: Fetch the full plan with recipe details (same as GET /meal-plans/:id)
    const plan = db.prepare("SELECT * FROM meal_plans WHERE id = ?").get(planResult.id) as any;
    const items = db.prepare(`
      SELECT mpi.id as item_id, mpi.meal_plan_id, mpi.day, mpi.recipe_id, mpi.locked,
             mpi.meal_type, mpi.main_number, mpi.assigned_member_ids,
             mpi.parent_meal_item_id, mpi.is_custom, mpi.notes,
             r.id as r_id, r.name as recipe_name, r.cuisine, r.vegetarian,
             r.protein_type, r.cook_minutes, r.makes_leftovers, r.kid_friendly
      FROM meal_plan_items mpi
      LEFT JOIN recipes r ON r.id = mpi.recipe_id
      WHERE mpi.meal_plan_id = ?
      ORDER BY CASE mpi.day
        WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2 WHEN 'wednesday' THEN 3
        WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5 WHEN 'saturday' THEN 6 WHEN 'sunday' THEN 7
      END, mpi.meal_type, mpi.main_number
    `).all(planResult.id) as any[];

    const fullItems = items.map((row: any) => ({
      id: row.item_id,
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
    }));

    // Store plan ID for grocery list access
    res.status(201).json({
      id: plan.id,
      family_id: plan.family_id,
      week_start: plan.week_start,
      created_at: plan.created_at,
      cooking_schedule: cookingSchedule,
      items: fullItems,
    });
  } catch (error: any) {
    console.error("Meal plan generation error:", error);
    res.status(500).json({ error: error.message || "Failed to generate meal plan" });
  }
});

export default router;
