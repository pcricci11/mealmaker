// services/ingredientExtractor.ts
// Shared ingredient extraction via Claude web_search

import Anthropic from "@anthropic-ai/sdk";
import { createWithRetry } from "./claudeRetry";
import type { Ingredient, GroceryCategory } from "../../../shared/types";

const VALID_UNITS = new Set([
  "lb", "oz", "cup", "cups", "tbsp", "tsp", "count", "cloves", "can",
  "bag", "bunch", "inch", "box", "slices", "head", "pint",
]);
const VALID_CATEGORIES = new Set([
  "produce", "dairy", "pantry", "protein", "spices", "grains", "frozen", "other",
]);

/**
 * Fetch a recipe URL via Claude web_search and extract a structured ingredient list.
 * Falls back to a name-only search if URL extraction fails (e.g. bot blocking).
 * Returns [] on any failure so callers are never blocked.
 */
export async function extractIngredientsFromUrl(
  recipeName: string,
  sourceUrl: string,
): Promise<Ingredient[]> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return [];

    const client = new Anthropic({ apiKey });

    const message = await createWithRetry(client, {
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2048,
      tools: [
        { type: "web_search_20250305", name: "web_search", max_uses: 3 } as any,
      ],
      system: `You are a recipe ingredient extractor. Given a recipe name and URL, fetch the page and extract the REAL ingredient list exactly as the recipe specifies.

Return ONLY a JSON array of ingredients with this structure:
[
  { "name": "ingredient name", "quantity": 1.5, "unit": "lb", "category": "protein" }
]

Rules:
- Extract the ACTUAL ingredients from the recipe page, do not guess or make up ingredients
- quantity must be a positive number
- Valid units: lb, oz, cup, cups, tbsp, tsp, count, cloves, can, bag, bunch, inch, box, slices, head, pint
- Valid categories: produce, dairy, pantry, protein, spices, grains, frozen, other
- For items like "salt and pepper to taste", use quantity 1 and unit "tsp"
- For items counted by number (e.g. "3 eggs"), use unit "count"
- Return ONLY valid JSON, no markdown fences, no explanation.`,
      messages: [
        {
          role: "user",
          content: `Extract the ingredient list from this recipe:\nName: "${recipeName}"\nURL: ${sourceUrl}`,
        },
      ],
    });

    const ingredients = parseIngredientsFromResponse(message.content);

    if (ingredients.length > 0) {
      return ingredients;
    }

    // Diagnostic: log what we got back when extraction produced nothing
    console.warn(`[extractIngredients] URL-based extraction returned 0 ingredients for "${recipeName}"`);
    console.warn(`[extractIngredients] Response blocks:`, message.content.map((b: any) => ({ type: b.type, text: b.type === "text" ? b.text.slice(0, 200) : undefined })));

    // Fallback: retry with a name-only search (bypasses URL-specific bot blocking)
    console.log(`[extractIngredients] Retrying with name-only search for "${recipeName}"`);
    const fallbackMessage = await createWithRetry(client, {
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2048,
      tools: [
        { type: "web_search_20250305", name: "web_search", max_uses: 3 } as any,
      ],
      system: `You are a recipe ingredient extractor. Search the web for the given recipe and extract its REAL ingredient list.

Return ONLY a JSON array of ingredients with this structure:
[
  { "name": "ingredient name", "quantity": 1.5, "unit": "lb", "category": "protein" }
]

Rules:
- Extract the ACTUAL ingredients from a real recipe, do not guess or make up ingredients
- quantity must be a positive number
- Valid units: lb, oz, cup, cups, tbsp, tsp, count, cloves, can, bag, bunch, inch, box, slices, head, pint
- Valid categories: produce, dairy, pantry, protein, spices, grains, frozen, other
- For items like "salt and pepper to taste", use quantity 1 and unit "tsp"
- For items counted by number (e.g. "3 eggs"), use unit "count"
- Return ONLY valid JSON, no markdown fences, no explanation.`,
      messages: [
        {
          role: "user",
          content: `Search the web for the recipe "${recipeName}" and extract its ingredients.`,
        },
      ],
    });

    const fallbackIngredients = parseIngredientsFromResponse(fallbackMessage.content);
    if (fallbackIngredients.length === 0) {
      console.warn(`[extractIngredients] Fallback also returned 0 ingredients for "${recipeName}"`);
      console.warn(`[extractIngredients] Fallback blocks:`, fallbackMessage.content.map((b: any) => ({ type: b.type, text: b.type === "text" ? b.text.slice(0, 200) : undefined })));
    } else {
      console.log(`[extractIngredients] Fallback extracted ${fallbackIngredients.length} ingredients for "${recipeName}"`);
    }

    return fallbackIngredients;
  } catch (error) {
    console.error("extractIngredientsFromUrl failed (non-fatal):", error);
    return [];
  }
}

/** Parse ingredient JSON from Claude response content blocks */
function parseIngredientsFromResponse(contentBlocks: any[]): Ingredient[] {
  let lastText = "";
  for (const block of contentBlocks) {
    if (block.type === "text") {
      lastText = block.text;
    }
  }
  if (!lastText) return [];

  let cleaned = lastText
    .replace(/^```(?:json)?\s*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();

  const arrayStart = cleaned.indexOf("[");
  const arrayEnd = cleaned.lastIndexOf("]");
  if (arrayStart === -1 || arrayEnd === -1) return [];
  cleaned = cleaned.slice(arrayStart, arrayEnd + 1);

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((ing: any) => {
      if (!ing || typeof ing !== "object") return false;
      if (typeof ing.name !== "string" || !ing.name.trim()) return false;
      if (typeof ing.quantity !== "number" || ing.quantity <= 0) return false;
      if (!VALID_UNITS.has(ing.unit)) return false;
      if (!VALID_CATEGORIES.has(ing.category)) return false;
      return true;
    }).map((ing: any): Ingredient => ({
      name: ing.name.trim(),
      quantity: ing.quantity,
      unit: ing.unit,
      category: ing.category as GroceryCategory,
    }));
  } catch {
    return [];
  }
}
