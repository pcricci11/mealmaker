import type { WebSearchRecipeResult, Cuisine, Difficulty, Ingredient, GroceryCategory } from "../../../shared/types";
import { VALID_CUISINES } from "../../../shared/types";

// ── Spoonacular API types ──

interface SpoonacularIngredient {
  name: string;
  amount: number;
  unit: string;
  aisle: string;
}

interface SpoonacularRecipe {
  id: number;
  title: string;
  readyInMinutes: number;
  sourceUrl: string;
  sourceName: string;
  cuisines: string[];
  vegetarian: boolean;
  summary: string;
  extendedIngredients: SpoonacularIngredient[];
  dishTypes?: string[];
  image?: string;
}

interface SpoonacularSearchResponse {
  results: SpoonacularRecipe[];
  offset: number;
  number: number;
  totalResults: number;
}

// ── Cuisine mapping ──

const CUISINE_MAP: Record<string, Cuisine> = {
  american: "american",
  italian: "italian",
  mexican: "mexican",
  indian: "indian",
  chinese: "chinese",
  japanese: "japanese",
  thai: "thai",
  mediterranean: "mediterranean",
  korean: "korean",
  french: "french",
  "middle eastern": "middle_eastern",
  ethiopian: "ethiopian",
  // Fold similar cuisines
  greek: "mediterranean",
  spanish: "mediterranean",
  vietnamese: "thai",
  "latin american": "mexican",
  african: "ethiopian",
  cajun: "american",
  southern: "american",
  british: "american",
  german: "american",
};

function mapCuisine(cuisines: string[]): Cuisine {
  for (const c of cuisines) {
    const lower = c.toLowerCase();
    if (CUISINE_MAP[lower]) return CUISINE_MAP[lower];
  }
  return "american";
}

// ── Unit normalization ──

const UNIT_MAP: Record<string, string> = {
  tablespoons: "tbsp",
  tablespoon: "tbsp",
  teaspoons: "tsp",
  teaspoon: "tsp",
  pounds: "lb",
  pound: "lb",
  ounces: "oz",
  ounce: "oz",
  cups: "cup",
  "": "count",
  large: "count",
  medium: "count",
  small: "count",
  serving: "count",
  servings: "count",
};

function normalizeUnit(unit: string): string {
  const lower = unit.toLowerCase().trim();
  return UNIT_MAP[lower] || lower || "count";
}

// ── Category from aisle ──

const AISLE_CATEGORY_MAP: Record<string, GroceryCategory> = {
  "milk, eggs, other dairy": "dairy",
  dairy: "dairy",
  cheese: "dairy",
  meat: "protein",
  seafood: "protein",
  "spices and seasonings": "spices",
  "pasta and rice": "grains",
  "bread": "grains",
  "bakery/bread": "grains",
  produce: "produce",
  "fresh vegetables": "produce",
  "fresh fruits": "produce",
  frozen: "frozen",
  "frozen foods": "frozen",
  "canned and jarred": "pantry",
  "oil, vinegar, salad dressing": "pantry",
  "condiments": "pantry",
  "baking": "pantry",
  "nuts": "pantry",
  "beverages": "other",
};

function mapCategory(aisle: string): GroceryCategory {
  const lower = aisle.toLowerCase().trim();
  // Direct match
  if (AISLE_CATEGORY_MAP[lower]) return AISLE_CATEGORY_MAP[lower];
  // Partial match
  for (const [key, cat] of Object.entries(AISLE_CATEGORY_MAP)) {
    if (lower.includes(key) || key.includes(lower)) return cat;
  }
  return "other";
}

// ── Ingredient mapping ──

function mapIngredients(extendedIngredients: SpoonacularIngredient[]): Ingredient[] {
  return extendedIngredients
    .filter((ing) => ing.name && ing.name.trim() && ing.amount > 0)
    .map((ing) => ({
      name: ing.name.trim(),
      quantity: Math.round(ing.amount * 100) / 100,
      unit: normalizeUnit(ing.unit),
      category: mapCategory(ing.aisle || ""),
    }));
}

// ── Difficulty estimation ──

function estimateDifficulty(readyInMinutes: number, ingredientCount: number): Difficulty {
  if (readyInMinutes < 20 && ingredientCount < 8) return "easy";
  if (readyInMinutes < 45) return "medium";
  return "hard";
}

// ── Protein type inference ──

const COMMON_PROTEINS = ["chicken", "beef", "pork", "salmon", "shrimp", "turkey", "fish"];

function inferProteinType(ingredients: SpoonacularIngredient[], vegetarian: boolean): string | null {
  if (vegetarian) return null;
  for (const ing of ingredients) {
    const aisle = (ing.aisle || "").toLowerCase();
    if (aisle.includes("meat") || aisle.includes("seafood")) {
      const name = ing.name.toLowerCase();
      for (const protein of COMMON_PROTEINS) {
        if (name.includes(protein)) return protein;
      }
    }
  }
  return null;
}

// ── Kid-friendly heuristic ──

const KID_FRIENDLY_TYPES = [
  "pasta", "pizza", "sandwich", "burger", "taco", "mac", "cheese",
  "chicken tender", "nugget", "pancake", "waffle", "grilled cheese",
];

function isKidFriendly(readyInMinutes: number, dishTypes: string[], title: string): boolean {
  if (readyInMinutes >= 45) return false;
  const lower = title.toLowerCase();
  const allTypes = dishTypes.map((d) => d.toLowerCase()).join(" ") + " " + lower;
  return KID_FRIENDLY_TYPES.some((t) => allTypes.includes(t));
}

// ── Description extraction ──

function extractDescription(summary: string): string {
  if (!summary) return "";
  // Strip HTML tags
  const text = summary.replace(/<[^>]+>/g, "").trim();
  // Take first sentence
  const firstSentence = text.split(/[.!?]/)[0];
  if (!firstSentence) return text.slice(0, 150);
  const result = firstSentence.trim();
  return result.length > 150 ? result.slice(0, 147) + "..." : result;
}

// ── Main search function ──

export async function searchSpoonacular(
  query: string,
  options?: { number?: number },
): Promise<WebSearchRecipeResult[]> {
  const apiKey = process.env.SPOONACULAR_API_KEY;
  if (!apiKey) return [];

  const number = options?.number ?? 5;
  const params = new URLSearchParams({
    query,
    addRecipeInformation: "true",
    fillIngredients: "true",
    number: String(number),
    apiKey,
  });

  try {
    const response = await fetch(
      `https://api.spoonacular.com/recipes/complexSearch?${params}`,
      {
        headers: { "x-api-key": apiKey },
        signal: AbortSignal.timeout(5000),
      },
    );

    if (!response.ok) {
      console.error(`[spoonacular] API returned ${response.status}: ${response.statusText}`);
      return [];
    }

    const data: SpoonacularSearchResponse = await response.json();

    return data.results.map((recipe): WebSearchRecipeResult => {
      const ingredients = mapIngredients(recipe.extendedIngredients || []);
      return {
        name: recipe.title,
        source_name: recipe.sourceName || "Spoonacular",
        source_url: recipe.sourceUrl || "",
        cook_minutes: recipe.readyInMinutes || 30,
        cuisine: mapCuisine(recipe.cuisines || []),
        vegetarian: recipe.vegetarian ?? false,
        protein_type: inferProteinType(recipe.extendedIngredients || [], recipe.vegetarian ?? false),
        difficulty: estimateDifficulty(recipe.readyInMinutes || 30, (recipe.extendedIngredients || []).length),
        kid_friendly: isKidFriendly(recipe.readyInMinutes || 30, recipe.dishTypes || [], recipe.title),
        description: extractDescription(recipe.summary || ""),
        ingredients,
        source: "spoonacular",
        image_url: recipe.image || null,
      };
    });
  } catch (error: any) {
    console.error("[spoonacular] Search error:", error.message || error);
    return [];
  }
}
