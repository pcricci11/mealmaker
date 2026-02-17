// components/AddSideModal.tsx
// Modal for adding another side to a meal

import { useState, useEffect } from "react";
import { getSidesLibrary, getFavoriteSides } from "../api";
import type { FamilyFavoriteSide } from "@shared/types";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface Props {
  mainMealItemId: number;
  onAdd: (sideId?: number, customName?: string) => void | Promise<void>;
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

  const [adding, setAdding] = useState(false);

  const handleAddFromLibrary = async (sideId: number) => {
    setAdding(true);
    try {
      await onAdd(sideId, undefined);
    } catch (error) {
      console.error('Add failed:', error);
      setAdding(false);
    }
  };

  const handleAddCustom = async () => {
    if (!customName.trim()) {
      alert("Please enter a side name");
      return;
    }
    setAdding(true);
    try {
      await onAdd(undefined, customName.trim());
    } catch (error) {
      console.error('Add failed:', error);
      setAdding(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Side</DialogTitle>
        </DialogHeader>

        {/* Mode Selector */}
        <div className="border-b border-gray-200 px-4 md:px-6 py-3 flex gap-2">
          <button
            onClick={() => setMode("library")}
            className={cn(
              "px-3 py-1 rounded-lg text-sm font-medium",
              mode === "library"
                ? "bg-orange-100 text-orange-600"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
          >
            From Library
          </button>
          <button
            onClick={() => setMode("favorites")}
            className={cn(
              "px-3 py-1 rounded-lg text-sm font-medium",
              mode === "favorites"
                ? "bg-orange-100 text-orange-600"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
          >
            My Favorites
          </button>
          <button
            onClick={() => setMode("custom")}
            className={cn(
              "px-3 py-1 rounded-lg text-sm font-medium",
              mode === "custom"
                ? "bg-orange-100 text-orange-600"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
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
                      disabled={adding}
                      onClick={() => handleAddFromLibrary(side.id)}
                      className="w-full border border-gray-200 rounded-lg p-3 hover:border-orange-500 hover:bg-orange-50 transition-colors text-left disabled:opacity-50"
                    >
                      <div className="font-medium text-gray-900">{side.name}</div>
                      <div className="flex gap-2 mt-1">
                        <Badge variant="secondary" className="capitalize">
                          {side.category}
                        </Badge>
                        <Badge variant="secondary" className="capitalize">
                          {side.weight}
                        </Badge>
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
                      disabled={adding}
                      onClick={() => handleAddFromLibrary(side.id)}
                      className="w-full border border-gray-200 rounded-lg p-3 hover:border-orange-500 hover:bg-orange-50 transition-colors text-left disabled:opacity-50"
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
              <Input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g., Roasted Vegetables"
                autoFocus
              />
              <Button
                onClick={handleAddCustom}
                disabled={adding}
                className="w-full mt-4"
              >
                {adding ? "Adding..." : "Add Custom Side"}
              </Button>
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
