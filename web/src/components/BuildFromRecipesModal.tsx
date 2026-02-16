import { useState, useEffect, useMemo } from "react";
import { getRecipes, getFavoriteMeals } from "../api";
import { CUISINE_COLORS } from "./SwapMainModal";
import type { Recipe, DayOfWeek, FamilyFavoriteMeal } from "@shared/types";

const DAYS: { key: DayOfWeek; label: string }[] = [
  { key: "monday", label: "Mon" },
  { key: "tuesday", label: "Tue" },
  { key: "wednesday", label: "Wed" },
  { key: "thursday", label: "Thu" },
  { key: "friday", label: "Fri" },
  { key: "saturday", label: "Sat" },
  { key: "sunday", label: "Sun" },
];

interface BuildFromRecipesModalProps {
  familyId: number;
  initialAssignments?: Map<DayOfWeek, Recipe>;
  onSelect: (assignments: Map<DayOfWeek, Recipe>) => void;
  onClose: () => void;
}

export default function BuildFromRecipesModal({
  familyId,
  initialAssignments,
  onSelect,
  onClose,
}: BuildFromRecipesModalProps) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [lovedMeals, setLovedMeals] = useState<FamilyFavoriteMeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [assignments, setAssignments] = useState<
    Map<DayOfWeek, { day: DayOfWeek; recipe: Recipe }>
  >(() => {
    if (!initialAssignments || initialAssignments.size === 0) return new Map();
    const m = new Map<DayOfWeek, { day: DayOfWeek; recipe: Recipe }>();
    for (const [day, recipe] of initialAssignments) {
      m.set(day, { day, recipe });
    }
    return m;
  });
  const [pickingDayForRecipe, setPickingDayForRecipe] = useState<Recipe | null>(
    null,
  );

  useEffect(() => {
    const load = async () => {
      try {
        const [allRecipes, favorites] = await Promise.all([
          getRecipes(),
          getFavoriteMeals(familyId),
        ]);
        setRecipes(allRecipes);
        setLovedMeals(favorites);
      } catch (err) {
        console.error("Failed to load recipes:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [familyId]);

  const lovedTitles = useMemo(
    () => new Set(lovedMeals.map((m) => m.name.toLowerCase())),
    [lovedMeals],
  );

  const assignedRecipeIds = useMemo(
    () => new Set(Array.from(assignments.values()).map((a) => a.recipe.id)),
    [assignments],
  );

  const displayRecipes = useMemo(() => {
    const term = search.toLowerCase();
    const filtered = recipes.filter(
      (r) =>
        !term ||
        r.title.toLowerCase().includes(term) ||
        r.cuisine.toLowerCase().includes(term),
    );
    return filtered.sort((a, b) => {
      const aLoved = lovedTitles.has(a.title.toLowerCase());
      const bLoved = lovedTitles.has(b.title.toLowerCase());
      if (aLoved && !bLoved) return -1;
      if (!aLoved && bLoved) return 1;
      return a.title.localeCompare(b.title);
    });
  }, [recipes, search, lovedTitles]);

  const handleRecipeClick = (recipe: Recipe) => {
    if (assignedRecipeIds.has(recipe.id)) {
      const next = new Map(assignments);
      for (const [day, val] of next) {
        if (val.recipe.id === recipe.id) {
          next.delete(day);
          break;
        }
      }
      setAssignments(next);
      return;
    }
    setPickingDayForRecipe(recipe);
  };

  const handleDayPick = (day: DayOfWeek) => {
    if (!pickingDayForRecipe) return;
    const next = new Map(assignments);
    next.set(day, { day, recipe: pickingDayForRecipe });
    setAssignments(next);
    setPickingDayForRecipe(null);
  };

  const handleRemoveAssignment = (day: DayOfWeek) => {
    const next = new Map(assignments);
    next.delete(day);
    setAssignments(next);
  };

  const handleDone = () => {
    const result = new Map<DayOfWeek, Recipe>();
    for (const [day, val] of assignments) {
      result.set(day, val.recipe);
    }
    onSelect(result);
  };

  const dayForRecipe = (recipeId: number): DayOfWeek | null => {
    for (const [day, val] of assignments) {
      if (val.recipe.id === recipeId) return day;
    }
    return null;
  };

  const dayLabel = (day: DayOfWeek) =>
    DAYS.find((d) => d.key === day)?.label ?? day;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-0 md:p-4 z-50">
      <div className="bg-white rounded-none md:rounded-xl max-w-lg w-full h-full md:h-auto md:max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="border-b border-gray-200 px-4 md:px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">Pick from My Recipes</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        {/* Assignment summary strip */}
        <div className="border-b border-gray-200 px-4 md:px-6 py-3">
          <div className="flex gap-1 md:gap-2 overflow-x-auto hide-scrollbar">
            {DAYS.map(({ key, label }) => {
              const assigned = assignments.get(key);
              return (
                <div
                  key={key}
                  className={`flex-1 rounded-lg p-1.5 text-center text-xs min-w-0 ${
                    assigned
                      ? "bg-emerald-100 border border-emerald-300"
                      : "bg-gray-50 border border-gray-200"
                  }`}
                >
                  <div className="font-semibold text-gray-500">{label}</div>
                  {assigned ? (
                    <div className="mt-0.5">
                      <div
                        className="text-emerald-800 truncate text-[10px] leading-tight"
                        title={assigned.recipe.title}
                      >
                        {assigned.recipe.title}
                      </div>
                      <button
                        onClick={() => handleRemoveAssignment(key)}
                        className="text-emerald-400 hover:text-red-500 text-[10px] mt-0.5"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="text-gray-300 mt-0.5">—</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Day picker (shown when picking a day for a recipe) */}
        {pickingDayForRecipe && (
          <div className="border-b border-gray-200 bg-emerald-50 px-4 md:px-6 py-3">
            <div className="text-sm text-gray-700 mb-2">
              Assign{" "}
              <span className="font-semibold">
                {pickingDayForRecipe.title}
              </span>{" "}
              to:
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              {DAYS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => handleDayPick(key)}
                  className="px-3 py-1 rounded-full text-xs font-medium bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-600 hover:text-white transition-colors"
                >
                  {label}
                </button>
              ))}
              <button
                onClick={() => setPickingDayForRecipe(null)}
                className="text-xs text-gray-500 hover:text-gray-700 ml-2"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Search bar */}
        <div className="px-4 md:px-6 py-3 border-b border-gray-100">
          <input
            type="text"
            placeholder="Search recipes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
        </div>

        {/* Recipe list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="text-center py-8 text-gray-500">
              Loading recipes...
            </div>
          ) : displayRecipes.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No recipes found
            </div>
          ) : (
            displayRecipes.map((recipe) => {
              const isLoved = lovedTitles.has(recipe.title.toLowerCase());
              const assignedDay = dayForRecipe(recipe.id);
              const cuisineClass =
                CUISINE_COLORS[recipe.cuisine] || "bg-gray-100 text-gray-700";
              return (
                <button
                  key={recipe.id}
                  onClick={() => handleRecipeClick(recipe)}
                  className={`w-full border rounded-lg p-4 transition-colors text-left ${
                    assignedDay
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-gray-200 hover:border-emerald-400 hover:bg-emerald-50/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-gray-900 min-w-0">
                      {isLoved && (
                        <span className="text-red-500 mr-1.5">&#9829;</span>
                      )}
                      {recipe.title}
                    </div>
                    {assignedDay && (
                      <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-800 font-medium">
                        {dayLabel(assignedDay)}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${cuisineClass}`}
                    >
                      {recipe.cuisine.replace("_", " ")}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {recipe.cook_minutes} min
                    </span>
                    {recipe.difficulty && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {recipe.difficulty}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-4 md:px-6 py-4 space-y-2">
          <button
            onClick={handleDone}
            disabled={assignments.size === 0}
            className="w-full px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add to Week ({assignments.size} recipe
            {assignments.size !== 1 ? "s" : ""})
          </button>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-gray-700 hover:text-gray-900 font-medium text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
