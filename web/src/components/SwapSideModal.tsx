// components/SwapSideModal.tsx
// Modal for swapping a side with alternatives

import { useState, useEffect } from "react";
import { getSideSuggestions } from "../api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

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
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex flex-col">
        <DialogHeader>
          <DialogTitle>Swap Side</DialogTitle>
        </DialogHeader>

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
                  <div className="flex gap-2 mt-1">
                    <Badge variant="secondary" className="capitalize">
                      {side.category}
                    </Badge>
                    <Badge variant="secondary" className="capitalize">
                      {side.weight}
                    </Badge>
                    {side.prep_time_minutes && (
                      <Badge variant="secondary">
                        {side.prep_time_minutes} min
                      </Badge>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Show More Options */}
          {!loading && (
            <Button
              variant="link"
              onClick={handleRefresh}
              disabled={refreshing}
              className="w-full"
            >
              {refreshing ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-emerald-200 border-t-emerald-600" />
                  Loading...
                </span>
              ) : (
                "Show More Options"
              )}
            </Button>
          )}

          {/* Custom Side */}
          {!loading && (
            <div className="border-t border-gray-200 pt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Or add your own custom side:
              </label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customName.trim()) handleCustomSwap();
                  }}
                  placeholder="e.g., garlic bread, roasted vegetables"
                  className="flex-1"
                />
                <Button
                  onClick={handleCustomSwap}
                  disabled={!customName.trim()}
                  className="whitespace-nowrap"
                >
                  Add Custom Side
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter>
          <Button variant="ghost" className="w-full" onClick={onClose}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
