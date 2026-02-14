// routes/conversational-planner.ts
// Parses conversational text via Claude to extract structured meal planning preferences

import { Router, Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import db from "../db";

const router = Router();

const SYSTEM_PROMPT = `You are a meal planning assistant. The user will describe their week in natural language. Parse their description and return a JSON object with this exact structure:

{
  "cooking_days": {
    "monday": { "is_cooking": true, "meal_mode": "one_main" },
    "tuesday": { "is_cooking": true, "meal_mode": "one_main" },
    "wednesday": { "is_cooking": true, "meal_mode": "one_main" },
    "thursday": { "is_cooking": true, "meal_mode": "one_main" },
    "friday": { "is_cooking": true, "meal_mode": "one_main" },
    "saturday": { "is_cooking": true, "meal_mode": "one_main" },
    "sunday": { "is_cooking": true, "meal_mode": "one_main" }
  },
  "specific_meals": [],
  "dietary_preferences": {
    "vegetarian_ratio": 40,
    "allergies": [],
    "cuisine_preferences": []
  },
  "lunch_needs": {},
  "cook_time_limits": {
    "weekday": 45,
    "weekend": 90
  }
}

Rules:
- Default all days to is_cooking: true unless the user says otherwise.
- If the user says they're "eating out", "ordering in", "not cooking", or "off" on a day, set is_cooking to false.
- If they only mention specific days they ARE cooking, set unmentioned days to is_cooking: false.
- meal_mode should be "one_main" unless they explicitly say they need multiple mains (then use "customize_mains").
- specific_meals is an array of { "day": "<day>", "description": "<meal>" } for any meals the user explicitly requests (e.g. "tacos on Tuesday", "pizza Friday"). Only include meals the user actually mentions.
- dietary_preferences.vegetarian_ratio: percentage 0-100, default 40. Increase if user mentions vegetarian/vegan/meatless.
- dietary_preferences.allergies: array of strings for any mentioned allergies or intolerances (e.g. "gluten", "dairy", "nuts", "shellfish").
- dietary_preferences.cuisine_preferences: array of strings for any cuisine types mentioned (e.g. "Italian", "Mexican", "Asian").
- lunch_needs: object keyed by member name, value is array of day strings when they need lunch. Only include if user mentions lunch needs.
- cook_time_limits.weekday: max minutes for weeknight cooking, default 45. Adjust if user says "quick meals" or gives a time limit.
- cook_time_limits.weekend: max minutes for weekend cooking, default 90. Adjust if user mentions weekend time constraints.
- Match member names case-insensitively against the provided family members.
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

  const client = new Anthropic({ apiKey });

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

    const parsed = JSON.parse(content.text);

    // Map member names to IDs in lunch_needs
    const lunchNeedsById: Record<number, string[]> = {};
    if (parsed.lunch_needs) {
      for (const [name, days] of Object.entries(parsed.lunch_needs)) {
        const member = members.find(
          (m) => m.name.toLowerCase() === name.toLowerCase()
        );
        if (member) {
          lunchNeedsById[member.id] = days as string[];
        }
      }
    }

    res.json({
      cooking_days: parsed.cooking_days || {},
      specific_meals: parsed.specific_meals || [],
      dietary_preferences: parsed.dietary_preferences || {
        vegetarian_ratio: 40,
        allergies: [],
        cuisine_preferences: [],
      },
      lunch_needs: lunchNeedsById,
      cook_time_limits: parsed.cook_time_limits || {
        weekday: 45,
        weekend: 90,
      },
    });
  } catch (error: any) {
    console.error("Conversational planner error:", error);
    if (error instanceof SyntaxError) {
      return res.status(500).json({ error: "Failed to parse Claude response" });
    }
    res.status(500).json({ error: error.message || "Conversational planner failed" });
  }
});

export default router;
