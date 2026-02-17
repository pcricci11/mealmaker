import { useState, useEffect, useMemo } from "react";
import { getRecipes, getFavoriteMeals } from "../api";
import { CUISINE_COLORS } from "./SwapMainModal";
import type { Recipe, DayOfWeek, FamilyFavoriteMeal } from "@shared/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const DAYS: { key: DayOfWeek; label: string }[] = [
  { key: "monday", label: "Mon" },
  { key: "tuesday", label: "Tue" },
  { key: "wednesday", label: "Wed" },
  { key: "thursday", label: "Thu" },
  { key: "friday", label: "Fri" },
  { key: "saturday", label: "Sat" },
  { key: "sunday", label: "Sun" },
];

interface Assignment {
  recipe: Recipe;
  day: DayOfWeek;
}

interface BuildFromRecipesModalProps {
  familyId: number;
  onSelect: (assignments: Map<DayOfWeek, Recipe[]>) => void;
  onClose: () => void;
}

export default function BuildFromRecipesModal({
  familyId,
  onSelect,
  onClose,
}: BuildFromRecipesModalProps) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [lovedMeals, setLovedMeals] = useState<FamilyFavoriteMeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [pickingDayForRecipe, setPickingDayForRecipe] = useState<Recipe | null>(null);

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

  // Get all day labels for a recipe
  const daysForRecipe = (recipeId: number): DayOfWeek[] =>
    assignments.filter((a) => a.recipe.id === recipeId).map((a) => a.day);

  const dayLabel = (day: DayOfWeek) =>
    DAYS.find((d) => d.key === day)?.label ?? day;

  const handleRecipeClick = (recipe: Recipe) => {
    const existing = daysForRecipe(recipe.id);
    if (existing.length > 0) {
      // Remove all assignments for this recipe
      setAssignments((prev) => prev.filter((a) => a.recipe.id !== recipe.id));
      return;
    }
    setPickingDayForRecipe(recipe);
  };

  const handleDayPick = (day: DayOfWeek) => {
    if (!pickingDayForRecipe) return;
    setAssignments((prev) => [...prev, { recipe: pickingDayForRecipe, day }]);
    setPickingDayForRecipe(null);
  };

  const handleDone = () => {
    const result = new Map<DayOfWeek, Recipe[]>();
    for (const { recipe, day } of assignments) {
      const existing = result.get(day) || [];
      existing.push(recipe);
      result.set(day, existing);
    }
    onSelect(result);
  };

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex flex-col">
        {/* Header */}
        <DialogHeader className="border-b border-gray-200 px-4 md:px-6 py-4">
          <DialogTitle className="text-lg font-bold">Pick from My Recipes</DialogTitle>
          <DialogDescription className="sr-only">Select recipes and assign them to days</DialogDescription>
        </DialogHeader>

        {/* Day picker (shown when picking a day for a recipe) */}
        {pickingDayForRecipe && (
          <div className="border-b border-gray-200 bg-orange-50 px-4 md:px-6 py-3">
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
                  className="px-3 py-1 rounded-full text-xs font-medium bg-white border border-orange-300 text-orange-600 hover:bg-orange-500 hover:text-white transition-colors"
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
          <Input
            type="text"
            placeholder="Search recipes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
              const assignedDays = daysForRecipe(recipe.id);
              const isAssigned = assignedDays.length > 0;
              const cuisineClass =
                CUISINE_COLORS[recipe.cuisine] || "bg-gray-100 text-gray-700";
              return (
                <button
                  key={recipe.id}
                  onClick={() => handleRecipeClick(recipe)}
                  className={`w-full border rounded-lg p-4 transition-colors text-left ${
                    isAssigned
                      ? "border-orange-500 bg-orange-50"
                      : "border-gray-200 hover:border-orange-400 hover:bg-orange-50/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-gray-900 min-w-0">
                      {isLoved && (
                        <span className="text-red-500 mr-1.5">&#9829;</span>
                      )}
                      {recipe.title}
                    </div>
                    {isAssigned && (
                      <div className="flex gap-1 shrink-0">
                        {assignedDays.map((day) => (
                          <span
                            key={day}
                            className="text-xs px-2 py-0.5 rounded-full bg-orange-200 text-orange-800 font-medium"
                          >
                            {dayLabel(day)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <Badge variant="outline" className={cn("border-0", cuisineClass)}>
                      {recipe.cuisine.replace("_", " ")}
                    </Badge>
                    <Badge variant="secondary">
                      {recipe.cook_minutes} min
                    </Badge>
                    {recipe.difficulty && (
                      <Badge variant="secondary">
                        {recipe.difficulty}
                      </Badge>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="border-t border-gray-200 px-4 md:px-6 py-4 flex flex-col space-y-2">
          <Button
            className="w-full"
            onClick={handleDone}
            disabled={assignments.length === 0}
          >
            Add to Week ({assignments.length} recipe
            {assignments.length !== 1 ? "s" : ""})
          </Button>
          <Button variant="ghost" className="w-full" onClick={onClose}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
