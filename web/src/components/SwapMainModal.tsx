// components/SwapMainModal.tsx
// Modal for swapping a main recipe with alternatives

import { useState, useEffect, useRef } from "react";
import { getRecipes } from "../api";
import type { Recipe, DayOfWeek } from "@shared/types";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Props {
  mealItemId: number;
  day: DayOfWeek;
  onSwap: (newRecipeId: number) => void;
  onClose: () => void;
}

export const CUISINE_COLORS: Record<string, string> = {
  american: "bg-blue-100 text-blue-700",
  italian: "bg-red-100 text-red-700",
  mexican: "bg-orange-100 text-orange-700",
  indian: "bg-yellow-100 text-yellow-700",
  chinese: "bg-rose-100 text-rose-700",
  japanese: "bg-pink-100 text-pink-700",
  thai: "bg-lime-100 text-lime-700",
  mediterranean: "bg-cyan-100 text-cyan-700",
  korean: "bg-purple-100 text-purple-700",
  french: "bg-indigo-100 text-indigo-700",
  middle_eastern: "bg-amber-100 text-amber-700",
  ethiopian: "bg-teal-100 text-teal-700",
};

function pickRandom(recipes: Recipe[], count: number, exclude: Set<number>): Recipe[] {
  const available = recipes.filter((r) => !exclude.has(r.id));
  const shuffled = [...available].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export default function SwapMainModal({
  mealItemId,
  day,
  onSwap,
  onClose,
}: Props) {
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([]);
  const [suggestions, setSuggestions] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [swapping, setSwapping] = useState(false);
  const shownIds = useRef<Set<number>>(new Set());

  useEffect(() => {
    loadRecipes();
  }, []);

  const loadRecipes = async () => {
    setLoading(true);
    try {
      const all = await getRecipes();
      setAllRecipes(all);
      const picks = pickRandom(all, 3, shownIds.current);
      picks.forEach((r) => shownIds.current.add(r.id));
      setSuggestions(picks);
    } catch (error) {
      console.error("Error loading recipes:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    const picks = pickRandom(allRecipes, 3, shownIds.current);
    if (picks.length === 0) {
      // All recipes have been shown — reset and start over
      shownIds.current = new Set();
      const fresh = pickRandom(allRecipes, 3, shownIds.current);
      fresh.forEach((r) => shownIds.current.add(r.id));
      setSuggestions(fresh);
    } else {
      picks.forEach((r) => shownIds.current.add(r.id));
      setSuggestions(picks);
    }
  };

  const handleSelect = async (recipeId: number) => {
    console.log('Attempting to swap to recipe:', recipeId);
    setSwapping(true);
    try {
      await onSwap(recipeId);
      console.log('Swap successful!');
    } catch (error) {
      console.error('Swap failed:', error);
      setSwapping(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open && !swapping) onClose(); }}>
      <DialogContent className="flex flex-col">
        <DialogHeader>
          <DialogTitle>Swap Main Recipe</DialogTitle>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-8 text-gray-500">
              Loading suggestions...
            </div>
          ) : swapping ? (
            <div className="text-center py-8 text-gray-500">
              Swapping recipe...
            </div>
          ) : suggestions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No recipes available
            </div>
          ) : (
            <div className="space-y-2">
              {suggestions.map((recipe) => {
                const cuisineClass =
                  CUISINE_COLORS[recipe.cuisine] || "bg-gray-100 text-gray-700";
                return (
                  <button
                    key={recipe.id}
                    onClick={() => handleSelect(recipe.id)}
                    disabled={swapping}
                    className="w-full border border-gray-200 rounded-lg p-4 hover:border-emerald-500 hover:bg-emerald-50 transition-colors text-left disabled:opacity-50"
                  >
                    <div className="font-medium text-gray-900">
                      {recipe.title}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-1">
                      <Badge variant="outline" className={cn("border-0", cuisineClass)}>
                        {recipe.cuisine.replace("_", " ")}
                      </Badge>
                      {recipe.vegetarian ? (
                        <Badge variant="outline" className="bg-green-100 text-green-700 border-0">
                          Vegetarian
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          {recipe.protein_type}
                        </Badge>
                      )}
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
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="flex flex-col space-y-2 sm:flex-col sm:space-x-0 sm:space-y-2">
          <Button
            onClick={handleRefresh}
            disabled={loading || swapping}
            className="w-full"
          >
            Cook Me Up New Options
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={onClose}
            disabled={swapping}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
