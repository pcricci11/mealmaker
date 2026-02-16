// components/SwapSideModal.tsx
// Modal for swapping a side with alternatives

import { useState, useEffect } from "react";
import { getSideSuggestions } from "../api";

interface Props {
  mealItemId: number;
  mainRecipeId: number;
  onSwap: (newSideId?: number, customName?: string) => void;
  onClose: () => void;
}

interface SideSuggestion {
  id: number;
  name: string;
  category: string;
  weight: string;
  prep_time_minutes?: number;
}

export default function SwapSideModal({
  mealItemId,
  mainRecipeId,
  onSwap,
  onClose,
}: Props) {
  const [suggestions, setSuggestions] = useState<SideSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [customName, setCustomName] = useState("");

  useEffect(() => {
    loadSuggestions();
  }, [mainRecipeId]);

  const loadSuggestions = async () => {
    setLoading(true);
    try {
      const sides = await getSideSuggestions(mainRecipeId);
      setSuggestions(sides);
    } catch (error) {
      console.error("Error loading side suggestions:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const sides = await getSideSuggestions(mainRecipeId);
      setSuggestions(sides);
    } catch (error) {
      console.error("Error refreshing suggestions:", error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleSelect = (sideId: number) => {
    onSwap(sideId);
  };

  const handleCustomSwap = () => {
    const trimmed = customName.trim();
    if (!trimmed) return;
    onSwap(undefined, trimmed);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-0 md:p-4 z-50">
      <div className="bg-white rounded-none md:rounded-xl max-w-lg w-full h-full md:h-auto md:max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="border-b border-gray-200 px-4 md:px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">Swap Side</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="text-center py-8 text-gray-500">
              Loading suggestions...
            </div>
          ) : suggestions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No alternative sides found
            </div>
          ) : (
            <div className="space-y-2">
              {suggestions.map((side) => (
                <button
                  key={side.id}
                  onClick={() => handleSelect(side.id)}
                  className="w-full border border-gray-200 rounded-lg p-4 hover:border-emerald-500 hover:bg-emerald-50 transition-colors text-left"
                >
                  <div className="font-medium text-gray-900">{side.name}</div>
                  <div className="flex gap-2 mt-1 text-xs text-gray-600">
                    <span className="px-2 py-0.5 bg-gray-100 rounded capitalize">
                      {side.category}
                    </span>
                    <span className="px-2 py-0.5 bg-gray-100 rounded capitalize">
                      {side.weight}
                    </span>
                    {side.prep_time_minutes && (
                      <span className="px-2 py-0.5 bg-gray-100 rounded">
                        {side.prep_time_minutes} min
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Show More Options */}
          {!loading && (
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="w-full py-2 text-sm font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
            >
              {refreshing ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-emerald-200 border-t-emerald-600" />
                  Loading...
                </span>
              ) : (
                "Show More Options"
              )}
            </button>
          )}

          {/* Custom Side */}
          {!loading && (
            <div className="border-t border-gray-200 pt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Or add your own custom side:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customName.trim()) handleCustomSwap();
                  }}
                  placeholder="e.g., garlic bread, roasted vegetables"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
                <button
                  onClick={handleCustomSwap}
                  disabled={!customName.trim()}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium text-sm hover:bg-emerald-700 transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  Add Custom Side
                </button>
              </div>
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
