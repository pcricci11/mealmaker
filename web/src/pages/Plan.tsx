import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  generateMealPlanV3,
  getFamilies,
  smartSetup,
  getRecipes,
  getRecipeById,
  markMealAsLoved,
  swapMainRecipe,
  getMealPlan,
  getFamilyMembers,
  swapSide,
  addSide,
  removeSide,
  removeMealItem,
  matchRecipeInDb,
  batchSearchRecipesWeb,
} from "../api";
import MealDetailModal from "../components/MealDetailModal";
import ConversationalPlanner from "../components/ConversationalPlanner";
import RecipeSearchModal from "../components/RecipeSearchModal";
import SmartSetupProgressModal from "../components/SmartSetupProgressModal";
import type { SmartSetupProgress } from "../components/SmartSetupProgressModal";
import MealDayCard from "../components/MealDayCard";
import SwapSideModal from "../components/SwapSideModal";
import AddSideModal from "../components/AddSideModal";
import SwapMainModal from "../components/SwapMainModal";
import BuildFromRecipesModal from "../components/BuildFromRecipesModal";
import type {
  DayOfWeek,
  Recipe,
  Family,
  MealPlan,
  MealPlanItemV3,
  FamilyMemberV3,
  WebSearchRecipeResult,
} from "@shared/types";

const DAYS: { key: string; label: string }[] = [
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lovedIds, setLovedIds] = useState<Set<number>>(new Set());
  const [selectedItem, setSelectedItem] = useState<MealPlanItemV3 | null>(null);
  const [setupProgress, setSetupProgress] = useState<SmartSetupProgress | null>(null);

  // Family & members
  const [family, setFamily] = useState<Family | null>(null);
  const [members, setMembers] = useState<FamilyMemberV3[]>([]);

  // Modal states (from MealPlan.tsx)
  const [swapSideModal, setSwapSideModal] = useState<{
    mealItemId: number;
    mainRecipeId: number;
  } | null>(null);
  const [addSideModal, setAddSideModal] = useState<number | null>(null);
  const [swapMainModal, setSwapMainModal] = useState<{
    mealItemId: number;
    day: DayOfWeek;
  } | null>(null);
  const [showBuildFromRecipes, setShowBuildFromRecipes] = useState(false);
  const [draftRecipes, setDraftRecipes] = useState<Map<DayOfWeek, Recipe>>(new Map());

  // Recipe search state for specific meal requests
  const [pendingSearchMeals, setPendingSearchMeals] = useState<
    Array<{ day: string; description: string }>
  >([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const [resolvedSpecificMeals, setResolvedSpecificMeals] = useState<
    Array<{ day: string; recipe_id: number }>
  >([]);
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([]);
  const [batchedSearchResults, setBatchedSearchResults] = useState<
    Record<string, WebSearchRecipeResult[]>
  >({});
  const shouldAutoGenerate = useRef(false);

  // Stored across the search flow for plan generation
  const [cookingSchedule, setCookingSchedule] = useState<any[]>([]);

  // Load saved plan + family/members on mount
  useEffect(() => {
    const loadFamilyData = async () => {
      try {
        const families = await getFamilies();
        if (families.length > 0) {
          setFamily(families[0]);
          const membersData = await getFamilyMembers(families[0].id);
          setMembers(membersData);
        }
      } catch (err) {
        console.error("Failed to load family data:", err);
      }
    };
    loadFamilyData();

    // Load plan from ?id= query param, or fall back to localStorage
    const paramId = searchParams.get("id");
    const planIdToLoad = paramId || localStorage.getItem("currentPlanId");
    if (planIdToLoad) {
      setLoading(true);
      getMealPlan(Number(planIdToLoad))
        .then((result) => {
          setPlan(result);
          localStorage.setItem("currentPlanId", String(result.id));
          // Clean up the ?id= param so URL stays clean
          if (paramId) {
            setSearchParams({}, { replace: true });
          }
        })
        .catch(() => {
          localStorage.removeItem("currentPlanId");
        })
        .finally(() => setLoading(false));
    }
  }, []);

  const refreshPlan = async () => {
    if (!plan) return;
    try {
      const refreshed = await getMealPlan(plan.id);
      setPlan(refreshed);
    } catch (err) {
      console.error("Failed to refresh plan:", err);
    }
  };

  const getWeekStart = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek) % 7 || 7;
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + daysUntilMonday);
    return nextMonday.toISOString().split("T")[0];
  };


  const staggerRevealResults = async (
    queries: Array<{ query: string; status: "searching" | "found" | "not_found" }>,
    results: Record<string, WebSearchRecipeResult[]>,
  ) => {
    for (let i = 0; i < queries.length; i++) {
      await new Promise((r) => setTimeout(r, 400));
      setSetupProgress((prev) => {
        if (!prev) return prev;
        const updated = [...prev.searchQueries];
        updated[i] = {
          ...updated[i],
          status: (results[queries[i].query]?.length ?? 0) > 0 ? "found" : "not_found",
        };
        return { ...prev, searchQueries: updated };
      });
    }
  };

  const handleSmartSetup = async (text: string) => {
    console.log("[Plan] handleSmartSetup called", { text });
    setSetupProgress({ phase: "parsing", message: "Understanding your week...", searchQueries: [] });
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
        setSetupProgress({ phase: "matching", message: "Checking your recipe collection...", searchQueries: [] });

        const fetchedRecipes = await getRecipes();
        setAllRecipes(fetchedRecipes);
        console.log("[Plan] loaded recipes for matching", { count: fetchedRecipes.length, specificMeals: result.specific_meals });

        const unmatched: Array<{ day: string; description: string }> = [];
        const autoResolved: Array<{ day: string; recipe_id: number }> = [];

        // Fuzzy-match each specific meal against the database
        for (const meal of result.specific_meals) {
          const dbMatch = await matchRecipeInDb(meal.description);
          if (dbMatch) {
            console.log("[Plan] DB fuzzy-matched meal", { description: meal.description, matchedRecipe: dbMatch.title, id: dbMatch.id });
            autoResolved.push({ day: meal.day, recipe_id: dbMatch.id });
            // Ensure the matched recipe is in allRecipes for later use
            if (!fetchedRecipes.some((r) => r.id === dbMatch.id)) {
              fetchedRecipes.push(dbMatch);
              setAllRecipes([...fetchedRecipes]);
            }
          } else {
            console.log("[Plan] no DB match, will show search modal", { description: meal.description, day: meal.day });
            unmatched.push(meal);
          }
        }

        setResolvedSpecificMeals(autoResolved);
        shouldAutoGenerate.current = true;

        if (unmatched.length > 0) {
          // Set up searching phase with all unmatched queries
          const searchQueries = unmatched.map((m) => ({
            query: m.description,
            status: "searching" as const,
          }));
          setSetupProgress({
            phase: "searching",
            message: "Searching for recipes online...",
            searchQueries,
          });

          // Batch search all unmatched meals in a single API call
          let batchResults: Record<string, WebSearchRecipeResult[]> = {};
          try {
            batchResults = await batchSearchRecipesWeb(
              unmatched.map((m) => m.description)
            );
            console.log("[Plan] batch search results", batchResults);
            setBatchedSearchResults(batchResults);
          } catch (err) {
            console.warn("[Plan] batch search failed, modals will search individually", err);
            setBatchedSearchResults({});
          }

          // Stagger reveal each result
          await staggerRevealResults(searchQueries, batchResults);

          // Brief "done" phase before showing modals
          setSetupProgress({ phase: "done", message: "All set! Let's pick your recipes...", searchQueries: [] });
          await new Promise((r) => setTimeout(r, 600));
          setSetupProgress(null);

          setPendingSearchMeals(unmatched);
          setCurrentSearchIndex(0);
        } else {
          // All specific meals matched — populate draft
          const newDraft = new Map(draftRecipes);
          for (const lock of autoResolved) {
            const recipe = fetchedRecipes.find((r) => r.id === lock.recipe_id);
            if (recipe) newDraft.set(lock.day as DayOfWeek, recipe);
          }
          setDraftRecipes(newDraft);
          setSetupProgress(null);
          return;
        }
      } else {
        // No specific meals — just store cooking schedule, user fills manually
        setSetupProgress({ phase: "done", message: "Schedule set! Now pick your meals.", searchQueries: [] });
        await new Promise((r) => setTimeout(r, 1200));
        setSetupProgress(null);
        return;
      }
    } catch (err: any) {
      console.error("[Plan] handleSmartSetup error", err);
      setError(err.message || "Smart setup failed. Please try again.");
    } finally {
      setSetupProgress(null);
    }
  };

  const finishSearchFlow = useCallback(
    (finalResolved: Array<{ day: string; recipe_id: number }>, recipes: Recipe[]) => {
      console.log("[Plan] finishSearchFlow", { finalResolved, recipesCount: recipes.length });
      setPendingSearchMeals([]);
      setCurrentSearchIndex(0);
      const newDraft = new Map(draftRecipes);
      for (const lock of finalResolved) {
        const recipe = recipes.find((r) => r.id === lock.recipe_id);
        if (recipe) newDraft.set(lock.day as DayOfWeek, recipe);
      }
      setDraftRecipes(newDraft);
      shouldAutoGenerate.current = false;
    },
    [cookingSchedule, draftRecipes],
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

  const handleRecipesSelected = (assignments: Map<DayOfWeek, Recipe>) => {
    setShowBuildFromRecipes(false);
    const merged = new Map(draftRecipes);
    for (const [day, recipe] of assignments) {
      merged.set(day, recipe);
    }
    setDraftRecipes(merged);
  };

  const handleLockPlan = async () => {
    setLoading(true);
    setError(null);
    try {
      const families = await getFamilies();
      const fam = families[0];
      if (!fam?.id) throw new Error("No family found.");
      const weekStart = getWeekStart();

      const days: DayOfWeek[] = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
      const schedule = cookingSchedule.length > 0
        ? cookingSchedule
        : days.map((day) => ({
            family_id: fam.id, week_start: weekStart, day,
            is_cooking: draftRecipes.has(day), meal_mode: "one_main" as const,
          }));

      const locks = draftRecipes.size > 0
        ? Object.fromEntries(Array.from(draftRecipes.entries()).map(([day, r]) => [day, r.id]))
        : undefined;
      const specificMeals = draftRecipes.size > 0
        ? Array.from(draftRecipes.entries()).map(([day, r]) => ({ day, description: r.title }))
        : undefined;

      const result = await generateMealPlanV3({
        family_id: fam.id, week_start: weekStart, cooking_schedule: schedule,
        lunch_needs: [], max_cook_minutes_weekday: fam.max_cook_minutes_weekday ?? 45,
        max_cook_minutes_weekend: fam.max_cook_minutes_weekend ?? 90,
        vegetarian_ratio: fam.vegetarian_ratio ?? 0, locks, specific_meals: specificMeals,
      });

      setPlan(result);
      setDraftRecipes(new Map());
      localStorage.setItem("currentPlanId", String(result.id));
      localStorage.setItem("lastPlanId", String(result.id));
      localStorage.setItem("lastMealPlanId", String(result.id));
      navigate("/grocery");
    } catch (err: any) {
      setError(err.message || "Failed to lock plan");
    } finally {
      setLoading(false);
    }
  };

  const handleEditWeek = async () => {
    if (!plan) return;
    const allFetchedRecipes = await getRecipes();
    const newDraft = new Map<DayOfWeek, Recipe>();
    for (const item of plan.items) {
      if (item.meal_type === "main" && item.recipe_id) {
        const recipe = allFetchedRecipes.find((r) => r.id === item.recipe_id);
        if (recipe) newDraft.set(item.day, recipe);
      }
    }
    setPlan(null);
    localStorage.removeItem("currentPlanId");
    setDraftRecipes(newDraft);
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

  // Editing handlers (from MealPlan.tsx)
  const handleSwapSide = async (newSideId?: number, customName?: string) => {
    if (!swapSideModal) return;
    try {
      await swapSide(swapSideModal.mealItemId, newSideId, customName);
      await refreshPlan();
      setSwapSideModal(null);
    } catch (error) {
      console.error("Error swapping side:", error);
      alert("Failed to swap side");
    }
  };

  const handleAddSide = async (sideId?: number, customName?: string) => {
    if (!addSideModal) return;
    try {
      await addSide(addSideModal, sideId, customName);
      await refreshPlan();
      setAddSideModal(null);
    } catch (error) {
      console.error("Error adding side:", error);
      alert("Failed to add side");
    }
  };

  const handleRemoveSide = async (mealItemId: number) => {
    if (!confirm("Remove this side?")) return;
    try {
      await removeSide(mealItemId);
      await refreshPlan();
    } catch (error) {
      console.error("Error removing side:", error);
      alert("Failed to remove side");
    }
  };

  const handleSwapMain = async (newRecipeId: number) => {
    if (!swapMainModal) return;
    try {
      const updatedPlan = await swapMainRecipe(swapMainModal.mealItemId, newRecipeId);
      setPlan(updatedPlan);
      setSwapMainModal(null);
    } catch (error) {
      console.error("Error swapping main:", error);
      alert("Failed to swap main");
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
      {!plan && !loading && !setupProgress && (
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
            loading={setupProgress !== null}
            onPickFromRecipes={() => setShowBuildFromRecipes(true)}
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
            Generating your personalized meal plan...
          </p>
        </div>
      )}

      {/* Interactive draft grid (no plan yet, not loading) */}
      {!plan && !loading && !setupProgress && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {draftRecipes.size > 0 && (
                <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Editing</span>
              )}
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
                Your Week
              </h3>
            </div>
            {draftRecipes.size > 0 && (
              <button
                onClick={() => setShowBuildFromRecipes(true)}
                className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
              >
                + Add Recipes
              </button>
            )}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {DAYS.map(({ key, label }) => {
              const recipe = draftRecipes.get(key as DayOfWeek);
              return recipe ? (
                <div
                  key={key}
                  className="bg-emerald-50 border border-emerald-300 rounded-xl p-3 text-center min-h-[120px] flex flex-col items-center justify-center relative cursor-pointer hover:border-emerald-400 transition-colors"
                  onClick={() => {
                    const fakeItem: MealPlanItemV3 = {
                      id: 0, meal_plan_id: 0, day: key as DayOfWeek,
                      recipe_id: recipe.id, recipe: recipe, locked: false,
                      lunch_leftover_label: null, leftover_lunch_recipe_id: null,
                      notes: null, meal_type: "main", main_number: null,
                      assigned_member_ids: null, parent_meal_item_id: null,
                      is_custom: false, recipe_name: recipe.title,
                    };
                    setSelectedItem(fakeItem);
                  }}
                >
                  <span className="text-xs font-semibold text-emerald-700 uppercase">
                    {label}
                  </span>
                  <span className="text-xs text-gray-700 mt-1 line-clamp-2 leading-tight font-medium">
                    {recipe.title}
                  </span>
                  {recipe.cuisine && (
                    <span className="text-[10px] text-emerald-600 mt-0.5">
                      {recipe.cuisine.replace("_", " ")}
                    </span>
                  )}
                  {recipe.cook_minutes && (
                    <span className="text-[10px] text-gray-400">
                      {recipe.cook_minutes} min
                    </span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const next = new Map(draftRecipes);
                      next.delete(key as DayOfWeek);
                      setDraftRecipes(next);
                    }}
                    className="absolute top-1 right-1 text-gray-400 hover:text-red-500 text-xs"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  key={key}
                  onClick={() => setShowBuildFromRecipes(true)}
                  className="bg-white border border-dashed border-gray-300 rounded-xl p-4 text-center min-h-[120px] flex flex-col items-center justify-center hover:border-emerald-400 hover:bg-emerald-50/30 transition-colors"
                >
                  <span className="text-xs font-semibold text-gray-400 uppercase">
                    {label}
                  </span>
                  <span className="text-gray-300 text-2xl mt-2">+</span>
                </button>
              );
            })}
          </div>
          {draftRecipes.size > 0 ? (
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={handleLockPlan}
                className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2"
              >
                Lock Plan & Build Grocery List
              </button>
              <p className="text-xs text-gray-400">
                {draftRecipes.size} recipe{draftRecipes.size !== 1 ? "s" : ""} assigned — remaining days will be auto-filled
              </p>
            </div>
          ) : (
            <p className="text-center text-sm text-gray-400">
              Tell me about your week above, or click + to pick from your recipes
            </p>
          )}
        </div>
      )}

      {/* Locked plan — MealDayCard layout */}
      {plan && !loading && dayData && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">Locked</span>
              <h2 className="text-2xl font-bold text-gray-900">Your Meal Plan</h2>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleEditWeek}
                className="text-sm font-medium text-gray-500 hover:text-gray-700"
              >
                Edit Week
              </button>
              <button
                onClick={() => navigate("/grocery")}
                className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
              >
                Grocery List →
              </button>
            </div>
          </div>
          <p className="text-sm text-gray-500">
            Week of {plan.week_start || "this week"}
          </p>

          <div className="space-y-4">
            {dayData.map(({ key, mains, lunches, sides, hasMeals }) => {
              if (!hasMeals) return null;
              return (
                <MealDayCard
                  key={key}
                  day={key}
                  mains={mains}
                  lunches={lunches}
                  sides={sides}
                  members={members}
                  onSwapSide={(mealItemId, mainRecipeId) =>
                    setSwapSideModal({ mealItemId, mainRecipeId })
                  }
                  onAddSide={(mainMealItemId) => setAddSideModal(mainMealItemId)}
                  onLoveMeal={handleLove}
                  onRemoveSide={handleRemoveSide}
                  onDeleteMain={async (mealItemId) => {
                    if (!confirm("Remove this meal?")) return;
                    try { await removeMealItem(mealItemId); await refreshPlan(); }
                    catch (err) { console.error("Failed to remove meal:", err); }
                  }}
                  onSwapMain={(mealItemId) =>
                    setSwapMainModal({ mealItemId, day: key as DayOfWeek })
                  }
                  onMealClick={(item) => setSelectedItem(item)}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Smart Setup Progress Modal */}
      {setupProgress && <SmartSetupProgressModal progress={setupProgress} />}

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
          prefetchedResults={batchedSearchResults[pendingSearchMeals[currentSearchIndex].description]}
          onRecipeSelected={handleRecipeSelected}
          onClose={handleSearchSkip}
        />
      )}

      {/* Meal detail modal */}
      {selectedItem && (
        <MealDetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onLove={plan ? handleLove : () => {}}
          isLoved={plan ? lovedIds.has(selectedItem.id) : false}
          onSwap={async (newRecipeId) => {
            if (!plan) {
              // Draft mode — update local state
              const recipe = await getRecipeById(newRecipeId);
              const day = selectedItem.day as DayOfWeek;
              const next = new Map(draftRecipes);
              next.set(day, recipe);
              setDraftRecipes(next);
            } else {
              // Locked mode — API call
              await swapMainRecipe(selectedItem.id, newRecipeId);
              await refreshPlan();
            }
            setSelectedItem(null);
          }}
        />
      )}

      {/* Side/Main swap modals */}
      {swapSideModal && (
        <SwapSideModal
          mealItemId={swapSideModal.mealItemId}
          mainRecipeId={swapSideModal.mainRecipeId}
          onSwap={handleSwapSide}
          onClose={() => setSwapSideModal(null)}
        />
      )}

      {addSideModal && (
        <AddSideModal
          mainMealItemId={addSideModal}
          onAdd={handleAddSide}
          onClose={() => setAddSideModal(null)}
        />
      )}

      {swapMainModal && (
        <SwapMainModal
          mealItemId={swapMainModal.mealItemId}
          day={swapMainModal.day}
          onSwap={handleSwapMain}
          onClose={() => setSwapMainModal(null)}
        />
      )}

      {showBuildFromRecipes && family && (
        <BuildFromRecipesModal
          familyId={family.id}
          initialAssignments={draftRecipes}
          onSelect={handleRecipesSelected}
          onClose={() => setShowBuildFromRecipes(false)}
        />
      )}
    </div>
  );
}
