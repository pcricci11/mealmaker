import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import {
  generateMealPlanV3,
  lockMealPlan,
  getFamilies,
  smartSetup,
  getRecipes,
  markMealAsLoved,
  swapMainRecipe,
  getMealPlan,
  getFamilyMembers,
  swapSide,
  addSide,
  removeSide,
  removeMealItem,
  addMealToDay,
  matchRecipeInDb,
  batchSearchRecipesWeb,
  isAbortError,
} from "../api";
import ConversationalPlanner from "../components/ConversationalPlanner";
import RecipeSearchModal from "../components/RecipeSearchModal";
import QuickDinnerModal from "../components/QuickDinnerModal";
import SmartSetupProgressModal from "../components/SmartSetupProgressModal";
import type { SmartSetupProgress } from "../components/SmartSetupProgressModal";
import MealDayCard from "../components/MealDayCard";
import SwapSideModal from "../components/SwapSideModal";
import AddSideModal from "../components/AddSideModal";
import BuildFromRecipesModal from "../components/BuildFromRecipesModal";
import DbMatchConfirmModal from "../components/DbMatchConfirmModal";
import type { PendingConfirmation } from "../components/DbMatchConfirmModal";
import type {
  DayOfWeek,
  Recipe,
  Family,
  MealPlan,
  FamilyMemberV3,
  WebSearchRecipeResult,
} from "@shared/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const DAYS: { key: string; label: string }[] = [
  { key: "monday", label: "Mon" },
  { key: "tuesday", label: "Tue" },
  { key: "wednesday", label: "Wed" },
  { key: "thursday", label: "Thu" },
  { key: "friday", label: "Fri" },
  { key: "saturday", label: "Sat" },
  { key: "sunday", label: "Sun" },
];

function getTodayDay(): DayOfWeek {
  const days: DayOfWeek[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return days[new Date().getDay()];
}

export default function Plan() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMyPlan = location.pathname === "/my-plan";
  const [searchParams, setSearchParams] = useSearchParams();
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [lockProgress, setLockProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lovedIds, setLovedIds] = useState<Set<number>>(new Set());
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
  const [mainModal, setMainModal] = useState<{
    mode: "swap" | "add";
    day: DayOfWeek;
    mealItemId?: number;
    step: "choose" | "web-search";
  } | null>(null);
  const [mainModalSearchQuery, setMainModalSearchQuery] = useState("");
  const [showBuildFromRecipes, setShowBuildFromRecipes] = useState(false);
  const [draftRecipes, setDraftRecipes] = useState<Map<DayOfWeek, Recipe[]>>(new Map());
  const [quickDinnerOpen, setQuickDinnerOpen] = useState(false);

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

  // DB match confirmation state
  const [pendingConfirmations, setPendingConfirmations] = useState<PendingConfirmation[]>([]);
  const [currentConfirmIndex, setCurrentConfirmIndex] = useState(0);
  // Meals that user rejected DB match for — will go to web search
  const pendingWebSearchRef = useRef<Array<{ day: string; description: string }>>([]);

  // Stored across the search flow for plan generation
  const [cookingSchedule, setCookingSchedule] = useState<any[]>([]);

  // Cancellation support
  const abortControllerRef = useRef<AbortController | null>(null);
  const lockTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // Load family/members on mount; load saved plan only on /my-plan
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

    // Load saved plan: /my-plan always tries localStorage; /plan only from explicit ?id= param
    const paramId = searchParams.get("id");
    const planIdToLoad = isMyPlan
      ? (paramId || localStorage.getItem("currentPlanId"))
      : paramId;
    if (planIdToLoad) {
      setLoading(true);
      getMealPlan(Number(planIdToLoad))
        .then((result) => {
          setPlan(result);
          localStorage.setItem("currentPlanId", String(result.id));
          if (paramId) {
            setSearchParams({}, { replace: true });
          }
        })
        .catch(() => {
          localStorage.removeItem("currentPlanId");
        })
        .finally(() => setLoading(false));
    }

    // On /plan, check for draft recipes passed via navigation state (from Edit Week)
    if (!isMyPlan) {
      const state = location.state as { draftRecipes?: Array<[DayOfWeek, Recipe]> } | null;
      if (state?.draftRecipes) {
        const grouped = new Map<DayOfWeek, Recipe[]>();
        for (const [day, recipe] of state.draftRecipes) {
          const existing = grouped.get(day) || [];
          existing.push(recipe);
          grouped.set(day, existing);
        }
        setDraftRecipes(grouped);
        // Clear the state so refreshing doesn't re-apply
        window.history.replaceState({}, "");
      }
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

  const handleCancelSetup = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setSetupProgress(null);
    setPendingSearchMeals([]);
    setCurrentSearchIndex(0);
    setPendingConfirmations([]);
    setCurrentConfirmIndex(0);
    setResolvedSpecificMeals([]);
    setBatchedSearchResults({});
    pendingWebSearchRef.current = [];
    shouldAutoGenerate.current = false;
    showToast("Search cancelled");
  };

  const handleSmartSetup = async (text: string) => {
    console.log("[Plan] handleSmartSetup called", { text });
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const signal = controller.signal;

    setSetupProgress({ phase: "parsing", message: "Prepping your week's menu...", searchQueries: [] });
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
      const result = await smartSetup(familyId, text, signal);
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
        setSetupProgress({ phase: "matching", message: "Whisking through your recipe collection...", searchQueries: [] });

        const fetchedRecipes = await getRecipes();
        setAllRecipes(fetchedRecipes);
        console.log("[Plan] loaded recipes for matching", { count: fetchedRecipes.length, specificMeals: result.specific_meals });

        const unmatched: Array<{ day: string; description: string }> = [];
        const autoResolved: Array<{ day: string; recipe_id: number }> = [];
        const needsConfirmation: PendingConfirmation[] = [];

        // Fuzzy-match each specific meal against the database (top 3, >40%)
        for (const meal of result.specific_meals) {
          if (signal.aborted) return;
          const { matches } = await matchRecipeInDb(meal.description, signal);
          if (matches.length > 0) {
            console.log("[Plan] DB matches found", { description: meal.description, count: matches.length, top: matches[0].recipe.title, topScore: matches[0].score });
            needsConfirmation.push({ day: meal.day, description: meal.description, matches });
            for (const m of matches) {
              if (!fetchedRecipes.some((r) => r.id === m.recipe.id)) {
                fetchedRecipes.push(m.recipe);
              }
            }
            setAllRecipes([...fetchedRecipes]);
          } else {
            console.log("[Plan] no DB match, will search web", { description: meal.description, day: meal.day });
            unmatched.push(meal);
          }
        }

        setResolvedSpecificMeals(autoResolved);
        shouldAutoGenerate.current = true;
        pendingWebSearchRef.current = unmatched;

        // If there are fuzzy matches to confirm, show confirmation modals first
        if (needsConfirmation.length > 0) {
          setSetupProgress(null);
          setPendingConfirmations(needsConfirmation);
          setCurrentConfirmIndex(0);
          return; // Confirmation flow continues via handleConfirmUse / handleConfirmSearchWeb
        }

        // No confirmations needed — proceed directly to web search or finish
        await proceedToWebSearch(unmatched, autoResolved, fetchedRecipes, signal, familyId);
      } else {
        // No specific meals — just store cooking schedule, user fills manually
        setSetupProgress({ phase: "done", message: "Kitchen's ready! Time to pick your meals 🍽️", searchQueries: [] });
        await new Promise((r) => setTimeout(r, 1200));
        setSetupProgress(null);
        return;
      }
    } catch (err: any) {
      if (isAbortError(err)) return;
      console.error("[Plan] handleSmartSetup error", err);
      setError(err.message || "Smart setup failed. Please try again.");
    } finally {
      setSetupProgress(null);
    }
  };

  const proceedToWebSearch = async (
    unmatched: Array<{ day: string; description: string }>,
    resolved: Array<{ day: string; recipe_id: number }>,
    fetchedRecipes: Recipe[],
    signal?: AbortSignal,
    familyId?: number,
  ) => {
    if (unmatched.length > 0) {
      const searchQueries = unmatched.map((m) => ({
        query: m.description,
        status: "searching" as const,
      }));
      setSetupProgress({
        phase: "searching",
        message: "🔍 Sizzling up some recipe ideas...",
        searchQueries,
      });

      let batchResults: Record<string, WebSearchRecipeResult[]> = {};
      try {
        batchResults = await batchSearchRecipesWeb(
          unmatched.map((m) => m.description),
          signal,
          familyId,
        );
        console.log("[Plan] batch search results", batchResults);
        setBatchedSearchResults(batchResults);
      } catch (err) {
        console.warn("[Plan] batch search failed, modals will search individually", err);
        setBatchedSearchResults({});
      }

      await staggerRevealResults(searchQueries, batchResults);

      setSetupProgress({ phase: "done", message: "Found some delicious options! Let's plate up 🤤", searchQueries: [] });
      await new Promise((r) => setTimeout(r, 600));
      setSetupProgress(null);

      setPendingSearchMeals(unmatched);
      setCurrentSearchIndex(0);
    } else {
      // All resolved (via auto + confirmations) — populate draft
      const newDraft = new Map(draftRecipes);
      for (const lock of resolved) {
        const recipe = fetchedRecipes.find((r) => r.id === lock.recipe_id);
        if (recipe) {
          const day = lock.day as DayOfWeek;
          const existing = newDraft.get(day) || [];
          existing.push(recipe);
          newDraft.set(day, existing);
        }
      }
      setDraftRecipes(newDraft);
      setSetupProgress(null);
    }
  };

  const handleConfirmUse = (recipe: Recipe) => {
    const confirmation = pendingConfirmations[currentConfirmIndex];
    console.log("[Plan] user selected DB match", { day: confirmation.day, recipe: recipe.title, id: recipe.id });
    const updatedResolved = [
      ...resolvedSpecificMeals,
      { day: confirmation.day, recipe_id: recipe.id },
    ];
    setResolvedSpecificMeals(updatedResolved);

    if (currentConfirmIndex < pendingConfirmations.length - 1) {
      setCurrentConfirmIndex((prev) => prev + 1);
    } else {
      // All confirmations done — proceed to web search for remaining
      setPendingConfirmations([]);
      setCurrentConfirmIndex(0);
      proceedToWebSearch(pendingWebSearchRef.current, updatedResolved, allRecipes, undefined, family?.id);
    }
  };

  const handleConfirmSearchWeb = () => {
    const confirmation = pendingConfirmations[currentConfirmIndex];
    console.log("[Plan] user rejected DB match, will web search", { day: confirmation.day, description: confirmation.description });
    // Add to web search queue
    pendingWebSearchRef.current = [
      ...pendingWebSearchRef.current,
      { day: confirmation.day, description: confirmation.description },
    ];

    if (currentConfirmIndex < pendingConfirmations.length - 1) {
      setCurrentConfirmIndex((prev) => prev + 1);
    } else {
      // All confirmations done — proceed to web search
      setPendingConfirmations([]);
      setCurrentConfirmIndex(0);
      proceedToWebSearch(pendingWebSearchRef.current, resolvedSpecificMeals, allRecipes, undefined, family?.id);
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
        if (recipe) {
          const day = lock.day as DayOfWeek;
          const existing = newDraft.get(day) || [];
          existing.push(recipe);
          newDraft.set(day, existing);
        }
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

  const handleRecipesSelected = (assignments: Map<DayOfWeek, Recipe[]>) => {
    setShowBuildFromRecipes(false);
    const merged = new Map(draftRecipes);
    for (const [day, recipes] of assignments) {
      const existing = merged.get(day) || [];
      existing.push(...recipes);
      merged.set(day, existing);
    }
    setDraftRecipes(merged);
  };

  const handleLockPlan = async () => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setLockProgress("📝 Reading ingredients for your grocery lists!");
    setError(null);
    try {
      const families = await getFamilies();
      const fam = families[0];
      if (!fam?.id) throw new Error("No family found.");
      const weekStart = getWeekStart();

      // Build items directly from the user's draft selections — no regeneration
      const items = Array.from(draftRecipes.entries()).flatMap(([day, recipes]) =>
        recipes.map((r) => ({ day, recipe_id: r.id }))
      );

      // Timed progress messages
      const progressTimer1 = setTimeout(() => setLockProgress("Mixing together your shopping list..."), 4000);
      const progressTimer2 = setTimeout(() => setLockProgress("Almost done — just seasoning the details..."), 8000);
      lockTimersRef.current = [progressTimer1, progressTimer2];

      const result = await lockMealPlan({
        family_id: fam.id,
        week_start: weekStart,
        items,
      }, controller.signal);

      lockTimersRef.current.forEach(clearTimeout);
      lockTimersRef.current = [];
      setLockProgress("✅ Your plan is ready!");
      await new Promise((r) => setTimeout(r, 800));

      setPlan(result);
      setDraftRecipes(new Map());
      localStorage.setItem("currentPlanId", String(result.id));
      localStorage.setItem("lastPlanId", String(result.id));
      localStorage.setItem("lastMealPlanId", String(result.id));
      navigate("/my-plan");
    } catch (err: any) {
      if (isAbortError(err)) return;
      setError(err.message || "Failed to lock plan");
    } finally {
      lockTimersRef.current.forEach(clearTimeout);
      lockTimersRef.current = [];
      setLoading(false);
      setLockProgress(null);
      abortControllerRef.current = null;
    }
  };

  const handleEditWeek = async () => {
    if (!plan) return;
    const allFetchedRecipes = await getRecipes();
    const entries: Array<[DayOfWeek, Recipe]> = [];
    for (const item of plan.items) {
      if (item.meal_type === "main" && item.recipe_id) {
        const recipe = allFetchedRecipes.find((r) => r.id === item.recipe_id);
        if (recipe) entries.push([item.day, recipe]);
      }
    }
    // entries may have multiple [day, recipe] pairs for the same day — that's fine,
    // the navigation state restore groups them into arrays
    navigate("/plan", { state: { draftRecipes: entries } });
  };

  const handleStartFresh = () => {
    localStorage.removeItem("currentPlanId");
    localStorage.removeItem("lastPlanId");
    localStorage.removeItem("lastMealPlanId");
    setPlan(null);
    setDraftRecipes(new Map());
    setError(null);
    if (isMyPlan) {
      navigate("/plan", { replace: true });
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

  const handleMainModalSelect = async (newRecipeId: number) => {
    if (!mainModal || !plan) return;
    try {
      if (mainModal.mode === "swap" && mainModal.mealItemId) {
        const updatedPlan = await swapMainRecipe(mainModal.mealItemId, newRecipeId);
        setPlan(updatedPlan);
      } else {
        await addMealToDay(plan.id, mainModal.day, newRecipeId, "main");
        await refreshPlan();
      }
      setMainModal(null);
      setMainModalSearchQuery("");
    } catch (error) {
      console.error("Error updating main:", error);
      alert("Failed to update main");
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
    <div className="max-w-2xl mx-auto space-y-6 md:space-y-8 py-2 md:py-4">
      {/* Conversational Planner (hidden when plan is loaded) */}
      {!plan && !loading && !setupProgress && (
        <ConversationalPlanner
          onSmartSetup={handleSmartSetup}
          loading={setupProgress !== null}
          onPickFromRecipes={() => setShowBuildFromRecipes(true)}
          onQuickDinner={() => setQuickDinnerOpen(true)}
        />
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
          <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
            {DAYS.map(({ label }) => (
              <div
                key={label}
                className="bg-white border border-gray-200 rounded-xl p-4 text-center min-h-[80px] md:min-h-[140px] flex flex-col items-center justify-center animate-pulse"
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
            {lockProgress || "Roasting up your personalized meal plan..."}
          </p>
          {lockProgress && (
            <div className="flex justify-center">
              <Button
                variant="ghost"
                onClick={() => {
                  if (abortControllerRef.current) {
                    abortControllerRef.current.abort();
                    abortControllerRef.current = null;
                  }
                  lockTimersRef.current.forEach(clearTimeout);
                  lockTimersRef.current = [];
                  setLoading(false);
                  setLockProgress(null);
                  showToast("Plan creation cancelled");
                }}
              >
                Cancel
              </Button>
            </div>
          )}
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
              <Button
                variant="link"
                className="h-auto p-0 text-sm text-orange-500 hover:text-orange-600"
                onClick={() => setShowBuildFromRecipes(true)}
              >
                + Add Recipes
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
            {DAYS.map(({ key, label }) => {
              const recipes = draftRecipes.get(key as DayOfWeek);
              return recipes && recipes.length > 0 ? (
                <Card
                  key={key}
                  className="bg-orange-50 border-orange-300 p-3 text-center min-h-[80px] md:min-h-[120px] flex flex-col items-center justify-center relative"
                >
                  <span className="text-xs font-semibold text-orange-600 uppercase">
                    {label}
                  </span>
                  {recipes.map((recipe, idx) => (
                    <div
                      key={recipe.id}
                      className={cn(
                        "w-full rounded px-1 py-0.5 relative group",
                        recipe.source_url && "cursor-pointer hover:bg-orange-100/50"
                      )}
                      onClick={() => {
                        if (recipe.source_url) {
                          window.open(recipe.source_url, "_blank", "noopener,noreferrer");
                        }
                      }}
                    >
                      <span className="text-xs text-gray-700 line-clamp-2 leading-tight font-medium">
                        {recipe.title}
                      </span>
                      {recipe.cuisine && (
                        <span className="text-[10px] text-orange-500">
                          {recipe.cuisine.replace("_", " ")}
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const next = new Map(draftRecipes);
                          const arr = [...(next.get(key as DayOfWeek) || [])];
                          arr.splice(idx, 1);
                          if (arr.length === 0) {
                            next.delete(key as DayOfWeek);
                          } else {
                            next.set(key as DayOfWeek, arr);
                          }
                          setDraftRecipes(next);
                        }}
                        className="absolute top-0 right-0 text-gray-400 hover:text-red-500 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </Card>
              ) : (
                <button
                  key={key}
                  onClick={() => setShowBuildFromRecipes(true)}
                  className="bg-white border border-dashed border-gray-300 rounded-xl p-4 text-center min-h-[80px] md:min-h-[120px] flex flex-col items-center justify-center hover:border-orange-400 hover:bg-orange-50/30 transition-colors"
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
              <Button
                onClick={handleLockPlan}
                className="w-full md:w-auto px-6 py-3 md:py-2.5"
              >
                Adjust Plan & Build Grocery List
              </Button>
              <p className="text-xs text-gray-400">
                {Array.from(draftRecipes.values()).reduce((sum, arr) => sum + arr.length, 0)} recipe{Array.from(draftRecipes.values()).reduce((sum, arr) => sum + arr.length, 0) !== 1 ? "s" : ""} assigned — remaining days will be auto-filled
              </p>
              <Button
                variant="ghost"
                onClick={handleStartFresh}
                className="text-xs text-gray-400 hover:text-red-500 mt-1 h-auto p-0"
              >
                Start over
              </Button>
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
          <div className="flex flex-col md:flex-row md:items-center gap-2 md:justify-between">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900">Meal Plan</h2>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleStartFresh}
                className="text-gray-400 hover:text-red-500"
              >
                Start over
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleEditWeek}
              >
                Edit Week
              </Button>
              <Button
                variant="link"
                size="sm"
                onClick={() => navigate("/grocery")}
                className="text-orange-500 hover:text-orange-600"
              >
                Grocery List →
              </Button>
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
                  lovedItemIds={lovedIds}
                  onRemoveSide={handleRemoveSide}
                  onDeleteMain={async (mealItemId) => {
                    if (!confirm("Remove this meal?")) return;
                    try { await removeMealItem(mealItemId); await refreshPlan(); }
                    catch (err) { console.error("Failed to remove meal:", err); }
                  }}
                  onSwapMain={(mealItemId) => {
                    setMainModal({ mode: "swap", mealItemId, day: key as DayOfWeek, step: "choose" });
                    setMainModalSearchQuery("");
                  }}
                  onAddMain={(day) => {
                    setMainModal({ mode: "add", day: day as DayOfWeek, step: "choose" });
                    setMainModalSearchQuery("");
                  }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Smart Setup Progress Modal */}
      {setupProgress && <SmartSetupProgressModal progress={setupProgress} onCancel={handleCancelSetup} />}

      {/* DB Match Confirmation Modal */}
      {pendingConfirmations.length > 0 && currentConfirmIndex < pendingConfirmations.length && (
        <DbMatchConfirmModal
          key={currentConfirmIndex}
          confirmation={pendingConfirmations[currentConfirmIndex]}
          stepLabel={
            pendingConfirmations.length > 1
              ? `${currentConfirmIndex + 1} of ${pendingConfirmations.length}`
              : undefined
          }
          onSelectRecipe={handleConfirmUse}
          onSearchWeb={handleConfirmSearchWeb}
        />
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
          prefetchedResults={batchedSearchResults[pendingSearchMeals[currentSearchIndex].description]}
          onRecipeSelected={handleRecipeSelected}
          onClose={handleSearchSkip}
        />
      )}

      {/* Quick Dinner wizard modal */}
      {quickDinnerOpen && (
        <QuickDinnerModal
          familyId={family?.id}
          onRecipesSelected={(recipes) => {
            setQuickDinnerOpen(false);
            const today = getTodayDay();
            const next = new Map(draftRecipes);
            const existing = next.get(today) || [];
            existing.push(...recipes);
            next.set(today, existing);
            setDraftRecipes(next);
          }}
          onClose={() => setQuickDinnerOpen(false)}
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

      {mainModal && plan && mainModal.step === "choose" && (
        <Dialog open={true} onOpenChange={(open) => { if (!open) setMainModal(null); }}>
          <DialogContent fullScreenMobile={false}>
            <DialogHeader>
              <DialogTitle>
                {mainModal.mode === "swap" ? "Swap" : "Add"} a Main on {mainModal.day.charAt(0).toUpperCase() + mainModal.day.slice(1)}
              </DialogTitle>
            </DialogHeader>
            <div className="px-6 pb-6 space-y-3">
              <button
                onClick={() => {
                  const params = new URLSearchParams({ [mainModal.mode === "swap" ? "swapDay" : "addToDay"]: mainModal.day, planId: String(plan.id) });
                  if (mainModal.mealItemId) params.set("mealItemId", String(mainModal.mealItemId));
                  navigate(`/recipes?${params}`);
                  setMainModal(null);
                }}
                className="w-full border border-gray-200 rounded-lg p-4 hover:border-orange-500 hover:bg-orange-50 transition-colors text-left"
              >
                <div className="font-medium text-gray-900">Pick from My Recipes</div>
                <p className="text-sm text-gray-500 mt-1">Choose from your saved recipe collection</p>
              </button>
              <button
                onClick={() => setMainModal({ ...mainModal, step: "web-search" })}
                className="w-full border border-gray-200 rounded-lg p-4 hover:border-orange-500 hover:bg-orange-50 transition-colors text-left"
              >
                <div className="font-medium text-gray-900">Search the Web</div>
                <p className="text-sm text-gray-500 mt-1">Find a new recipe online</p>
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {mainModal && plan && mainModal.step === "web-search" && !mainModalSearchQuery && (
        <Dialog open={true} onOpenChange={(open) => { if (!open) setMainModal(null); }}>
          <DialogContent fullScreenMobile={false}>
            <DialogHeader>
              <DialogTitle>Search for a Recipe</DialogTitle>
            </DialogHeader>
            <form
              className="px-6 pb-6 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const input = (e.target as HTMLFormElement).elements.namedItem("q") as HTMLInputElement;
                if (input.value.trim()) setMainModalSearchQuery(input.value.trim());
              }}
            >
              <label className="text-sm font-medium text-gray-700">What are you looking for?</label>
              <Input
                name="q"
                autoFocus
                placeholder='e.g. "Bobby Flay burger"'
              />
              <Button type="submit" className="w-full">
                Search
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {mainModal && plan && mainModal.step === "web-search" && mainModalSearchQuery && (
        <RecipeSearchModal
          initialQuery={mainModalSearchQuery}
          dayLabel={mainModal.day}
          onRecipeSelected={async (recipe) => {
            await handleMainModalSelect(recipe.id);
          }}
          onClose={() => { setMainModal(null); setMainModalSearchQuery(""); }}
        />
      )}

      {showBuildFromRecipes && family && (
        <BuildFromRecipesModal
          familyId={family.id}
          onSelect={handleRecipesSelected}
          onClose={() => setShowBuildFromRecipes(false)}
        />
      )}

      {/* Toast notification */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
