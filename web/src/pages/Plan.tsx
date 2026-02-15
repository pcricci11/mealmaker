import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { generateMealPlanV3, getFamilies, smartSetup, getRecipes, markMealAsLoved, swapMainRecipe, getMealPlan } from "../api";
import MealDetailModal from "../components/MealDetailModal";
import ConversationalPlanner from "../components/ConversationalPlanner";
import RecipeSearchModal from "../components/RecipeSearchModal";
import type { DayOfWeek, Recipe } from "@shared/types";

interface PlanItem {
  id: number;
  day: string;
  recipe_id: number | null;
  meal_type: string;
  recipe_name: string | null;
  cuisine: string | null;
  vegetarian: boolean;
  cook_minutes: number | null;
  makes_leftovers: boolean;
  kid_friendly: boolean;
  notes: any;
}

interface GeneratedPlan {
  id: number;
  week_start: string;
  items: PlanItem[];
}

const DAYS = [
  { key: "monday", label: "Mon" },
  { key: "tuesday", label: "Tue" },
  { key: "wednesday", label: "Wed" },
  { key: "thursday", label: "Thu" },
  { key: "friday", label: "Fri" },
  { key: "saturday", label: "Sat" },
  { key: "sunday", label: "Sun" },
];

export default function Plan() {
  const navigate = useNavigate();
  const [plan, setPlan] = useState<GeneratedPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lovedIds, setLovedIds] = useState<Set<number>>(new Set());
  const [selectedItem, setSelectedItem] = useState<PlanItem | null>(null);
  const [smartSetupLoading, setSmartSetupLoading] = useState(false);

  // Recipe search state for specific meal requests
  const [pendingSearchMeals, setPendingSearchMeals] = useState<
    Array<{ day: string; description: string }>
  >([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const [resolvedSpecificMeals, setResolvedSpecificMeals] = useState<
    Array<{ day: string; recipe_id: number }>
  >([]);
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([]);
  const shouldAutoGenerate = useRef(false);

  // Stored across the search flow for plan generation
  const [cookingSchedule, setCookingSchedule] = useState<any[]>([]);

  // Load saved plan on mount
  useEffect(() => {
    const savedPlanId = localStorage.getItem("currentPlanId");
    if (savedPlanId) {
      setLoading(true);
      getMealPlan(Number(savedPlanId))
        .then((result) => {
          setPlan({
            id: result.id,
            week_start: result.week_start || "",
            items: (result.items || []) as any,
          });
        })
        .catch(() => {
          // Plan no longer exists, clear stale ID
          localStorage.removeItem("currentPlanId");
        })
        .finally(() => setLoading(false));
    }
  }, []);

  const getWeekStart = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek) % 7 || 7;
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + daysUntilMonday);
    return nextMonday.toISOString().split("T")[0];
  };

  const generatePlanAfterSearch = async (
    schedule: any[],
    locks: Array<{ day: string; recipe_id: number }>,
    recipes: Recipe[],
  ) => {
    console.log("[Plan] generatePlanAfterSearch called", { locks, recipesCount: recipes.length });
    setLoading(true);
    setError(null);
    try {
      const families = await getFamilies();
      const family = families[0];
      if (!family?.id) throw new Error("No family found. Please create a family first.");

      const weekStart = getWeekStart();

      const specificMealsForPlan = locks.length > 0
        ? locks.map((m) => {
            const recipe = recipes.find((r) => r.id === m.recipe_id);
            console.log("[Plan] lock mapping", { day: m.day, recipe_id: m.recipe_id, foundTitle: recipe?.title });
            return { day: m.day, description: recipe?.title || "" };
          })
        : undefined;

      const locksObj = locks.length > 0
        ? Object.fromEntries(locks.map((m) => [m.day, m.recipe_id]))
        : undefined;

      console.log("[Plan] calling generateMealPlanV3", { specificMealsForPlan, locksObj });

      const result = await generateMealPlanV3({
        family_id: family.id,
        week_start: weekStart,
        cooking_schedule: schedule,
        lunch_needs: [],
        max_cook_minutes_weekday: family.max_cook_minutes_weekday ?? 45,
        max_cook_minutes_weekend: family.max_cook_minutes_weekend ?? 90,
        vegetarian_ratio: family.vegetarian_ratio ?? 0,
        specific_meals: specificMealsForPlan,
        locks: locksObj,
      });

      console.log("[Plan] generateMealPlanV3 result", { id: result.id, itemCount: result.items?.length });
      setPlan({ id: result.id, week_start: result.week_start || weekStart, items: (result.items || []) as any });
      localStorage.setItem("currentPlanId", String(result.id));
      localStorage.setItem("lastPlanId", String(result.id));
      localStorage.setItem("lastMealPlanId", String(result.id));
    } catch (err: any) {
      console.error("[Plan] generatePlanAfterSearch error", err);
      setError(err.message || "Failed to generate plan");
    } finally {
      setLoading(false);
    }
  };

  const handleSmartSetup = async (text: string) => {
    console.log("[Plan] handleSmartSetup called", { text });
    setSmartSetupLoading(true);
    setError(null);
    setPendingSearchMeals([]);
    setCurrentSearchIndex(0);
    setResolvedSpecificMeals([]);
    shouldAutoGenerate.current = false;

    try {
      const families = await getFamilies();
      const familyId = families[0]?.id;
      if (!familyId) throw new Error("No family found. Please create a family first.");

      const weekStart = getWeekStart();
      const result = await smartSetup(familyId, text);
      console.log("[Plan] smartSetup result", result);

      // Build cooking schedule from smart setup result
      const days: DayOfWeek[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
      const schedule = days.map((day) => ({
        family_id: familyId,
        week_start: weekStart,
        day,
        is_cooking: result.cooking_days[day]?.is_cooking ?? false,
        meal_mode: (result.cooking_days[day]?.meal_mode || "one_main") as "one_main" | "customize_mains",
      }));
      setCookingSchedule(schedule);

      // Check for specific meal requests
      if (result.specific_meals && result.specific_meals.length > 0) {
        const recipes = await getRecipes();
        setAllRecipes(recipes);
        console.log("[Plan] loaded recipes for matching", { count: recipes.length, specificMeals: result.specific_meals });

        const unmatched: Array<{ day: string; description: string }> = [];
        const autoResolved: Array<{ day: string; recipe_id: number }> = [];

        for (const meal of result.specific_meals) {
          const desc = meal.description.toLowerCase();
          const match = recipes.find((r) => r.title.toLowerCase() === desc);
          if (match) {
            console.log("[Plan] auto-matched meal", { description: meal.description, matchedRecipe: match.title, id: match.id });
            autoResolved.push({ day: meal.day, recipe_id: match.id });
          } else {
            console.log("[Plan] unmatched meal, will show search modal", { description: meal.description, day: meal.day });
            unmatched.push(meal);
          }
        }

        setResolvedSpecificMeals(autoResolved);
        shouldAutoGenerate.current = true;

        if (unmatched.length > 0) {
          setPendingSearchMeals(unmatched);
          setCurrentSearchIndex(0);
        } else {
          setSmartSetupLoading(false);
          generatePlanAfterSearch(schedule, autoResolved, recipes);
          return;
        }
      } else {
        // No specific meals — generate immediately
        console.log("[Plan] no specific meals, generating immediately");
        setSmartSetupLoading(false);
        generatePlanAfterSearch(schedule, [], []);
        return;
      }
    } catch (err: any) {
      console.error("[Plan] handleSmartSetup error", err);
      setError(err.message || "Smart setup failed. Please try again.");
    } finally {
      setSmartSetupLoading(false);
    }
  };

  const finishSearchFlow = useCallback(
    (finalResolved: Array<{ day: string; recipe_id: number }>, recipes: Recipe[]) => {
      console.log("[Plan] finishSearchFlow", { finalResolved, recipesCount: recipes.length });
      setPendingSearchMeals([]);
      setCurrentSearchIndex(0);
      if (shouldAutoGenerate.current) {
        shouldAutoGenerate.current = false;
        generatePlanAfterSearch(cookingSchedule, finalResolved, recipes);
      }
    },
    [cookingSchedule],
  );

  const handleRecipeSelected = (recipe: Recipe) => {
    console.log("[Plan] handleRecipeSelected", { recipeId: recipe.id, title: recipe.title });
    const meal = pendingSearchMeals[currentSearchIndex];
    const updatedLocks = [
      ...resolvedSpecificMeals,
      { day: meal.day, recipe_id: recipe.id },
    ];
    const updatedRecipes = [...allRecipes, recipe];
    setAllRecipes(updatedRecipes);
    setResolvedSpecificMeals(updatedLocks);

    if (currentSearchIndex < pendingSearchMeals.length - 1) {
      setCurrentSearchIndex((prev) => prev + 1);
    } else {
      finishSearchFlow(updatedLocks, updatedRecipes);
    }
  };

  const handleSearchSkip = () => {
    console.log("[Plan] handleSearchSkip", { currentSearchIndex, total: pendingSearchMeals.length });
    if (currentSearchIndex < pendingSearchMeals.length - 1) {
      setCurrentSearchIndex((prev) => prev + 1);
    } else {
      finishSearchFlow(resolvedSpecificMeals, allRecipes);
    }
  };

  const handleLove = async (itemId: number) => {
    try {
      const result = await markMealAsLoved(itemId);
      setLovedIds((prev) => {
        const next = new Set(prev);
        if (result.loved === false) {
          next.delete(itemId);
        } else {
          next.add(itemId);
        }
        return next;
      });
    } catch (err) {
      console.error("Failed to love meal:", err);
    }
  };

  // Group plan items by day
  const dayData = plan
    ? DAYS.map(({ key, label }) => {
        const items = (plan.items || []).filter((i) => i.day === key);
        const mains = items.filter((i) => i.meal_type === "main");
        const sides = items.filter((i) => i.meal_type === "side");
        const lunches = items.filter((i) => i.meal_type === "lunch");
        return { key, label, mains, sides, lunches, hasMeals: items.length > 0 };
      })
    : null;

  return (
    <div className="max-w-2xl mx-auto space-y-8 py-4">
      {/* Welcome message + Conversational Planner (hidden when plan is loaded) */}
      {!plan && !loading && (
        <>
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 space-y-4 text-gray-700 leading-relaxed text-[15px]">
            <p>
              What are you thinking about this week? What nights are you thinking of
              cooking? Do you already know what meals you want to make?
            </p>
            <p>
              I can pull your favorite recipes from the web or pull from your own
              recipes, or both! Based on your profile, I'll suggest meals you might
              want to make. I'll keep track of the recipes you love, and keep a
              record of all the meals you make.
            </p>
            <p className="font-semibold text-emerald-800">
              Shall we get started?
            </p>
          </div>

          <ConversationalPlanner
            onSmartSetup={handleSmartSetup}
            loading={smartSetupLoading}
          />
        </>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            Your Week
          </h3>
          <div className="grid grid-cols-7 gap-2">
            {DAYS.map(({ label }) => (
              <div
                key={label}
                className="bg-white border border-gray-200 rounded-xl p-4 text-center min-h-[140px] flex flex-col items-center justify-center animate-pulse"
              >
                <span className="text-xs font-semibold text-gray-400 uppercase">
                  {label}
                </span>
                <div className="mt-3 space-y-2 w-full px-1">
                  <div className="h-3 bg-gray-200 rounded w-full" />
                  <div className="h-2 bg-gray-100 rounded w-3/4 mx-auto" />
                </div>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-gray-400">
            Talking to the chef... picking recipes... setting the table...
          </p>
        </div>
      )}

      {/* Empty grid (no plan yet, not loading) */}
      {!plan && !loading && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            Your Week
          </h3>
          <div className="grid grid-cols-7 gap-2">
            {DAYS.map(({ label }) => (
              <div
                key={label}
                className="bg-white border border-dashed border-gray-300 rounded-xl p-4 text-center min-h-[120px] flex flex-col items-center justify-center"
              >
                <span className="text-xs font-semibold text-gray-400 uppercase">
                  {label}
                </span>
                <span className="text-gray-300 text-2xl mt-2">+</span>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-gray-400">
            Tell me about your week and hit Generate to fill this in
          </p>
        </div>
      )}

      {/* Generated plan grid */}
      {plan && !loading && dayData && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              Your Week — {plan.week_start}
            </h3>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setPlan(null);
                  localStorage.removeItem("currentPlanId");
                }}
                className="text-sm font-medium text-gray-500 hover:text-gray-700"
              >
                Generate New Plan
              </button>
              <button
                onClick={() => navigate("/grocery")}
                className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
              >
                View Grocery List →
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2">
            {dayData.map(({ key, label, mains, sides, lunches, hasMeals }) => (
              <div
                key={key}
                className={`rounded-xl p-3 min-h-[160px] flex flex-col ${
                  hasMeals
                    ? "bg-white border border-gray-200"
                    : "bg-gray-50 border border-dashed border-gray-300"
                }`}
              >
                <span className="text-xs font-semibold text-gray-400 uppercase text-center">
                  {label}
                </span>

                {!hasMeals && (
                  <div className="flex-1 flex items-center justify-center">
                    <span className="text-xs text-gray-300 italic">Off</span>
                  </div>
                )}

                {/* Mains */}
                {mains.map((item) => (
                  <div key={item.id} className="mt-2 space-y-1">
                    <p
                      className="text-xs font-medium text-gray-900 leading-tight cursor-pointer hover:text-emerald-600 transition-colors"
                      onClick={() => setSelectedItem(item)}
                    >
                      {item.recipe_name || "—"}
                    </p>
                    {item.cook_minutes && (
                      <p className="text-[10px] text-gray-400">
                        {item.cook_minutes}min
                        {item.vegetarian && " · 🌿"}
                        {item.makes_leftovers && " · 📦"}
                      </p>
                    )}
                    <div className="flex gap-1 mt-1">
                      <button
                        onClick={() => handleLove(item.id)}
                        className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                          lovedIds.has(item.id)
                            ? "bg-red-100 text-red-500"
                            : "hover:bg-gray-100 text-gray-400"
                        }`}
                        title="Love this recipe"
                      >
                        {lovedIds.has(item.id) ? "❤️" : "🤍"}
                      </button>
                      <button
                        onClick={() => alert("Swap coming soon!")}
                        className="text-xs px-1.5 py-0.5 rounded text-gray-400 hover:bg-gray-100 transition-colors"
                        title="Swap recipe"
                      >
                        🔄
                      </button>
                    </div>
                  </div>
                ))}

                {/* Sides */}
                {sides.map((item) => {
                  const sideName =
                    item.recipe_name ||
                    (typeof item.notes === "object" ? item.notes?.side_name : null) ||
                    "Side";
                  return (
                    <p
                      key={item.id}
                      className="text-[10px] text-gray-500 mt-1 italic"
                    >
                      + {sideName}
                    </p>
                  );
                })}

                {/* Lunches */}
                {lunches.length > 0 && (
                  <div className="mt-auto pt-2 border-t border-gray-100">
                    {lunches.map((item) => (
                      <p
                        key={item.id}
                        className="text-[10px] text-amber-600"
                      >
                        🥪 {item.recipe_name || "Leftovers"}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Regenerate hint */}
          <p className="text-center text-sm text-gray-400">
            Not quite right? Click "Generate New Plan" above to start fresh.
          </p>
        </div>
      )}
      {/* Recipe Search Modal for specific meal requests */}
      {pendingSearchMeals.length > 0 && currentSearchIndex < pendingSearchMeals.length && (
        <RecipeSearchModal
          key={currentSearchIndex}
          initialQuery={pendingSearchMeals[currentSearchIndex].description}
          dayLabel={pendingSearchMeals[currentSearchIndex].day}
          stepLabel={
            pendingSearchMeals.length > 1
              ? `${currentSearchIndex + 1} of ${pendingSearchMeals.length}`
              : undefined
          }
          onRecipeSelected={handleRecipeSelected}
          onClose={handleSearchSkip}
        />
      )}

      {/* Meal detail modal */}
      {selectedItem && (
        <MealDetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onLove={handleLove}
          isLoved={lovedIds.has(selectedItem.id)}
          onSwap={async (newRecipeId) => {
            await swapMainRecipe(selectedItem.id, newRecipeId);
            // Refresh the plan to reflect the swap
            if (plan) {
              try {
                const refreshed = await getMealPlan(plan.id);
                setPlan({
                  id: refreshed.id,
                  week_start: refreshed.week_start || plan.week_start,
                  items: (refreshed.items || []) as any,
                });
              } catch {
                // Fallback: just close the modal
              }
            }
            setSelectedItem(null);
          }}
        />
      )}
    </div>
  );
}
