// components/SideCard.tsx
// Display card for a single side dish

import type { MealPlanItemV3 } from "@shared/types";

interface Props {
  side: MealPlanItemV3;
  onSwap: () => void;
}

export default function SideCard({ side, onSwap }: Props) {
  // Parse side info from notes
  let sideName = "Side Dish";
  let sideCategory = null;

  if (side.notes) {
    try {
      const parsed = JSON.parse(side.notes);
      sideName = parsed.side_name || sideName;
      sideCategory = parsed.category || null;
    } catch (e) {
      // If notes aren't JSON, use as-is
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
        <button
          onClick={onSwap}
          className="ml-2 text-xs text-blue-600 hover:text-blue-700 font-medium shrink-0"
        >
          Swap
        </button>
      </div>
    </div>
  );
}
