// components/FavoriteSideModal.tsx
// Modal for adding/editing favorite sides

import { useState, useEffect } from "react";
import type { FamilyFavoriteSide } from "@shared/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  side: FamilyFavoriteSide | null;
  onSave: (data: Partial<FamilyFavoriteSide>) => void;
  onClose: () => void;
}

const SIDE_CATEGORIES = [
  "veggie",
  "salad",
  "starch",
  "grain",
  "bread",
  "fruit",
  "other",
];

export default function FavoriteSideModal({ side, onSave, onClose }: Props) {
  const [name, setName] = useState("");
  const [recipeUrl, setRecipeUrl] = useState("");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (side) {
      setName(side.name);
      setRecipeUrl(side.recipe_url || "");
      setCategory(side.category || "");
      setNotes(side.notes || "");
    }
  }, [side]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      alert("Please enter a side name");
      return;
    }

    onSave({
      name: name.trim(),
      recipe_url: recipeUrl.trim() || null,
      category: category || null,
      notes: notes.trim() || null,
    });
  };

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent fullScreenMobile={false}>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {side ? "Edit Favorite Side" : "Add Favorite Side"}
            </DialogTitle>
          </DialogHeader>

          <div className="p-6 space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Side Name <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Garlic Roasted Asparagus"
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
                Paste a link to the recipe, or leave blank
              </p>
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value="">Not specified</option>
                {SIDE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </option>
                ))}
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
                placeholder="Pairs well with..., great for..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              {side ? "Save Changes" : "Add Side"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
