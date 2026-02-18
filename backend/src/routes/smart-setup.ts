// routes/smart-setup.ts
// Parses natural language week description via Claude API

import { Router, Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { query } from "../db";
import { requireAuth, verifyFamilyAccess } from "../middleware/auth";

const router = Router();

// Require auth for smart setup
router.use(requireAuth);

const SYSTEM_PROMPT = `You are a meal planning assistant. The user will describe their week in natural language. Parse their description and return a JSON object with this exact structure:

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
  "lunch_needs": {
    "<member_name>": ["monday", "tuesday"]
  },
  "preferences": {
    "max_cook_minutes_weekday": 45,
    "max_cook_minutes_weekend": 90,
    "vegetarian_ratio": 40
  },
  "specific_meals": [
    { "day": "tuesday", "description": "Ina Garten's mac and cheese" }
  ]
}

Rules:
- CRITICAL: Default ALL days to is_cooking: false. ONLY set is_cooking: true for days the user EXPLICITLY mentions as cooking days. Be literal — do not infer or assume additional days.
- If the user lists specific days (e.g. "Monday, Wednesday, Thursday"), ONLY those days get is_cooking: true. All other days MUST be is_cooking: false.
- If the user says they're "eating out", "ordering in", or "not cooking" on a day, set is_cooking to false.
- If they mention needing lunch for someone, include those days in lunch_needs.
- meal_mode should be "one_main" unless they say they need multiple mains (then use "customize_mains").
- For preferences, only include fields the user explicitly mentions. Use these defaults if not mentioned: weekday 45 min, weekend 90 min, vegetarian_ratio 40.
- If the user says "quick meals" or mentions a time limit, adjust max_cook_minutes accordingly.
- Match member names case-insensitively against the provided family members.
- If the user requests a specific dish or recipe for a day (e.g. "tacos on Tuesday", "Ina Garten's mac and cheese on Wednesday"), add it to specific_meals with the day and the EXACT description the user used. Preserve the FULL text including chef names, recipe authors, brand names, and possessives (e.g. "Ina Garten's mac and cheese", NOT "mac and cheese"). Do NOT simplify, shorten, or clean up meal descriptions. Make sure the day for that meal has is_cooking set to true.
- specific_meals should be an empty array if the user doesn't request any specific dishes.
- Return ONLY valid JSON, no markdown fences, no explanation.`;

// POST /api/smart-setup
router.post("/", async (req: Request, res: Response) => {
  const { text, family_id } = req.body;

  if (!text) {
    return res.status(400).json({ error: "text is required" });
  }
  if (!family_id) {
    return res.status(400).json({ error: "family_id is required" });
  }

  // Verify family belongs to household
  const familyCheck = await verifyFamilyAccess(family_id, req.householdId);
  if (!familyCheck) {
    return res.status(404).json({ error: "Family not found" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  // Get family members for context
  const members = await query<{ id: number; name: string }>(
    "SELECT id, name FROM family_members WHERE family_id = $1",
    [family_id],
  );

  const memberContext = members.length > 0
    ? `Family members: ${members.map((m) => m.name).join(", ")}`
    : "No family members found.";

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

    const cleanedText = content.text.replace(/^```json\s*\n?/, "").replace(/\n?```\s*$/, "");
    const parsed = JSON.parse(cleanedText);

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
      cooking_days: parsed.cooking_days,
      lunch_needs: lunchNeedsById,
      preferences: parsed.preferences || {},
      specific_meals: parsed.specific_meals || [],
    });
  } catch (error: any) {
    console.error("Smart setup error:", error);
    if (error instanceof SyntaxError) {
      return res.status(500).json({ error: "Failed to parse Claude response" });
    }
    res.status(500).json({ error: error.message || "Smart setup failed" });
  }
});

export default router;
