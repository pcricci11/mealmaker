import { useState } from "react";
import type { MealPlanItemV3, DayOfWeek, Recipe } from "@shared/types";
import { Dialog, DialogContent } from "@/components/ui/dialog";

// Hex-based cuisine colors for dark backgrounds
export const CUISINE_COLORS: Record<string, { bg: string; text: string }> = {
  american: { bg: "#1e3a5f", text: "#93c5fd" },
  italian: { bg: "#5c1a1a", text: "#fca5a5" },
  mexican: { bg: "#5c2e0e", text: "#fdba74" },
  indian: { bg: "#5c4a0e", text: "#fde68a" },
  chinese: { bg: "#4c1d3d", text: "#fda4af" },
  japanese: { bg: "#4c1d35", text: "#f9a8d4" },
  thai: { bg: "#1a4c1a", text: "#bef264" },
  mediterranean: { bg: "#0e4c4c", text: "#67e8f9" },
  korean: { bg: "#3b1a5c", text: "#d8b4fe" },
  french: { bg: "#1e1a5c", text: "#a5b4fc" },
  middle_eastern: { bg: "#5c3e0e", text: "#fcd34d" },
  ethiopian: { bg: "#0e4c3e", text: "#5eead4" },
};

const DAY_LABELS: Record<string, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

interface Props {
  item?: MealPlanItemV3;
  draftRecipe?: Recipe;
  day: DayOfWeek;
  isLocked: boolean;
  onClose: () => void;
  onSwapMain?: () => void;
  onRemoveMain?: () => void;
  onSwapSide?: (sideId: number) => void;
  onAddSide?: () => void;
  onRemoveSide?: (sideId: number) => void;
  onRemoveDraft?: () => void;
  onViewRecipe?: () => void;
  sides?: MealPlanItemV3[];
  draftSideNames?: string[];
  onAddDraftSide?: (name: string) => void;
  onRemoveDraftSide?: (index: number) => void;
}

export default function MealDetailSheet({
  item,
  draftRecipe,
  day,
  isLocked,
  onClose,
  onSwapMain,
  onRemoveMain,
  onSwapSide,
  onAddSide,
  onRemoveSide,
  onRemoveDraft,
  onViewRecipe,
  sides = [],
  draftSideNames,
  onAddDraftSide,
  onRemoveDraftSide,
}: Props) {
  const [newSideName, setNewSideName] = useState("");
  const recipe = item?.recipe ?? draftRecipe;
  const recipeName = item?.recipe_name ?? draftRecipe?.title ?? "Unknown Recipe";
  const cuisine = recipe?.cuisine ?? null;
  const cookMinutes = recipe?.cook_minutes ?? null;
  const sourceName = recipe?.source_name ?? null;
  const sourceUrl = recipe?.source_url ?? draftRecipe?.source_url ?? null;
  const cuisineColors = cuisine ? CUISINE_COLORS[cuisine] : null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="p-0 overflow-hidden max-w-md" fullScreenMobile={false}>
        {/* Hero section */}
        <div
          className="relative h-[180px] flex flex-col justify-end p-5"
          style={{
            background: "linear-gradient(to top, #2C2824, #3E3832)",
          }}
        >
          {/* Decorative gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          <div className="relative z-10">
            <span className="text-xs font-medium uppercase tracking-wider text-chef-gold">
              {DAY_LABELS[day]}
            </span>
            <h2 className="font-display text-xl md:text-2xl font-bold text-white mt-1 leading-tight">
              {recipeName}
            </h2>
          </div>
        </div>

        {/* Tags row */}
        <div className="px-5 pt-4 flex flex-wrap items-center gap-2">
          {cuisine && (
            <span
              className="px-2.5 py-0.5 rounded-full text-xs font-medium"
              style={{
                backgroundColor: cuisineColors?.bg ?? "#3E3832",
                color: cuisineColors?.text ?? "#d6d3d1",
              }}
            >
              {cuisine.replace("_", " ")}
            </span>
          )}
          {cookMinutes && (
            <span className="flex items-center gap-1 text-xs text-stone-500">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {cookMinutes} min
            </span>
          )}
          {sourceName && (
            <span className="text-xs text-stone-400">
              {sourceName}
            </span>
          )}
        </div>

        {/* Sides & Extras section (draft) */}
        {!isLocked && onAddDraftSide && (
          <div className="px-5 pt-4">
            {/* Dotted separator */}
            <div className="border-t border-dashed border-stone-200 mb-3" />
            <span className="text-xs font-medium text-stone-500 uppercase tracking-wider">
              Sides & Extras
            </span>

            {/* Chips display */}
            {draftSideNames && draftSideNames.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {draftSideNames.map((name, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-stone-100 text-stone-700 rounded-full text-sm"
                  >
                    {name}
                    {onRemoveDraftSide && (
                      <button
                        onClick={() => onRemoveDraftSide(i)}
                        className="text-stone-400 hover:text-red-500 ml-0.5 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}

            {/* Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = newSideName.trim();
                if (!trimmed) return;
                onAddDraftSide(trimmed);
                setNewSideName("");
              }}
              className="mt-2"
            >
              <input
                type="text"
                value={newSideName}
                onChange={(e) => setNewSideName(e.target.value)}
                placeholder="Add a side... (e.g. garlic bread, roasted veggies)"
                className="w-full border border-dashed border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chef-orange/40 focus:border-chef-orange transition-colors"
              />
            </form>
          </div>
        )}

        {/* Sides section (locked only) */}
        {isLocked && (
          <div className="px-5 pt-4">
            {sides.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-medium text-stone-500 uppercase tracking-wider">Sides</span>
                {sides.map((side) => (
                  <div key={side.id} className="flex items-center justify-between bg-stone-50 rounded-lg px-3 py-2">
                    <span className="text-sm text-stone-700">{side.recipe_name || "Side"}</span>
                    {onRemoveSide && (
                      <button
                        onClick={() => onRemoveSide(side.id)}
                        className="text-stone-400 hover:text-red-500 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {onAddSide && (
              <button
                onClick={onAddSide}
                className="mt-2 w-full border-2 border-dashed border-stone-200 rounded-lg py-2 text-sm text-stone-400 hover:border-chef-orange hover:text-chef-orange transition-colors"
              >
                + Add Side
              </button>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="px-5 pt-4 pb-5 space-y-2">
          {/* View Full Recipe */}
          {sourceUrl && (
            <button
              onClick={() => {
                window.open(sourceUrl, "_blank", "noopener,noreferrer");
                onViewRecipe?.();
              }}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-colors"
              style={{ background: "linear-gradient(135deg, #EA580C, #C2410C)" }}
            >
              View Full Recipe
            </button>
          )}

          {/* Swap Recipe */}
          {onSwapMain && (
            <button
              onClick={onSwapMain}
              className="w-full py-2.5 rounded-lg text-sm font-medium bg-stone-100 text-stone-700 hover:bg-stone-200 transition-colors"
            >
              Swap Recipe
            </button>
          )}

          {/* Remove */}
          {isLocked && onRemoveMain && (
            <button
              onClick={onRemoveMain}
              className="w-full py-2.5 rounded-lg text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
            >
              Remove
            </button>
          )}

          {/* Remove Draft */}
          {!isLocked && onRemoveDraft && (
            <button
              onClick={onRemoveDraft}
              className="w-full py-2.5 rounded-lg text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
            >
              Remove
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
