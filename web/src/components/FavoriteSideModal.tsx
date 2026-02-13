// components/FavoriteSideModal.tsx
// Modal for adding/editing favorite sides

import { useState, useEffect } from "react";
import type { FamilyFavoriteSide } from "@shared/types";

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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-lg w-full">
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
            <h3 className="text-lg font-bold">
              {side ? "Edit Favorite Side" : "Add Favorite Side"}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>

          <div className="p-6 space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Side Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="e.g., Garlic Roasted Asparagus"
                required
              />
            </div>

            {/* Recipe URL */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Recipe URL (optional)
              </label>
              <input
                type="url"
                value={recipeUrl}
                onChange={(e) => setRecipeUrl(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
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

          {/* Footer */}
          <div className="bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors"
            >
              {side ? "Save Changes" : "Add Side"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
