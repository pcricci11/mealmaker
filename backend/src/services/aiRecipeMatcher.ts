// services/aiRecipeMatcher.ts
// AI-powered recipe matching using Claude as a fallback between keyword matching and web search

import Anthropic from "@anthropic-ai/sdk";
import { query } from "../db";
import { createWithRetry } from "./claudeRetry";

interface AiMatchResult {
  recipe_id: number;
  recipe_name: string;
  score: number;
  reasoning: string;
}

interface AiMatchOptions {
  description: string;
  familyId: number;
  householdId?: number | null;
}

const SYSTEM_PROMPT = `You are a recipe matching assistant for a family meal planner. Given a meal request, family context, and available recipes, pick the 3 best matches.

The request may be specific ("roast chicken"), contextual ("something for picky Stella"), dietary ("no dairy tonight"), or a combination.

Consider: member preferences/dislikes/dietary needs, kid-friendliness when kids are mentioned, the vibe of the request (comfort, quick, fancy), and recipe attributes.

Return ONLY a JSON array, top 3 picks (fewer if <3 are good):
[{"recipe_id": <int>, "recipe_name": "<str>", "score": <0.0-1.0>, "reasoning": "<1 sentence>"}]

Score: 0.9+ near-perfect, 0.7+ strong, 0.5+ reasonable. Don't include <0.5.
Return [] if nothing fits. Return ONLY valid JSON, no markdown fences.`;

export async function aiMatchRecipes(options: AiMatchOptions): Promise<AiMatchResult[]> {
  const { description, familyId, householdId } = options;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("[aiRecipeMatcher] No ANTHROPIC_API_KEY, returning empty");
    return [];
  }

  try {
    // 1. Load family members with full dietary context
    const membersRaw = await query(
      `SELECT id, name, dietary_style, allergies, dislikes, favorites, no_spicy
      FROM family_members
      WHERE family_id = $1`,
      [familyId],
    );
    const members = membersRaw.map((m: any) => ({
      ...m,
      allergies: JSON.parse(m.allergies || "[]"),
      dislikes: JSON.parse(m.dislikes || "[]"),
      favorites: JSON.parse(m.favorites || "[]"),
      no_spicy: !!m.no_spicy,
    }));

    // 2. Load recipes (seed + household)
    let recipesRaw;
    if (householdId) {
      recipesRaw = await query(
        `SELECT id, name, cuisine, vegetarian, protein_type, cook_minutes,
                allergens, kid_friendly, tags, difficulty
         FROM recipes
         WHERE is_seed = TRUE OR household_id = $1`,
        [householdId],
      );
    } else {
      recipesRaw = await query(
        `SELECT id, name, cuisine, vegetarian, protein_type, cook_minutes,
                allergens, kid_friendly, tags, difficulty
         FROM recipes
         WHERE is_seed = TRUE`,
      );
    }

    const recipes = recipesRaw.map((r: any) => ({
      ...r,
      vegetarian: !!r.vegetarian,
      kid_friendly: !!r.kid_friendly,
      allergens: JSON.parse(r.allergens || "[]"),
      tags: JSON.parse(r.tags || "[]"),
    }));

    // 3. Pre-filter by hard constraints (same logic as selectRecipe in mealPlanGeneratorV3)
    const compatible = recipes.filter((recipe: any) => {
      for (const member of members) {
        if (member.dietary_style === "vegan" && !recipe.tags.includes("vegan")) {
          return false;
        }
        if (member.dietary_style === "vegetarian" && !recipe.vegetarian) {
          return false;
        }
        for (const allergy of member.allergies) {
          if (recipe.allergens.includes(allergy)) {
            return false;
          }
        }
        if (member.no_spicy && recipe.tags.includes("spicy")) {
          return false;
        }
      }
      return true;
    });

    if (compatible.length === 0) {
      console.log("[aiRecipeMatcher] No compatible recipes after filtering");
      return [];
    }

    // 4. Build compact recipe list — one line per recipe
    const recipeLines = compatible.map((r: any) => {
      const parts = [`ID:${r.id}`, r.name, r.cuisine];
      if (r.protein_type) parts.push(r.protein_type);
      parts.push(`${r.cook_minutes}min`);
      parts.push(r.difficulty);
      if (r.kid_friendly) parts.push("kid-friendly");
      if (r.vegetarian) parts.push("vegetarian");
      return parts.join(" | ");
    });

    // 5. Build family context — one line per member
    const memberLines = members.map((m: any) => {
      const parts = [m.name];
      if (m.dietary_style && m.dietary_style !== "omnivore") parts.push(`diet:${m.dietary_style}`);
      if (m.allergies.length > 0) parts.push(`allergies:${m.allergies.join(",")}`);
      if (m.dislikes.length > 0) parts.push(`dislikes:${m.dislikes.join(",")}`);
      if (m.favorites.length > 0) parts.push(`favorites:${m.favorites.join(",")}`);
      if (m.no_spicy) parts.push("no-spicy");
      return parts.join(" | ");
    });

    const userMessage = `Request: "${description}"

Family members:
${memberLines.join("\n")}

Available recipes (${compatible.length}):
${recipeLines.join("\n")}`;

    // 6. Call Claude
    const client = new Anthropic({ apiKey });
    const message = await createWithRetry(client, {
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      console.log("[aiRecipeMatcher] No text in response");
      return [];
    }

    // Parse JSON response
    let cleaned = textBlock.text.trim();
    // Strip markdown fences if present
    cleaned = cleaned
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "")
      .trim();

    const firstBracket = cleaned.indexOf("[");
    const lastBracket = cleaned.lastIndexOf("]");
    if (firstBracket === -1 || lastBracket === -1 || lastBracket <= firstBracket) {
      console.error("[aiRecipeMatcher] No JSON array in response:", cleaned.slice(0, 200));
      return [];
    }
    cleaned = cleaned.slice(firstBracket, lastBracket + 1);

    const results: AiMatchResult[] = JSON.parse(cleaned);

    // 7. Validate and return
    if (!Array.isArray(results)) return [];

    const validated = results
      .filter(
        (r) =>
          typeof r.recipe_id === "number" &&
          typeof r.score === "number" &&
          r.score >= 0.5 &&
          compatible.some((c: any) => c.id === r.recipe_id),
      )
      .slice(0, 3);

    console.log(
      `[aiRecipeMatcher] query="${description}" → ${validated.length} matches:`,
      validated.map((m) => `"${m.recipe_name}" (score=${m.score})`),
    );

    return validated;
  } catch (error: any) {
    console.error("[aiRecipeMatcher] Error:", error.message || error);
    return [];
  }
}
