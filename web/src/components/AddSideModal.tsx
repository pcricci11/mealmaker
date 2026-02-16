// components/AddSideModal.tsx
// Modal for adding another side to a meal

import { useState, useEffect } from "react";
import { getSidesLibrary, getFavoriteSides } from "../api";
import type { FamilyFavoriteSide } from "@shared/types";

interface Props {
  mainMealItemId: number;
  onAdd: (sideId?: number, customName?: string) => void;
  onClose: () => void;
}

interface SideLibraryItem {
  id: number;
  name: string;
  category: string;
  weight: string;
}

export default function AddSideModal({
  mainMealItemId,
  onAdd,
  onClose,
}: Props) {
  const [mode, setMode] = useState<"library" | "favorites" | "custom">("library");
  const [librarySides, setLibrarySides] = useState<SideLibraryItem[]>([]);
  const [favoriteSides, setFavoriteSides] = useState<FamilyFavoriteSide[]>([]);
  const [customName, setCustomName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (mode === "library") {
      loadLibrarySides();
    } else if (mode === "favorites") {
      loadFavoriteSides();
    }
  }, [mode]);

  const loadLibrarySides = async () => {
    setLoading(true);
    try {
      const sides = await getSidesLibrary();
      setLibrarySides(sides);
    } catch (error) {
      console.error("Error loading sides library:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadFavoriteSides = async () => {
    setLoading(true);
    try {
      // Assuming we have family ID available, or we load it
      // For now, hardcoding family_id=1 - you should pass this as prop
      const sides = await getFavoriteSides(1);
      setFavoriteSides(sides);
    } catch (error) {
      console.error("Error loading favorite sides:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddFromLibrary = async (sideId: number) => {
    console.log('Attempting to add side:', sideId, undefined);
    try {
      await onAdd(sideId, undefined);
      console.log('Add successful!');
    } catch (error) {
      console.error('Add failed:', error);
    }
  };

  const handleAddCustom = async () => {
    if (!customName.trim()) {
      alert("Please enter a side name");
      return;
    }
    console.log('Attempting to add side:', undefined, customName.trim());
    try {
      await onAdd(undefined, customName.trim());
      console.log('Add successful!');
    } catch (error) {
      console.error('Add failed:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-0 md:p-4 z-50">
      <div className="bg-white rounded-none md:rounded-xl max-w-lg w-full h-full md:h-auto md:max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="border-b border-gray-200 px-4 md:px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">Add Side</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        {/* Mode Selector */}
        <div className="border-b border-gray-200 px-4 md:px-6 py-3 flex gap-2">
          <button
            onClick={() => setMode("library")}
            className={`px-3 py-1 rounded-lg text-sm font-medium ${
              mode === "library"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            From Library
          </button>
          <button
            onClick={() => setMode("favorites")}
            className={`px-3 py-1 rounded-lg text-sm font-medium ${
              mode === "favorites"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            My Favorites
          </button>
          <button
            onClick={() => setMode("custom")}
            className={`px-3 py-1 rounded-lg text-sm font-medium ${
              mode === "custom"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Custom
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {mode === "library" && (
            <>
              {loading ? (
                <div className="text-center py-8 text-gray-500">Loading...</div>
              ) : (
                <div className="space-y-2">
                  {librarySides.map((side) => (
                    <button
                      key={side.id}
                      onClick={() => handleAddFromLibrary(side.id)}
                      className="w-full border border-gray-200 rounded-lg p-3 hover:border-emerald-500 hover:bg-emerald-50 transition-colors text-left"
                    >
                      <div className="font-medium text-gray-900">{side.name}</div>
                      <div className="flex gap-2 mt-1 text-xs text-gray-600">
                        <span className="px-2 py-0.5 bg-gray-100 rounded capitalize">
                          {side.category}
                        </span>
                        <span className="px-2 py-0.5 bg-gray-100 rounded capitalize">
                          {side.weight}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {mode === "favorites" && (
            <>
              {loading ? (
                <div className="text-center py-8 text-gray-500">Loading...</div>
              ) : favoriteSides.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No favorite sides yet
                </div>
              ) : (
                <div className="space-y-2">
                  {favoriteSides.map((side) => (
                    <button
                      key={side.id}
                      onClick={() => handleAddFromLibrary(side.id)}
                      className="w-full border border-gray-200 rounded-lg p-3 hover:border-emerald-500 hover:bg-emerald-50 transition-colors text-left"
                    >
                      <div className="font-medium text-gray-900">{side.name}</div>
                      {side.category && (
                        <div className="text-xs text-gray-600 mt-1 capitalize">
                          {side.category}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {mode === "custom" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Enter side name
              </label>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="e.g., Roasted Vegetables"
                autoFocus
              />
              <button
                onClick={handleAddCustom}
                className="w-full mt-4 px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700"
              >
                Add Custom Side
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-4 md:px-6 py-4">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-gray-700 hover:text-gray-900 font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
