import { useState, useEffect, useRef } from "react";
import { getRecipeById, getRecipes } from "../api";
import { CUISINE_COLORS } from "./SwapMainModal";
import type { Recipe, MealPlanItemV3 } from "@shared/types";

interface Props {
  item: MealPlanItemV3;
  onClose: () => void;
  onLove: (itemId: number) => void;
  isLoved: boolean;
  onSwap: (recipeId: number) => void;
}

const DAY_LABELS: Record<string, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

function pickRandom(recipes: Recipe[], count: number, exclude: Set<number>): Recipe[] {
  const available = recipes.filter((r) => !exclude.has(r.id));
  const shuffled = [...available].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export default function MealDetailModal({ item, onClose, onLove, isLoved, onSwap }: Props) {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(false);
  const [swapMode, setSwapMode] = useState<"similar" | "random" | null>(null);
  const [suggestions, setSuggestions] = useState<Recipe[]>([]);
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const shownIds = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (item.recipe_id) {
      setLoading(true);
      getRecipeById(item.recipe_id)
        .then(setRecipe)
        .catch((err) => console.error("Failed to load recipe:", err))
        .finally(() => setLoading(false));
    }
  }, [item.recipe_id]);

  const getKeyword = (): string | null => {
    if (recipe?.protein_type) return recipe.protein_type;
    return recipe?.title || item.recipe_name || null;
  };

  const loadSuggestions = async (mode: "similar" | "random") => {
    setSwapMode(mode);
    setLoadingSuggestions(true);
    setSuggestions([]);
    try {
      let recipes = allRecipes;
      if (recipes.length === 0) {
        recipes = await getRecipes();
        setAllRecipes(recipes);
      }

      // Exclude the current recipe
      if (item.recipe_id) shownIds.current.add(item.recipe_id);

      if (mode === "similar") {
        const keyword = getKeyword();
        if (keyword) {
          const kw = keyword.toLowerCase();
          const filtered = recipes.filter(
            (r) =>
              !shownIds.current.has(r.id) &&
              (r.title.toLowerCase().includes(kw) ||
                (r.protein_type && r.protein_type.toLowerCase().includes(kw)))
          );
          const picks = filtered.slice(0, 3);
          if (picks.length > 0) {
            picks.forEach((r) => shownIds.current.add(r.id));
            setSuggestions(picks);
          } else {
            // Fall back to random if no similar found
            const random = pickRandom(recipes, 3, shownIds.current);
            random.forEach((r) => shownIds.current.add(r.id));
            setSuggestions(random);
          }
        } else {
          const random = pickRandom(recipes, 3, shownIds.current);
          random.forEach((r) => shownIds.current.add(r.id));
          setSuggestions(random);
        }
      } else {
        const picks = pickRandom(recipes, 3, shownIds.current);
        picks.forEach((r) => shownIds.current.add(r.id));
        setSuggestions(picks);
      }
    } catch (err) {
      console.error("Failed to load suggestions:", err);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleSelect = async (recipeId: number) => {
    setSwapping(true);
    try {
      await onSwap(recipeId);
    } catch (err) {
      console.error("Swap failed:", err);
      setSwapping(false);
    }
  };

  const keyword = recipe?.title || item.recipe_name || "Similar";

  const itemCuisine = item.recipe?.cuisine ?? null;
  const cuisineClass = recipe?.cuisine
    ? CUISINE_COLORS[recipe.cuisine] || "bg-gray-100 text-gray-700"
    : itemCuisine
      ? CUISINE_COLORS[itemCuisine] || "bg-gray-100 text-gray-700"
      : null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">
            {DAY_LABELS[item.day] || item.day}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {loading ? (
            <div className="text-center py-8 text-gray-500">
              Loading recipe details...
            </div>
          ) : (
            <>
              {/* Recipe name + love */}
              <div className="flex items-start justify-between gap-3">
                {recipe?.source_url ? (
                  <a
                    href={recipe.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xl font-bold text-emerald-700 hover:text-emerald-800 underline decoration-emerald-300 underline-offset-2 leading-tight"
                  >
                    {recipe.title}
                  </a>
                ) : (
                  <h2 className="text-xl font-bold text-gray-900 leading-tight">
                    {recipe?.title || item.recipe_name || "Custom Meal"}
                  </h2>
                )}
                <button
                  onClick={() => onLove(item.id)}
                  className={`text-lg flex-shrink-0 px-2 py-1 rounded transition-colors ${
                    isLoved
                      ? "bg-red-100 text-red-500"
                      : "hover:bg-gray-100 text-gray-400"
                  }`}
                >
                  {isLoved ? "❤️" : "🤍"}
                </button>
              </div>

              {/* Tags row: cuisine, difficulty, vegetarian */}
              <div className="flex flex-wrap gap-2">
                {cuisineClass && (
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${cuisineClass}`}>
                    {(recipe?.cuisine || itemCuisine || "").replace("_", " ")}
                  </span>
                )}
                {recipe?.difficulty && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 font-medium capitalize">
                    {recipe.difficulty}
                  </span>
                )}
                {(recipe?.vegetarian ?? item.recipe?.vegetarian ?? false) && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-700 font-medium">
                    🌿 Vegetarian
                  </span>
                )}
              </div>

              {/* Metadata pills */}
              <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                {(recipe?.cook_minutes || item.recipe?.cook_minutes) && (
                  <span>⏱ {recipe?.cook_minutes || item.recipe?.cook_minutes} min</span>
                )}
                {(recipe?.makes_leftovers ?? item.recipe?.makes_leftovers ?? false) && (
                  <span>📦 Makes leftovers</span>
                )}
                {(recipe?.kid_friendly ?? item.recipe?.kid_friendly ?? false) && (
                  <span>👶 Kid friendly</span>
                )}
              </div>

              {/* Source info */}
              {recipe?.source_name && (
                <div className="text-sm text-gray-600">
                  <span>👨‍🍳 {recipe.source_name}</span>
                </div>
              )}
              {recipe?.source_url && (
                <a
                  href={recipe.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-sm text-emerald-600 hover:text-emerald-700 font-medium"
                >
                  🔗 View Full Recipe
                </a>
              )}

              {/* Ingredients */}
              {recipe?.ingredients && recipe.ingredients.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Ingredients
                  </h4>
                  <ul className="space-y-1">
                    {recipe.ingredients.map((ing, i) => (
                      <li key={i} className="text-sm text-gray-700">
                        • {ing.quantity} {ing.unit} {ing.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* No recipe_id — custom meal note */}
              {!item.recipe_id && (
                <p className="text-sm text-gray-400 italic">
                  This is a custom meal — no full recipe details available.
                </p>
              )}

              {/* Swap section */}
              {item.recipe_id && !swapMode && (
                <div className="border-t border-gray-200 pt-4 space-y-2">
                  <button
                    onClick={() => loadSuggestions("similar")}
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg text-left hover:border-emerald-500 hover:bg-emerald-50 transition-colors"
                  >
                    <span className="font-medium text-gray-900">
                      🔄 Other {keyword} Recipes
                    </span>
                  </button>
                  <button
                    onClick={() => loadSuggestions("random")}
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg text-left hover:border-emerald-500 hover:bg-emerald-50 transition-colors"
                  >
                    <span className="font-medium text-gray-900">
                      🔀 Completely Different Meals
                    </span>
                  </button>
                </div>
              )}

              {/* Suggestion cards */}
              {swapMode && (
                <div className="border-t border-gray-200 pt-4 space-y-2">
                  <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    {swapMode === "similar" ? `Other ${keyword} Recipes` : "Different Meals"}
                  </h4>
                  {loadingSuggestions ? (
                    <div className="text-center py-4 text-gray-500 text-sm">
                      Loading suggestions...
                    </div>
                  ) : swapping ? (
                    <div className="text-center py-4 text-gray-500 text-sm">
                      Swapping recipe...
                    </div>
                  ) : suggestions.length === 0 ? (
                    <div className="text-center py-4 text-gray-500 text-sm">
                      No suggestions available
                    </div>
                  ) : (
                    suggestions.map((r) => {
                      const cc = CUISINE_COLORS[r.cuisine] || "bg-gray-100 text-gray-700";
                      return (
                        <button
                          key={r.id}
                          onClick={() => handleSelect(r.id)}
                          disabled={swapping}
                          className="w-full border border-gray-200 rounded-lg p-4 hover:border-emerald-500 hover:bg-emerald-50 transition-colors text-left disabled:opacity-50"
                        >
                          <div className="font-medium text-gray-900">{r.title}</div>
                          <div className="flex flex-wrap gap-2 mt-1">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${cc}`}>
                              {r.cuisine.replace("_", " ")}
                            </span>
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full ${
                                r.vegetarian
                                  ? "bg-green-100 text-green-700"
                                  : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {r.vegetarian ? "Vegetarian" : r.protein_type}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                              {r.cook_minutes} min
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )}

                  <button
                    onClick={() => { setSwapMode(null); setSuggestions([]); }}
                    className="w-full px-4 py-2 text-gray-500 hover:text-gray-700 text-sm font-medium"
                  >
                    ← Back to options
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-gray-700 hover:text-gray-900 font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
