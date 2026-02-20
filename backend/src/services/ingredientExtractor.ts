// services/ingredientExtractor.ts
// 2-tier ingredient extraction: JSON-LD parsing → Haiku fallback

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
 * Tier 1: Fetch a recipe URL and extract recipeIngredient from JSON-LD markup.
 * Returns raw ingredient strings or null if not found.
 */
async function fetchJsonLdIngredients(sourceUrl: string): Promise<string[] | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(sourceUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const html = await response.text();

    // Extract all <script type="application/ld+json"> blocks
    const scriptRegex = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = scriptRegex.exec(html)) !== null) {
      try {
        const data = JSON.parse(match[1]);
        const ingredients = findRecipeIngredients(data);
        if (ingredients && ingredients.length > 0) {
          console.log(`[fetchJsonLdIngredients] Found ${ingredients.length} ingredients from JSON-LD for ${sourceUrl}`);
          return ingredients;
        }
      } catch {
        // Invalid JSON in this block, try next
      }
    }

    return null;
  } catch (error) {
    console.warn(`[fetchJsonLdIngredients] Failed for ${sourceUrl}:`, (error as Error).message);
    return null;
  }
}

/** Recursively find recipeIngredient in JSON-LD data (handles @graph arrays) */
function findRecipeIngredients(data: any): string[] | null {
  if (!data || typeof data !== "object") return null;

  // Direct Recipe object
  if (data["@type"] === "Recipe" && Array.isArray(data.recipeIngredient)) {
    return data.recipeIngredient.filter((s: any) => typeof s === "string" && s.trim());
  }

  // @type can be an array like ["Recipe"]
  if (Array.isArray(data["@type"]) && data["@type"].includes("Recipe") && Array.isArray(data.recipeIngredient)) {
    return data.recipeIngredient.filter((s: any) => typeof s === "string" && s.trim());
  }

  // Check @graph array
  if (Array.isArray(data["@graph"])) {
    for (const item of data["@graph"]) {
      const result = findRecipeIngredients(item);
      if (result) return result;
    }
  }

  // Check if data is an array (some sites wrap in array)
  if (Array.isArray(data)) {
    for (const item of data) {
      const result = findRecipeIngredients(item);
      if (result) return result;
    }
  }

  return null;
}

/** Recursively find image in JSON-LD Recipe data */
function findRecipeImage(data: any): string | null {
  if (!data || typeof data !== "object") return null;

  const isRecipe =
    data["@type"] === "Recipe" ||
    (Array.isArray(data["@type"]) && data["@type"].includes("Recipe"));

  if (isRecipe && data.image) {
    // image can be a string, array of strings, or ImageObject
    if (typeof data.image === "string") return data.image;
    if (Array.isArray(data.image)) {
      const first = data.image[0];
      if (typeof first === "string") return first;
      if (first && typeof first === "object" && first.url) return first.url;
    }
    if (typeof data.image === "object" && data.image.url) return data.image.url;
  }

  if (Array.isArray(data["@graph"])) {
    for (const item of data["@graph"]) {
      const result = findRecipeImage(item);
      if (result) return result;
    }
  }

  if (Array.isArray(data)) {
    for (const item of data) {
      const result = findRecipeImage(item);
      if (result) return result;
    }
  }

  return null;
}

/**
 * Extract a recipe image URL from a source URL.
 * Tries JSON-LD schema.org/Recipe "image" first, then og:image meta tag.
 */
export async function extractImageFromUrl(sourceUrl: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(sourceUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const html = await response.text();

    // Try JSON-LD first
    const scriptRegex = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = scriptRegex.exec(html)) !== null) {
      try {
        const data = JSON.parse(match[1]);
        const imageUrl = findRecipeImage(data);
        if (imageUrl) return imageUrl;
      } catch {
        // Invalid JSON, try next block
      }
    }

    // Fallback: og:image meta tag
    const ogMatch = html.match(/<meta[^>]+property\s*=\s*["']og:image["'][^>]+content\s*=\s*["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]+property\s*=\s*["']og:image["']/i);
    if (ogMatch?.[1]) return ogMatch[1];

    return null;
  } catch (error) {
    console.warn(`[extractImageFromUrl] Failed for ${sourceUrl}:`, (error as Error).message);
    return null;
  }
}

/**
 * Structure raw ingredient strings into our Ingredient format using Haiku.
 */
async function structureIngredientsWithHaiku(
  rawIngredients: string[],
  recipeName: string,
  servings?: number,
): Promise<Ingredient[]> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return [];

    const client = new Anthropic({ apiKey });

    const servingsInstruction = servings
      ? `\n- Scale all quantities to serve ${servings} people. If the recipe's original serving size differs, adjust proportionally.`
      : "";

    const message = await createWithRetry(client, {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: `You are a recipe ingredient parser. Given raw ingredient strings from a recipe, parse them into structured JSON.

Return ONLY a JSON array of ingredients with this structure:
[
  { "name": "ingredient name", "quantity": 1.5, "unit": "lb", "category": "produce" }
]

Rules:
- Parse the ACTUAL ingredient strings provided — do not add or remove ingredients
- quantity must be a positive number${servingsInstruction}
- Valid units: lb, oz, cup, cups, tbsp, tsp, count, cloves, can, bag, bunch, inch, box, slices, head, pint
- Valid categories: produce, dairy, pantry, protein, spices, grains, frozen, other
- For items like "salt and pepper to taste", use quantity 1 and unit "tsp"
- For items counted by number (e.g. "3 eggs"), use unit "count"
- Return ONLY valid JSON, no markdown fences, no explanation.`,
      messages: [
        {
          role: "user",
          content: `Parse these ingredient strings for "${recipeName}":\n${rawIngredients.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
        },
      ],
    }, "ingredientExtractor/structure");

    return parseIngredientsFromResponse(message.content);
  } catch (error) {
    console.error(`[structureIngredientsWithHaiku] Failed for "${recipeName}" (non-fatal):`, error);
    return [];
  }
}

/**
 * Tier 2: Estimate typical ingredients for a recipe using Haiku (no web search).
 * Returns [] on any failure so callers are never blocked.
 */
async function estimateRecipeIngredientsWithHaiku(
  recipeName: string,
  servings?: number,
): Promise<Ingredient[]> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return [];

    const client = new Anthropic({ apiKey });

    const servingsInstruction = servings
      ? `Scale all quantities to serve ${servings} people.`
      : "Assume serving 4 people.";

    const message = await createWithRetry(client, {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: `You are a grocery list assistant. Given a recipe name, return the typical ingredients needed to make it.

Return ONLY a JSON array of ingredients with this structure:
[
  { "name": "ingredient name", "quantity": 1.5, "unit": "lb", "category": "produce" }
]

Rules:
- List the real, typical ingredients for this recipe
- quantity must be a positive number. ${servingsInstruction}
- Valid units: lb, oz, cup, cups, tbsp, tsp, count, cloves, can, bag, bunch, inch, box, slices, head, pint
- Valid categories: produce, dairy, pantry, protein, spices, grains, frozen, other
- For items like "salt and pepper to taste", use quantity 1 and unit "tsp"
- For items counted by number (e.g. "3 eggs"), use unit "count"
- Return ONLY valid JSON, no markdown fences, no explanation.`,
      messages: [
        {
          role: "user",
          content: `What ingredients are typically needed for "${recipeName}"?`,
        },
      ],
    }, "ingredientExtractor/estimate");

    const ingredients = parseIngredientsFromResponse(message.content);

    if (ingredients.length === 0) {
      console.warn(`[estimateRecipeIngredientsWithHaiku] Got 0 ingredients for "${recipeName}"`);
    } else {
      console.log(`[estimateRecipeIngredientsWithHaiku] Estimated ${ingredients.length} ingredients for "${recipeName}"`);
    }

    return ingredients;
  } catch (error) {
    console.error(`[estimateRecipeIngredientsWithHaiku] Failed for "${recipeName}" (non-fatal):`, error);
    return [];
  }
}

/**
 * Main extraction entry point: 2-tier strategy.
 * Tier 1: JSON-LD from source URL → structure with Haiku
 * Tier 2: Haiku estimation from recipe name
 */
export async function extractIngredientsForRecipe(
  recipeName: string,
  sourceUrl: string | null,
  servings?: number,
): Promise<{ ingredients: Ingredient[]; method: "json_ld" | "haiku_estimate" | "failed" }> {
  // Tier 1: JSON-LD from source URL
  if (sourceUrl) {
    const rawStrings = await fetchJsonLdIngredients(sourceUrl);
    if (rawStrings && rawStrings.length > 0) {
      const structured = await structureIngredientsWithHaiku(rawStrings, recipeName, servings);
      if (structured.length > 0) return { ingredients: structured, method: "json_ld" };
    }
  }

  // Tier 2: Haiku estimation from recipe name
  const estimated = await estimateRecipeIngredientsWithHaiku(recipeName, servings);
  if (estimated.length > 0) return { ingredients: estimated, method: "haiku_estimate" };

  return { ingredients: [], method: "failed" };
}

/** Parse ingredient JSON from Claude response content blocks */
export function parseIngredientsFromResponse(contentBlocks: any[]): Ingredient[] {
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

/**
 * Estimate typical ingredients for a side dish using Claude.
 * No web search needed — these are common/generic sides Claude knows well.
 * Returns [] on any failure so callers are never blocked.
 */
export async function estimateSideIngredients(
  sideName: string,
  servings: number,
): Promise<Ingredient[]> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return [];

    const client = new Anthropic({ apiKey });

    const message = await createWithRetry(client, {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: `You are a grocery list assistant. Given a side dish name and serving count, return the typical ingredients needed to make it.

Return ONLY a JSON array of ingredients with this structure:
[
  { "name": "ingredient name", "quantity": 1.5, "unit": "lb", "category": "produce" }
]

Rules:
- List the real, typical ingredients for this side dish
- quantity must be a positive number scaled for the requested number of servings
- Valid units: lb, oz, cup, cups, tbsp, tsp, count, cloves, can, bag, bunch, inch, box, slices, head, pint
- Valid categories: produce, dairy, pantry, protein, spices, grains, frozen, other
- For items like "salt and pepper to taste", use quantity 1 and unit "tsp"
- For items counted by number (e.g. "3 eggs"), use unit "count"
- Return ONLY valid JSON, no markdown fences, no explanation.`,
      messages: [
        {
          role: "user",
          content: `What ingredients are typically needed for "${sideName}" serving ${servings} people?`,
        },
      ],
    }, "ingredientExtractor/side");

    const ingredients = parseIngredientsFromResponse(message.content);

    if (ingredients.length === 0) {
      console.warn(`[estimateSideIngredients] Got 0 ingredients for "${sideName}"`);
    } else {
      console.log(`[estimateSideIngredients] Estimated ${ingredients.length} ingredients for "${sideName}" (${servings} servings)`);
    }

    return ingredients;
  } catch (error) {
    console.error(`[estimateSideIngredients] Failed for "${sideName}" (non-fatal):`, error);
    return [];
  }
}
