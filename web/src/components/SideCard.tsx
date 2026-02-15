// components/SideCard.tsx
// Display card for a single side dish

import type { MealPlanItemV3 } from "@shared/types";

interface Props {
  side: MealPlanItemV3;
  onSwap: () => void;
  onRemove?: () => void;
}

export default function SideCard({ side, onSwap, onRemove }: Props) {
  // Parse side info from notes
  let sideName = "Side Dish";
  let sideCategory = null;

  if (side.notes) {
    // notes may arrive as a JSON string or an already-parsed object
    const parsed =
      typeof side.notes === "object"
        ? side.notes
        : (() => { try { return JSON.parse(side.notes as string); } catch { return null; } })();

    if (parsed && typeof parsed === "object") {
      sideName = (parsed as any).side_name || sideName;
      sideCategory = (parsed as any).category || null;
    } else if (typeof side.notes === "string") {
      sideName = side.notes;
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-white hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm text-gray-900 truncate">
            {sideName}
          </div>
          {sideCategory && (
            <div className="text-xs text-gray-500 mt-0.5 capitalize">
              {sideCategory}
            </div>
          )}
        </div>
        <div className="flex gap-2 ml-2 shrink-0">
          <button
            onClick={onSwap}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            Swap
          </button>
          {onRemove && (
            <button
              onClick={onRemove}
              className="text-xs text-red-500 hover:text-red-600 font-medium"
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
