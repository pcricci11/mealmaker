// pages/ThisWeek.tsx
// Weekly meal planning preferences page

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  getFamilies,
  getFamilyMembers,
  getCookingSchedule,
  saveCookingSchedule,
  generateMealPlanV3,
  smartSetup,
  getRecipes,
  matchRecipeInDb,
} from "../api";
import type {
  Family,
  FamilyMemberV3,
  WeeklyCookingSchedule,
  DayOfWeek,
  Recipe,
} from "@shared/types";
import CookingScheduleSection from "../components/CookingScheduleSection";
import ConversationalPlanner from "../components/ConversationalPlanner";
import RecipeSearchModal from "../components/RecipeSearchModal";

const DAYS: DayOfWeek[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

// Get Monday of current week
function getMonday(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

export default function ThisWeek() {
  const navigate = useNavigate();
  const [family, setFamily] = useState<Family | null>(null);
  const [members, setMembers] = useState<FamilyMemberV3[]>([]);
  const [weekStart, setWeekStart] = useState(
    localStorage.getItem('selectedWeekStart') || getMonday(new Date())
  );
  
  // Cooking schedule state
  const [cookingSchedule, setCookingSchedule] = useState<WeeklyCookingSchedule[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
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
  // When true, auto-generate plan once all search modals are resolved/skipped
  const shouldAutoGenerate = useRef(false);

  useEffect(() => {
    loadData();
  }, [weekStart]);

  const loadData = async () => {
    setLoading(true);
    try {
      const families = await getFamilies();
      if (families.length > 0) {
        const fam = families[0];
        setFamily(fam);

        // Load members
        const membersData = await getFamilyMembers(fam.id);
        setMembers(membersData);

        // Load existing cooking schedule for this week
        const schedule = await getCookingSchedule(fam.id, weekStart).catch(() => []);
        console.log('Loaded schedule from API:', schedule);

        if (schedule.length === 0) {
          console.log('No schedule data, initializing...');
          initializeEmptySchedule(fam.id);
        } else {
          setCookingSchedule(schedule);
        }

      }
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const initializeEmptySchedule = (familyId: number) => {
    // Default: cooking every weekday, not on weekends, all "one_main"
    const schedule: WeeklyCookingSchedule[] = DAYS.map((day) => ({
      id: 0,
      family_id: familyId,
      week_start: weekStart,
      day,
      is_cooking: ["monday", "tuesday", "wednesday", "thursday", "friday"].includes(day),
      meal_mode: "one_main",
      num_mains: undefined,
      main_assignments: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    setCookingSchedule(schedule as any);
    console.log('Initialized empty schedule:', schedule);
  };

  const handleSmartSetup = async (text: string) => {
    if (!family) return;
    setSmartSetupLoading(true);
    // Reset any previous search state
    setPendingSearchMeals([]);
    setCurrentSearchIndex(0);
    setResolvedSpecificMeals([]);
    shouldAutoGenerate.current = false;

    try {
      const result = await smartSetup(family.id, text);

      // Update cooking schedule
      const updatedSchedule = cookingSchedule.map((sched) => {
        const dayData = result.cooking_days[sched.day];
        return {
          ...sched,
          is_cooking: dayData?.is_cooking ?? false,
          meal_mode: dayData?.meal_mode || "one_main",
        };
      });
      setCookingSchedule(updatedSchedule as any);

      // Check for specific meal requests
      if (result.specific_meals && result.specific_meals.length > 0) {
        const recipes = await getRecipes();
        setAllRecipes(recipes);

        // Fuzzy-match each specific meal against the database
        const unmatched: Array<{ day: string; description: string }> = [];
        const autoResolved: Array<{ day: string; recipe_id: number }> = [];

        for (const meal of result.specific_meals) {
          const { match: dbMatch } = await matchRecipeInDb(meal.description);
          if (dbMatch) {
            autoResolved.push({ day: meal.day, recipe_id: dbMatch.id });
            if (!recipes.some((r) => r.id === dbMatch.id)) {
              recipes.push(dbMatch);
              setAllRecipes([...recipes]);
            }
          } else {
            unmatched.push(meal);
          }
        }

        setResolvedSpecificMeals(autoResolved);
        shouldAutoGenerate.current = true;

        if (unmatched.length > 0) {
          // Show search modals — generation will happen after all are resolved/skipped
          setPendingSearchMeals(unmatched);
          setCurrentSearchIndex(0);
        } else {
          // All specific meals matched existing recipes — generate immediately
          setSmartSetupLoading(false);
          generatePlanWithLocks(updatedSchedule as any, autoResolved, recipes);
          return;
        }
      }
    } catch (error) {
      console.error("Smart setup error:", error);
      alert("Smart setup failed. Please try again.");
    } finally {
      setSmartSetupLoading(false);
    }
  };

  const finishSearchFlow = useCallback(
    (finalResolved: Array<{ day: string; recipe_id: number }>, recipes: Recipe[]) => {
      setPendingSearchMeals([]);
      setCurrentSearchIndex(0);
      if (shouldAutoGenerate.current) {
        shouldAutoGenerate.current = false;
        generatePlanWithLocks(cookingSchedule as any, finalResolved, recipes);
      }
    },
    [cookingSchedule, family, weekStart],
  );

  const handleRecipeSelected = (recipe: Recipe) => {
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
    if (currentSearchIndex < pendingSearchMeals.length - 1) {
      setCurrentSearchIndex((prev) => prev + 1);
    } else {
      finishSearchFlow(resolvedSpecificMeals, allRecipes);
    }
  };

  const handleSaveSchedule = async () => {
    if (!family) return;

    setSaving(true);
    try {
      console.log('Saving cookingSchedule:', cookingSchedule);
      await saveCookingSchedule(family.id, weekStart, cookingSchedule as any);
      alert("Week settings saved!");
    } catch (error) {
      console.error("Error saving:", error);
      alert("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const generatePlanWithLocks = async (
    schedule: WeeklyCookingSchedule[],
    locks: Array<{ day: string; recipe_id: number }>,
    recipes?: Recipe[],
  ) => {
    if (!family) return;
    const recipeLookup = recipes || allRecipes;

    // Save current settings first
    setSaving(true);
    try {
      await saveCookingSchedule(family.id, weekStart, schedule);
    } catch (error) {
      console.error("Error saving before generation:", error);
    }
    setSaving(false);

    // Generate meal plan
    setGenerating(true);
    try {
      const specificMealsForPlan = locks.length > 0
        ? locks.map((m) => {
            const recipe = recipeLookup.find((r) => r.id === m.recipe_id);
            return { day: m.day, description: recipe?.title || "" };
          })
        : undefined;

      const plan = await generateMealPlanV3({
        family_id: family.id,
        week_start: weekStart,
        cooking_schedule: schedule as any,
        lunch_needs: [],
        max_cook_minutes_weekday: family.max_cook_minutes_weekday,
        max_cook_minutes_weekend: family.max_cook_minutes_weekend,
        vegetarian_ratio: family.vegetarian_ratio,
        specific_meals: specificMealsForPlan,
        locks: locks.length > 0
          ? Object.fromEntries(locks.map((m) => [m.day, m.recipe_id]))
          : undefined,
      });

      navigate(`/plan?id=${plan.id}`);
    } catch (error) {
      console.error("Error generating meal plan:", error);
      alert("Failed to generate meal plan. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const handleGeneratePlan = () => {
    generatePlanWithLocks(cookingSchedule as any, resolvedSpecificMeals);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!family) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-4">No family profile found.</p>
        <p className="text-sm text-gray-400">
          Create a family profile first.
        </p>
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-4">No family members found.</p>
        <p className="text-sm text-gray-400 mb-4">
          Add family members to start meal planning.
        </p>
        <button
          onClick={() => navigate("/family")}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700"
        >
          Go to My Family
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">This Week</h2>
        <p className="text-sm text-gray-500 mt-1">
          Configure your meal planning preferences for the week
        </p>
      </div>

      {/* Week Selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Week Starting
        </label>
        <input
          type="date"
          value={weekStart}
          onChange={(e) => {
            const newWeek = e.target.value;
            console.log('Week changed to:', newWeek);
            setWeekStart(newWeek);
            localStorage.setItem('selectedWeekStart', newWeek);
            console.log('Saved to localStorage:', localStorage.getItem('selectedWeekStart'));
          }}
          className="px-3 py-2 border border-gray-300 rounded-lg"
        />
      </div>

      {/* Conversational Planner */}
      <ConversationalPlanner
        onSmartSetup={handleSmartSetup}
        loading={smartSetupLoading}
      />

      {/* Manual Planning Divider */}
      <div className="relative border-t border-gray-200 pt-6">
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gray-50 px-4 text-sm font-medium text-gray-400">
          Or Plan It Manually...
        </span>
      </div>

      {/* Cooking Schedule */}
      <CookingScheduleSection
        days={DAYS}
        schedule={cookingSchedule}
        members={members}
        onChange={setCookingSchedule}
      />

      {/* Action Buttons */}
      <div className="flex gap-3 sticky bottom-0 bg-white border-t border-gray-200 py-4 -mx-4 px-4">
        <button
          onClick={handleSaveSchedule}
          disabled={saving}
          className="px-6 py-3 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
        <button
          onClick={handleGeneratePlan}
          disabled={generating || saving}
          className="flex-1 px-6 py-3 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors text-lg"
        >
          {generating ? "Generating..." : "🎯 Generate Meal Plan"}
        </button>
      </div>

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
    </div>
  );
}
