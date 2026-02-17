// components/FavoriteMealModal.tsx
// Modal for adding/editing favorite meals

import { useState, useEffect } from "react";
import type { FamilyFavoriteMeal, FrequencyPreference, Difficulty } from "@shared/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  meal: FamilyFavoriteMeal | null;
  onSave: (data: Partial<FamilyFavoriteMeal>) => void;
  onClose: () => void;
}

export default function FavoriteMealModal({ meal, onSave, onClose }: Props) {
  const [name, setName] = useState("");
  const [recipeUrl, setRecipeUrl] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty | "">("");
  const [totalTime, setTotalTime] = useState("");
  const [frequency, setFrequency] = useState<FrequencyPreference | "">("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (meal) {
      setName(meal.name);
      setRecipeUrl(meal.recipe_url || "");
      setDifficulty(meal.difficulty || "");
      setTotalTime(meal.total_time_minutes?.toString() || "");
      setFrequency(meal.frequency_preference || "");
      setNotes(meal.notes || "");
    }
  }, [meal]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      alert("Please enter a meal name");
      return;
    }

    onSave({
      name: name.trim(),
      recipe_url: recipeUrl.trim() || null,
      difficulty: difficulty || null,
      total_time_minutes: totalTime ? parseInt(totalTime) : null,
      frequency_preference: frequency || null,
      notes: notes.trim() || null,
    });
  };

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent fullScreenMobile={false}>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {meal ? "Edit Favorite Meal" : "Add Favorite Meal"}
            </DialogTitle>
          </DialogHeader>

          <div className="p-6 space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Meal Name <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Grandma's Mac and Cheese"
                required
              />
            </div>

            {/* Recipe URL */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Recipe URL (optional)
              </label>
              <Input
                type="url"
                value={recipeUrl}
                onChange={(e) => setRecipeUrl(e.target.value)}
                placeholder="https://example.com/recipe"
              />
              <p className="text-xs text-gray-500 mt-1">
                Paste a link to the recipe, or leave blank for generic meals
              </p>
            </div>

            {/* Difficulty */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Difficulty
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value="">Not specified</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>

            {/* Total Time */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Total Time (minutes)
              </label>
              <Input
                type="number"
                value={totalTime}
                onChange={(e) => setTotalTime(e.target.value)}
                placeholder="e.g., 45"
                min="1"
              />
            </div>

            {/* Frequency */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                How often willing to make this?
              </label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as FrequencyPreference)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value="">Not specified</option>
                <option value="always">Always (every week if possible)</option>
                <option value="weekly">Once a week</option>
                <option value="twice_month">Twice a month</option>
                <option value="monthly">Once a month</option>
                <option value="bimonthly">Once every 2 months</option>
                <option value="rarely">Rarely / Special occasions</option>
              </select>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                rows={3}
                placeholder="Any special notes about this meal..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              {meal ? "Save Changes" : "Add Meal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
