import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import {
  generateMealPlanV3,
  lockMealPlan,
  lockPlan,
  unlockPlan,
  startFreshPlan,
  getActivePlan,
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
  aiMatchRecipe,
  isAbortError,
} from "../api";
import { formatApiError } from "../utils/errorFormatter";
import RecipeSearchModal from "../components/RecipeSearchModal";
import QuickDinnerModal from "../components/QuickDinnerModal";
import SmartSetupProgressModal from "../components/SmartSetupProgressModal";
import type { SmartSetupProgress } from "../components/SmartSetupProgressModal";
import SwapSideModal from "../components/SwapSideModal";
import AddSideModal from "../components/AddSideModal";
import BuildFromRecipesModal from "../components/BuildFromRecipesModal";
import DbMatchConfirmModal from "../components/DbMatchConfirmModal";
import type { PendingConfirmation } from "../components/DbMatchConfirmModal";
import MealDetailSheet, { CUISINE_COLORS } from "../components/MealDetailSheet";
import type {
  DayOfWeek,
  Recipe,
  Family,
  MealPlan,
  MealPlanItemV3,
  FamilyMemberV3,
} from "@shared/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const DAYS: { key: DayOfWeek; label: string; fullLabel: string }[] = [
  { key: "monday", label: "Mon", fullLabel: "Monday" },
  { key: "tuesday", label: "Tue", fullLabel: "Tuesday" },
  { key: "wednesday", label: "Wed", fullLabel: "Wednesday" },
  { key: "thursday", label: "Thu", fullLabel: "Thursday" },
  { key: "friday", label: "Fri", fullLabel: "Friday" },
  { key: "saturday", label: "Sat", fullLabel: "Saturday" },
  { key: "sunday", label: "Sun", fullLabel: "Sunday" },
];

function getTodayDay(): DayOfWeek {
  const days: DayOfWeek[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return days[new Date().getDay()];
}

// Browser Speech Recognition types
interface SpeechRecognitionEvent {
  results: { [index: number]: { [index: number]: { transcript: string } }; length: number };
  resultIndex: number;
}

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

// DisplayMeal type for unified rendering
interface DisplayMeal {
  id: string;
  day: DayOfWeek;
  dayLabel: string;
  recipeName: string;
  cuisine: string | null;
  cookMinutes: number | null;
  sidesCount: number;
  sourceUrl: string | null;
  imageUrl: string | null;
  isLocked: boolean;
  item?: MealPlanItemV3;
  sides?: MealPlanItemV3[];
}

// Light-theme cuisine colors for plan cards
const LIGHT_CUISINE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  italian:        { bg: "#FEF2F2", text: "#DC2626", border: "#FECACA" },
  american:       { bg: "#EFF6FF", text: "#2563EB", border: "#BFDBFE" },
  french:         { bg: "#F5F3FF", text: "#7C3AED", border: "#DDD6FE" },
  mediterranean:  { bg: "#ECFDF5", text: "#059669", border: "#A7F3D0" },
  middle_eastern: { bg: "#FFF7ED", text: "#EA580C", border: "#FED7AA" },
  thai:           { bg: "#FFFBEB", text: "#D97706", border: "#FDE68A" },
  mexican:        { bg: "#FFF7ED", text: "#EA580C", border: "#FED7AA" },
  indian:         { bg: "#FFFBEB", text: "#D97706", border: "#FDE68A" },
  chinese:        { bg: "#FFF1F2", text: "#E11D48", border: "#FECDD3" },
  japanese:       { bg: "#FDF2F8", text: "#DB2777", border: "#FBCFE8" },
  korean:         { bg: "#F5F3FF", text: "#7C3AED", border: "#DDD6FE" },
  ethiopian:      { bg: "#ECFDF5", text: "#059669", border: "#A7F3D0" },
};

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

  // Modal states
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
  const [draftAddModal, setDraftAddModal] = useState<{
    step: 'choose-source' | 'pick-day' | 'web-search-query' | 'web-search';
    day?: DayOfWeek;
    searchQuery?: string;
  } | null>(null);
  const [draftAddSearchQuery, setDraftAddSearchQuery] = useState("");
  // Draft state removed — all items are now persisted in DB via plan.items
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
  const shouldAutoGenerate = useRef(false);

  // DB match confirmation state
  const [pendingConfirmations, setPendingConfirmations] = useState<PendingConfirmation[]>([]);
  const [currentConfirmIndex, setCurrentConfirmIndex] = useState(0);
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

  // New state for redesign
  const [selectedMeal, setSelectedMeal] = useState<{
    item?: MealPlanItemV3;
  } | null>(null);
  const [lockState, setLockState] = useState<'idle' | 'locking' | 'locked' | 'grocery-ready'>('idle');
  const [sideInputDay, setSideInputDay] = useState<string | null>(null);
  const [sideText, setSideText] = useState("");
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  // Speech recognition
  const toggleListening = useCallback(() => {
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }

    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setText((prev) => {
        const separator = prev.trim() ? " " : "";
        return prev + separator + transcript.trim();
      });
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      setListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [listening]);

  // Load family/members on mount; always load active plan from server
  useEffect(() => {
    const loadData = async () => {
      try {
        const families = await getFamilies();
        if (families.length > 0) {
          setFamily(families[0]);
          const membersData = await getFamilyMembers(families[0].id);
          setMembers(membersData);

          // Load active plan from server
          let loadedPlan = false;
          const paramId = searchParams.get("id");
          if (paramId) {
            setLoading(true);
            try {
              const result = await getMealPlan(Number(paramId));
              setPlan(result);
              if (result.status === 'locked') setLockState('idle');
              setSearchParams({}, { replace: true });
              loadedPlan = true;
            } catch {
              // fall through to getActivePlan
            }
            setLoading(false);
          }

          if (!loadedPlan) {
            setLoading(true);
            try {
              const weekStart = getWeekStart();
              const activePlan = await getActivePlan(families[0].id, weekStart);
              setPlan(activePlan);
              if (activePlan.status === 'locked') setLockState('idle');
            } catch (err) {
              console.error("Failed to load active plan:", err);
            }
            setLoading(false);
          }
        }
      } catch (err) {
        console.error("Failed to load family data:", err);
      }
    };
    loadData();

    // Handle draft recipes passed via navigation state (from BuildFromRecipes etc.)
    if (!isMyPlan) {
      const state = location.state as { draftRecipes?: Array<[DayOfWeek, Recipe]> } | null;
      if (state?.draftRecipes) {
        // Add these to the active plan via API
        (async () => {
          if (!plan) return;
          for (const [day, recipe] of state.draftRecipes!) {
            await addMealToDay(plan.id, day, recipe.id, "main");
          }
          await refreshPlan();
        })();
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
    pendingWebSearchRef.current = [];
    shouldAutoGenerate.current = false;
    showToast("Search cancelled");
  };

  const handleSmartSetup = async (inputText: string) => {
    console.log("[Plan] handleSmartSetup called", { text: inputText });
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

      // Ensure we have an active plan
      if (!plan) {
        const activePlan = await getActivePlan(familyId, weekStart);
        setPlan(activePlan);
      }
      const result = await smartSetup(familyId, inputText, signal);
      console.log("[Plan] smartSetup result", result);

      const days: DayOfWeek[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
      const schedule = days.map((day) => ({
        family_id: familyId,
        week_start: weekStart,
        day,
        is_cooking: result.cooking_days[day]?.is_cooking ?? false,
        meal_mode: (result.cooking_days[day]?.meal_mode || "one_main") as "one_main" | "customize_mains",
      }));
      setCookingSchedule(schedule);

      if (result.specific_meals && result.specific_meals.length > 0) {
        setSetupProgress({ phase: "matching", message: "Whisking through your recipe collection...", searchQueries: [] });

        const fetchedRecipes = await getRecipes();
        setAllRecipes(fetchedRecipes);
        console.log("[Plan] loaded recipes for matching", { count: fetchedRecipes.length, specificMeals: result.specific_meals });

        const unmatched: Array<{ day: string; description: string }> = [];
        const autoResolved: Array<{ day: string; recipe_id: number }> = [];
        const needsConfirmation: PendingConfirmation[] = [];

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
            console.log("[Plan] no DB match, trying AI match", { description: meal.description, day: meal.day });
            try {
              setSetupProgress({ phase: "matching", message: "Thinking about your family's preferences...", searchQueries: [] });
              const aiResult = await aiMatchRecipe(meal.description, familyId, signal);
              if (aiResult.matches.length > 0) {
                console.log("[Plan] AI matches found", { description: meal.description, count: aiResult.matches.length, top: aiResult.matches[0].recipe.title, topScore: aiResult.matches[0].score });
                needsConfirmation.push({ day: meal.day, description: meal.description, matches: aiResult.matches });
                for (const m of aiResult.matches) {
                  if (!fetchedRecipes.some((r) => r.id === m.recipe.id)) {
                    fetchedRecipes.push(m.recipe);
                  }
                }
                setAllRecipes([...fetchedRecipes]);
              } else {
                console.log("[Plan] no AI match, will search web", { description: meal.description, day: meal.day });
                unmatched.push(meal);
              }
            } catch (aiErr) {
              console.warn("[Plan] AI match failed, falling to web search", aiErr);
              unmatched.push(meal);
            }
          }
        }

        setResolvedSpecificMeals(autoResolved);
        shouldAutoGenerate.current = true;
        pendingWebSearchRef.current = unmatched;

        if (needsConfirmation.length > 0) {
          setSetupProgress(null);
          setPendingConfirmations(needsConfirmation);
          setCurrentConfirmIndex(0);
          return;
        }

        await proceedToWebSearch(unmatched, autoResolved, fetchedRecipes, signal, familyId);
      } else {
        setSetupProgress({ phase: "done", message: "Kitchen's ready! Time to pick your meals", searchQueries: [] });
        await new Promise((r) => setTimeout(r, 1200));
        setSetupProgress(null);
        return;
      }
    } catch (err: any) {
      if (isAbortError(err)) return;
      console.error("[Plan] handleSmartSetup error", err);
      setError(formatApiError(err));
    } finally {
      setSetupProgress(null);
    }
  };

  const proceedToWebSearch = async (
    unmatched: Array<{ day: string; description: string }>,
    resolved: Array<{ day: string; recipe_id: number }>,
    fetchedRecipes: Recipe[],
    _signal?: AbortSignal,
    _familyId?: number,
  ) => {
    if (unmatched.length > 0) {
      // Open RecipeSearchModal directly — it handles the 3-tier progressive search
      setSetupProgress(null);
      setPendingSearchMeals(unmatched);
      setCurrentSearchIndex(0);
    } else {
      // Add resolved meals to the plan via API
      if (plan) {
        for (const lock of resolved) {
          await addMealToDay(plan.id, lock.day, lock.recipe_id, "main");
        }
        await refreshPlan();
      }
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
      setPendingConfirmations([]);
      setCurrentConfirmIndex(0);
      proceedToWebSearch(pendingWebSearchRef.current, updatedResolved, allRecipes, undefined, family?.id);
    }
  };

  const handleConfirmSearchWeb = () => {
    const confirmation = pendingConfirmations[currentConfirmIndex];
    console.log("[Plan] user rejected DB match, will web search", { day: confirmation.day, description: confirmation.description });
    pendingWebSearchRef.current = [
      ...pendingWebSearchRef.current,
      { day: confirmation.day, description: confirmation.description },
    ];

    if (currentConfirmIndex < pendingConfirmations.length - 1) {
      setCurrentConfirmIndex((prev) => prev + 1);
    } else {
      setPendingConfirmations([]);
      setCurrentConfirmIndex(0);
      proceedToWebSearch(pendingWebSearchRef.current, resolvedSpecificMeals, allRecipes, undefined, family?.id);
    }
  };

  const finishSearchFlow = useCallback(
    async (finalResolved: Array<{ day: string; recipe_id: number }>, recipes: Recipe[]) => {
      console.log("[Plan] finishSearchFlow", { finalResolved, recipesCount: recipes.length });
      setPendingSearchMeals([]);
      setCurrentSearchIndex(0);

      // Add resolved meals to the plan via API
      if (plan) {
        for (const lock of finalResolved) {
          await addMealToDay(plan.id, lock.day, lock.recipe_id, "main");
        }
        await refreshPlan();
      }
      shouldAutoGenerate.current = false;
    },
    [cookingSchedule, plan],
  );

  const handleRecipeSelected = async (recipe: Recipe) => {
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
      await finishSearchFlow(updatedLocks, updatedRecipes);
    }
  };

  const handleSearchSkip = async () => {
    console.log("[Plan] handleSearchSkip", { currentSearchIndex, total: pendingSearchMeals.length });
    if (currentSearchIndex < pendingSearchMeals.length - 1) {
      setCurrentSearchIndex((prev) => prev + 1);
    } else {
      await finishSearchFlow(resolvedSpecificMeals, allRecipes);
    }
  };

  const handleRecipesSelected = async (assignments: Map<DayOfWeek, Recipe[]>) => {
    setShowBuildFromRecipes(false);
    if (!plan) return;
    for (const [day, recipes] of assignments) {
      for (const recipe of recipes) {
        await addMealToDay(plan.id, day, recipe.id, "main");
      }
    }
    await refreshPlan();
  };

  const handleLockPlan = async () => {
    if (!plan) return;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setLockState('locking');
    setLockProgress("Locking in your meal plan...");
    setError(null);
    try {
      const progressTimer1 = setTimeout(() => setLockProgress("Gathering ingredients..."), 3000);
      const progressTimer2 = setTimeout(() => setLockProgress("Almost done..."), 8000);
      lockTimersRef.current = [progressTimer1, progressTimer2];

      const result = await lockPlan(plan.id, controller.signal);

      lockTimersRef.current.forEach(clearTimeout);
      lockTimersRef.current = [];

      setPlan(result);

      setLockState('locked');
      setTimeout(() => setLockState('grocery-ready'), 6000);
    } catch (err: any) {
      if (isAbortError(err)) return;
      setError(formatApiError(err));
      setLockState('idle');
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
    try {
      const result = await unlockPlan(plan.id);
      setPlan(result);
      setLockState('idle');
    } catch (err: any) {
      console.error("Failed to unlock plan:", err);
      setError(formatApiError(err));
    }
  };

  const handleStartFresh = async () => {
    if (!plan) return;
    if (!confirm("This will remove all meals and their ingredients from your grocery list. Your custom items will stay. Are you sure?")) return;
    try {
      const result = await startFreshPlan(plan.id);
      setPlan(result);
      setError(null);
      setLockState('idle');
      if (isMyPlan) {
        navigate("/plan", { replace: true });
      }
    } catch (err: any) {
      console.error("Failed to start fresh:", err);
      setError(formatApiError(err));
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

  const getSideNames = (meal: DisplayMeal): string[] => {
    if (meal.sides) {
      return meal.sides.map((s) => {
        return s.recipe_name
          || (s.notes && typeof s.notes === "object" && ((s.notes as any).side_name || (s.notes as any).name))
          || "Side";
      });
    }
    return [];
  };

  const handleRemoveMeal = async (meal: DisplayMeal) => {
    if (meal.item) {
      if (!confirm("Remove this meal?")) return;
      try {
        await removeMealItem(meal.item.id);
        await refreshPlan();
      } catch (err) {
        console.error("Failed to remove meal:", err);
      }
    }
  };

  const handleAddInlineSide = async (meal: DisplayMeal, text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !meal.item) return;
    try {
      await addSide(meal.item.id, undefined, trimmed);
      await refreshPlan();
    } catch (err) {
      console.error("Failed to add inline side:", err);
    }
    setSideText("");
    setSideInputDay(null);
  };

  const handleRemoveInlineSide = async (meal: DisplayMeal, sideIndex: number) => {
    if (meal.sides && meal.sides[sideIndex]) {
      try {
        await removeSide(meal.sides[sideIndex].id);
        await refreshPlan();
      } catch (err) {
        console.error("Failed to remove side:", err);
      }
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

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    handleSmartSetup(trimmed);
  };

  // Build displayMeals array — all items come from plan.items
  const displayMeals: DisplayMeal[] = [];

  if (plan && plan.items) {
    const mains = plan.items.filter((i) => i.meal_type === "main");
    const allSides = plan.items.filter((i) => i.meal_type === "side");
    for (const main of mains) {
      const mainSides = allSides.filter(
        (side) =>
          side.parent_meal_item_id === main.id ||
          (side.parent_meal_item_id === null && (
            side.main_number === main.main_number ||
            (side.main_number === null && main.main_number === null)
          ) && side.day === main.day)
      );
      const dayInfo = DAYS.find((d) => d.key === main.day);
      displayMeals.push({
        id: `item-${main.id}`,
        day: main.day,
        dayLabel: dayInfo?.fullLabel ?? main.day,
        recipeName: main.recipe_name || main.recipe?.title || "Unknown Recipe",
        cuisine: main.recipe?.cuisine ?? null,
        cookMinutes: main.recipe?.cook_minutes ?? null,
        sidesCount: mainSides.length,
        sourceUrl: main.recipe?.source_url ?? null,
        imageUrl: main.recipe?.image_url ?? null,
        isLocked: !!main.locked,
        item: main,
        sides: mainSides,
      });
    }
  }

  // Sort by day order
  const dayOrder: Record<string, number> = { monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6 };
  displayMeals.sort((a, b) => (dayOrder[a.day] ?? 0) - (dayOrder[b.day] ?? 0));

  const totalMeals = displayMeals.length;

  const daySlots = DAYS.map((d) => ({
    day: d.key,
    dayLabel: d.label,
    fullLabel: d.fullLabel,
    meals: displayMeals.filter((m) => m.day === d.key),
  }));

  const totalSides = displayMeals.reduce((sum, m) => {
    const names = getSideNames(m);
    return sum + names.length;
  }, 0);
  const cookingNights = daySlots.filter((d) => d.meals.length > 0).length;
  const avgCookMinutes = totalMeals > 0
    ? Math.round(displayMeals.reduce((sum, m) => sum + (m.cookMinutes || 0), 0) / totalMeals)
    : 0;

  const hasPlan = plan !== null;
  const isLocked = plan?.status === 'locked';
  const hasMeals = displayMeals.length > 0;
  const showInput = !loading && !setupProgress && lockState !== 'locking' && lockState !== 'locked';
  const showEmptyState = !hasMeals && !loading && !setupProgress;

  // Week date range for display
  const getWeekDateRange = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${fmt(monday)} - ${fmt(sunday)}`;
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-5 md:py-8 font-body">

      {/* 1. INPUT SECTION */}
      {showInput && (
        <div className="text-center mb-8 animate-fade-in">
          <h1 className="font-display text-2xl md:text-3xl font-bold text-stone-800 mb-2">
            {hasMeals ? "Looking good, Chef" : "What's Cooking, Chef?"}
          </h1>
          <p className="text-stone-400 text-sm mb-5">
            {isLocked
              ? "Your plan is here. Add sides, make changes, or start fresh."
              : hasMeals
                ? "Add meals, sides, then lock your plan."
                : "Tell me about your week and I'll plan your meals"}
          </p>

          {!isLocked && !hasMeals && (
            <>
              <div className="relative max-w-xl mx-auto">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={`e.g. "We're cooking Monday through Thursday, eating out Friday. My daughter needs lunch on Tuesday. Saturday we want something special — maybe Italian. Keep it quick on weeknights, 30 min max."`}
                  className="w-full h-28 md:h-32 bg-chef-cream border border-stone-200 rounded-xl px-4 py-3 pr-12 text-sm text-stone-700 resize-none focus:outline-none focus:ring-2 focus:ring-chef-orange/40 focus:border-chef-orange transition-colors placeholder:text-stone-400"
                />
                {/* Mic button inside textarea */}
                <button
                  onClick={toggleListening}
                  className={cn(
                    "absolute bottom-3 right-3 p-2 rounded-lg transition-colors",
                    listening
                      ? "bg-red-50 text-red-500"
                      : "text-stone-400 hover:text-chef-orange hover:bg-orange-50"
                  )}
                  title={listening ? "Stop listening" : "Voice input"}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className={cn("w-5 h-5", listening && "animate-pulse")}
                  >
                    <path d="M12 1a4 4 0 0 0-4 4v7a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2H3v2a9 9 0 0 0 8 8.94V23h2v-2.06A9 9 0 0 0 21 12v-2h-2Z" />
                  </svg>
                </button>
              </div>
              {listening && (
                <p className="text-sm text-red-500 font-medium mt-2">Listening...</p>
              )}
              <div className="flex items-center justify-center gap-3 mt-4">
                <button
                  onClick={handleSubmit}
                  disabled={!text.trim()}
                  className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: "linear-gradient(135deg, #EA580C, #C2410C)" }}
                >
                  Plan My Week
                </button>
                <button
                  onClick={() => setQuickDinnerOpen(true)}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium border border-stone-300 text-stone-600 hover:border-chef-orange hover:text-chef-orange transition-colors"
                >
                  Tonight
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* 2. PLANNING ANIMATION */}
      {setupProgress && <SmartSetupProgressModal progress={setupProgress} onCancel={handleCancelSetup} />}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm mb-6">
          {error}
        </div>
      )}

      {/* 3. EMPTY STATE */}
      {showEmptyState && (
        <div className="relative bg-chef-cream border border-stone-200 rounded-2xl p-8 md:p-12 text-center animate-slide-up overflow-hidden">
          {/* Decorative corner borders */}
          <div className="absolute top-3 left-3 w-8 h-8 border-t-2 border-l-2 border-chef-gold/30 rounded-tl-lg" />
          <div className="absolute top-3 right-3 w-8 h-8 border-t-2 border-r-2 border-chef-gold/30 rounded-tr-lg" />
          <div className="absolute bottom-3 left-3 w-8 h-8 border-b-2 border-l-2 border-chef-gold/30 rounded-bl-lg" />
          <div className="absolute bottom-3 right-3 w-8 h-8 border-b-2 border-r-2 border-chef-gold/30 rounded-br-lg" />

          {/* Subtle food watermarks */}
          <div className="absolute inset-0 flex items-center justify-center opacity-[0.04] text-6xl select-none pointer-events-none">
            <span className="absolute top-6 left-8">&#127858;</span>
            <span className="absolute top-10 right-12">&#127837;</span>
            <span className="absolute bottom-8 left-16">&#129367;</span>
            <span className="absolute bottom-6 right-10">&#127834;</span>
          </div>

          <div className="relative z-10">
            {/* Plate icon */}
            <div className="mx-auto w-16 h-16 rounded-full bg-white border border-stone-200 flex items-center justify-center mb-4 shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-chef-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3C7.03 3 3 7.03 3 12s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9zm0 14a5 5 0 110-10 5 5 0 010 10z" />
              </svg>
            </div>
            <h2 className="font-display text-xl md:text-2xl font-bold text-stone-800 mb-2">
              Your table is set
            </h2>
            <p className="text-stone-400 text-sm max-w-xs mx-auto mb-4">
              Describe your week above, or{" "}
              <button
                onClick={() => setShowBuildFromRecipes(true)}
                className="text-chef-orange hover:underline font-medium"
              >
                pick from your recipes
              </button>
            </p>
          </div>
        </div>
      )}

      {/* 4. PLAN CONTAINER */}
      {hasMeals && (
        <div
          className="relative rounded-3xl overflow-hidden animate-fade-in"
          style={{ background: "#FAF7F4", border: "1px solid #EDE5DB" }}
        >
          {/* Decorative corner accents */}
          <div className="absolute top-3 left-3 w-8 h-8 border-t-2 border-l-2 border-chef-gold/20 rounded-tl-lg" />
          <div className="absolute top-3 right-3 w-8 h-8 border-t-2 border-r-2 border-chef-gold/20 rounded-tr-lg" />
          <div className="absolute bottom-3 left-3 w-8 h-8 border-b-2 border-l-2 border-chef-gold/20 rounded-bl-lg" />
          <div className="absolute bottom-3 right-3 w-8 h-8 border-b-2 border-r-2 border-chef-gold/20 rounded-br-lg" />

          {/* Header */}
          <div className="relative z-10 px-5 pt-5 pb-3">
            <h2 className="font-display text-lg md:text-xl font-bold text-stone-900">
              {isLocked ? "This Week's Menu" : "Your Plan"}
            </h2>
            <div className="flex items-center justify-between mt-0.5">
              <p className="text-stone-500 text-xs">
                {plan?.week_start ? `Week of ${plan.week_start}` : getWeekDateRange()} &middot; {totalMeals} meal{totalMeals !== 1 ? "s" : ""}{totalSides > 0 ? ` \u00b7 ${totalSides} side${totalSides !== 1 ? "s" : ""}` : ""}
              </p>
              <div className="flex items-center gap-2">
                {isLocked && (
                  <button
                    onClick={handleEditWeek}
                    className="text-xs text-stone-400 hover:text-stone-700 transition-colors"
                  >
                    Edit Week
                  </button>
                )}
                {!isLocked && (
                  <button
                    onClick={() => setDraftAddModal({ step: 'choose-source' })}
                    className="text-xs text-chef-orange hover:text-orange-600 font-medium transition-colors"
                  >
                    + Add Recipes
                  </button>
                )}
                <button
                  onClick={handleStartFresh}
                  className="px-3 py-1 text-xs font-medium border border-stone-300 rounded-lg text-stone-500 hover:text-red-500 hover:border-red-300 transition-colors"
                >
                  Start Fresh
                </button>
              </div>
            </div>
          </div>

          {/* Day slots */}
          <div className="relative z-10 px-4 pb-3 space-y-2">
            {daySlots.map((slot) => {
              if (slot.meals.length === 0) {
                /* Empty day — dashed border row */
                return (
                  <button
                    key={slot.day}
                    onClick={() => {
                      if (plan) {
                        setDraftAddModal({ step: 'web-search-query', day: slot.day });
                      }
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 border-dashed border-stone-200 hover:border-stone-300 hover:bg-white/50 transition-all text-left"
                  >
                    <span className="text-xs font-semibold uppercase tracking-wider text-stone-300">
                      {slot.fullLabel}
                    </span>
                    <span className="text-xs font-medium text-stone-400 hover:text-chef-orange transition-colors">
                      + Add a meal
                    </span>
                  </button>
                );
              }

              /* Populated day — render each meal */
              return slot.meals.map((meal) => {
                const cuisineColors = meal.cuisine ? LIGHT_CUISINE_COLORS[meal.cuisine] : null;
                const sideNames = getSideNames(meal);

                return (
                  <div key={meal.id}>
                    {/* Main card */}
                    <div className="rounded-xl bg-white border border-stone-100 overflow-hidden">
                      <div className="flex">
                        {/* LEFT — action buttons */}
                        <div className="w-[72px] flex-shrink-0 border-r border-stone-100 flex flex-col">
                          <button
                            onClick={() => {
                              if (meal.item) {
                                setMainModal({ mode: "swap", mealItemId: meal.item.id, day: meal.day, step: "choose" });
                                setMainModalSearchQuery("");
                              }
                            }}
                            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-stone-400 hover:text-chef-orange hover:bg-orange-50 transition-colors"
                            title="Swap recipe"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            <span className="text-[9px] font-medium leading-none">Swap</span>
                          </button>
                          <div className="border-t border-stone-100" />
                          <button
                            onClick={() => {
                              if (sideInputDay === meal.id) {
                                setSideInputDay(null);
                                setSideText("");
                              } else {
                                setSideInputDay(meal.id);
                                setSideText("");
                              }
                            }}
                            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                            title="Add side"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            <span className="text-[9px] font-medium leading-none">Sides</span>
                          </button>
                        </div>

                        {/* CENTER — clickable info */}
                        <button
                          className="flex-1 min-w-0 px-3 py-2.5 text-left hover:bg-stone-50 transition-colors"
                          onClick={() => {
                            if (meal.item) {
                              setSelectedMeal({ item: meal.item });
                            }
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-chef-orange">
                              {meal.dayLabel}
                            </span>
                            {meal.cuisine && (
                              <span
                                className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                                style={{
                                  backgroundColor: cuisineColors?.bg ?? "#EFF6FF",
                                  color: cuisineColors?.text ?? "#2563EB",
                                  border: `1px solid ${cuisineColors?.border ?? "#BFDBFE"}`,
                                }}
                              >
                                {meal.cuisine.replace("_", " ")}
                              </span>
                            )}
                            {meal.cookMinutes && (
                              <span className="text-[10px] text-stone-400">
                                {meal.cookMinutes}m
                              </span>
                            )}
                          </div>
                          <span className="block text-sm font-semibold text-stone-800 truncate leading-tight mt-0.5">
                            {meal.recipeName}
                          </span>
                        </button>

                        {/* RIGHT — remove button */}
                        <button
                          onClick={() => handleRemoveMeal(meal)}
                          className="w-10 flex-shrink-0 flex items-center justify-center text-stone-300 hover:text-red-500 hover:bg-red-50 transition-colors border-l border-stone-100"
                          title="Remove meal"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Side pills */}
                    {sideNames.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-1 ml-2 flex-wrap">
                        <span className="text-stone-300 text-xs select-none">{"\u2514"}</span>
                        {sideNames.map((name, sIdx) => (
                          <span
                            key={sIdx}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200"
                          >
                            {name}
                            <button
                              onClick={() => handleRemoveInlineSide(meal, sIdx)}
                              className="hover:text-red-500 transition-colors leading-none"
                              title="Remove side"
                            >
                              &times;
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Inline side input */}
                    {sideInputDay === meal.id && (
                      <form
                        className="flex items-center gap-2 mt-1 ml-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleAddInlineSide(meal, sideText);
                        }}
                      >
                        <span className="text-stone-300 text-xs select-none">{"\u2514"}</span>
                        <input
                          autoFocus
                          value={sideText}
                          onChange={(e) => setSideText(e.target.value)}
                          placeholder="e.g. garlic bread..."
                          className="flex-1 px-2.5 py-1 text-xs rounded-lg border border-emerald-200 bg-emerald-50/50 text-stone-700 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400"
                        />
                        <button
                          type="submit"
                          disabled={!sideText.trim()}
                          className="px-2.5 py-1 text-xs font-medium rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 transition-colors"
                        >
                          Add
                        </button>
                        <button
                          type="button"
                          onClick={() => { setSideInputDay(null); setSideText(""); }}
                          className="text-stone-400 hover:text-stone-600 transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </form>
                    )}
                  </div>
                );
              });
            })}
          </div>

          {/* Quick stats bar */}
          {totalMeals > 0 && (
            <div className="relative z-10 border-t border-stone-200/60 mx-5 py-2.5">
              <p className="text-xs text-stone-500 text-center">
                {cookingNights} cooking night{cookingNights !== 1 ? "s" : ""} &middot; {avgCookMinutes} min avg &middot; {totalSides} side{totalSides !== 1 ? "s" : ""}
              </p>
            </div>
          )}

          {/* LOCK / GROCERY CTA */}
          <div className="relative z-10 px-5 pb-5">
            {/* Unlocked: Lock Plan button */}
            {!isLocked && hasMeals && lockState === 'idle' && (
              <button
                onClick={handleLockPlan}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all"
                style={{ background: "linear-gradient(135deg, #059669, #047857)" }}
              >
                Lock Plan & Build Grocery List
              </button>
            )}

            {/* Locking */}
            {lockState === 'locking' && (
              <div className="flex items-center justify-center gap-2 py-3 text-chef-orange">
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm font-medium text-stone-700">Love this plan, Chef!</span>
              </div>
            )}

            {/* Locked — building grocery list */}
            {lockState === 'locked' && (
              <div className="flex items-center justify-center gap-2 py-3 text-chef-orange">
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm font-medium text-stone-700">Building your grocery list...</span>
              </div>
            )}

            {/* Grocery ready */}
            {lockState === 'grocery-ready' && (
              <button
                onClick={() => navigate("/grocery")}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white animate-chef-pulse transition-all"
                style={{ background: "linear-gradient(135deg, #EA580C, #C2410C)" }}
              >
                Your list is ready, Chef!
              </button>
            )}

            {/* Already locked plan — grocery link */}
            {isLocked && lockState === 'idle' && (
              <button
                onClick={() => navigate("/grocery")}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all"
                style={{ background: "linear-gradient(135deg, #EA580C, #C2410C)" }}
              >
                Generate Grocery List
              </button>
            )}
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && !lockState.match(/locking|locked/) && (
        <div className="space-y-3 animate-fade-in">
          <div className="flex items-center justify-center gap-2 py-8 text-stone-400">
            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm">{lockProgress || "Roasting up your personalized meal plan..."}</span>
          </div>
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

      {/* 5. ALL EXISTING MODALS */}

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
          familyId={family?.id}
          onRecipeSelected={handleRecipeSelected}
          onClose={handleSearchSkip}
        />
      )}

      {/* Quick Dinner wizard modal */}
      {quickDinnerOpen && (
        <QuickDinnerModal
          familyId={family?.id}
          onRecipesSelected={async (recipes) => {
            setQuickDinnerOpen(false);
            if (!plan) return;
            const today = getTodayDay();
            for (const recipe of recipes) {
              await addMealToDay(plan.id, today, recipe.id, "main");
            }
            await refreshPlan();
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
          familyId={family?.id}
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

      {/* Draft Add Recipes — Step 1: Choose Source */}
      {draftAddModal?.step === 'choose-source' && (
        <Dialog open={true} onOpenChange={(open) => { if (!open) setDraftAddModal(null); }}>
          <DialogContent fullScreenMobile={false}>
            <DialogHeader>
              <DialogTitle>Add Recipes</DialogTitle>
            </DialogHeader>
            <div className="px-6 pb-6 space-y-3">
              <button
                onClick={() => { setDraftAddModal(null); setShowBuildFromRecipes(true); }}
                className="w-full border border-gray-200 rounded-lg p-4 hover:border-orange-500 hover:bg-orange-50 transition-colors text-left"
              >
                <div className="font-medium text-gray-900">Browse My Recipes</div>
                <p className="text-sm text-gray-500 mt-1">Choose from your saved recipe collection</p>
              </button>
              <button
                onClick={() => setDraftAddModal({ step: 'pick-day' })}
                className="w-full border border-gray-200 rounded-lg p-4 hover:border-orange-500 hover:bg-orange-50 transition-colors text-left"
              >
                <div className="font-medium text-gray-900">Search for New Recipes</div>
                <p className="text-sm text-gray-500 mt-1">Find a new recipe online</p>
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Draft Add Recipes — Step 2: Pick Day */}
      {draftAddModal?.step === 'pick-day' && (
        <Dialog open={true} onOpenChange={(open) => { if (!open) setDraftAddModal(null); }}>
          <DialogContent fullScreenMobile={false}>
            <DialogHeader>
              <DialogTitle>Which day?</DialogTitle>
            </DialogHeader>
            <div className="px-6 pb-6">
              <div className="grid grid-cols-4 gap-2">
                {DAYS.map((d) => (
                  <button
                    key={d.key}
                    onClick={() => setDraftAddModal({ step: 'web-search-query', day: d.key })}
                    className="border border-gray-200 rounded-lg py-3 text-sm font-medium text-gray-700 hover:border-orange-500 hover:bg-orange-50 hover:text-orange-600 transition-colors"
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Draft Add Recipes — Step 3: Search Query */}
      {draftAddModal?.step === 'web-search-query' && (
        <Dialog open={true} onOpenChange={(open) => { if (!open) setDraftAddModal(null); }}>
          <DialogContent fullScreenMobile={false}>
            <DialogHeader>
              <DialogTitle>
                Search for a Recipe — {DAYS.find(d => d.key === draftAddModal.day)?.fullLabel}
              </DialogTitle>
            </DialogHeader>
            <form
              className="px-6 pb-6 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const val = draftAddSearchQuery.trim();
                if (val) {
                  setDraftAddModal({ ...draftAddModal, step: 'web-search', searchQuery: val });
                  setDraftAddSearchQuery("");
                }
              }}
            >
              <label className="text-sm font-medium text-gray-700">What are you looking for?</label>
              <Input
                name="q"
                autoFocus
                value={draftAddSearchQuery}
                onChange={(e) => setDraftAddSearchQuery(e.target.value)}
                placeholder='e.g. "Bobby Flay burger"'
              />
              <Button type="submit" className="w-full" disabled={!draftAddSearchQuery.trim()}>
                Search
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Draft Add Recipes — Step 4: RecipeSearchModal */}
      {draftAddModal?.step === 'web-search' && draftAddModal.searchQuery && (
        <RecipeSearchModal
          initialQuery={draftAddModal.searchQuery}
          dayLabel={DAYS.find(d => d.key === draftAddModal.day)?.fullLabel}
          familyId={family?.id}
          onRecipeSelected={async (recipe) => {
            const day = draftAddModal.day!;
            setDraftAddModal(null);
            if (!plan) return;
            await addMealToDay(plan.id, day, recipe.id, "main");
            await refreshPlan();
          }}
          onClose={() => setDraftAddModal(null)}
        />
      )}

      {/* 6. MealDetailSheet */}
      {selectedMeal && selectedMeal.item && (
        <MealDetailSheet
          item={selectedMeal.item}
          day={selectedMeal.item.day}
          isLocked={!!selectedMeal.item.locked}
          sides={displayMeals.find((m) => m.item?.id === selectedMeal.item?.id)?.sides}
          onClose={() => setSelectedMeal(null)}
          onSwapMain={() => {
            setSelectedMeal(null);
            setMainModal({ mode: "swap", mealItemId: selectedMeal.item!.id, day: selectedMeal.item!.day, step: "choose" });
            setMainModalSearchQuery("");
          }}
          onRemoveMain={async () => {
            if (!confirm("Remove this meal?")) return;
            try {
              await removeMealItem(selectedMeal.item!.id);
              await refreshPlan();
              setSelectedMeal(null);
            } catch (err) {
              console.error("Failed to remove meal:", err);
            }
          }}
          onSwapSide={(sideId) => {
            setSelectedMeal(null);
            setSwapSideModal({ mealItemId: sideId, mainRecipeId: selectedMeal.item!.recipe_id });
          }}
          onAddSide={() => {
            setSelectedMeal(null);
            setAddSideModal(selectedMeal.item!.id);
          }}
          onRemoveSide={(sideId) => handleRemoveSide(sideId)}
        />
      )}

      {/* 7. Toast notification */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-stone-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
