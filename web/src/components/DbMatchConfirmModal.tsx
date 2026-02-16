import type { Recipe } from "@shared/types";
import { CUISINE_COLORS } from "./SwapMainModal";

interface PendingConfirmation {
  day: string;
  description: string;
  matches: Array<{ recipe: Recipe; score: number }>;
}

interface Props {
  confirmation: PendingConfirmation;
  stepLabel?: string;
  onSelectRecipe: (recipe: Recipe) => void;
  onSearchWeb: () => void;
}

const DAY_LABELS: Record<string, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

export type { PendingConfirmation };

export default function DbMatchConfirmModal({
  confirmation,
  stepLabel,
  onSelectRecipe,
  onSearchWeb,
}: Props) {
  const { day, description, matches } = confirmation;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-0 md:p-4 z-50">
      <div className="bg-white rounded-none md:rounded-xl max-w-md w-full h-full md:h-auto md:max-h-[80vh] mx-0 md:mx-4 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 md:px-6 pt-6 pb-3">
          <div className="flex items-center gap-2">
            {day && (
              <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                {DAY_LABELS[day] || day}
              </span>
            )}
            {stepLabel && (
              <span className="text-xs text-gray-400">
                Recipe {stepLabel}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-2">
            You asked for: <span className="font-medium text-gray-700">{description}</span>
          </p>
        </div>

        {/* Match cards */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">📖</span>
            <span className="text-sm font-medium text-emerald-800">
              Found these in your collection:
            </span>
          </div>
          <div className="space-y-2">
            {matches.map(({ recipe, score }, i) => {
              const cuisineClass =
                CUISINE_COLORS[recipe.cuisine] || "bg-gray-100 text-gray-700";
              const pct = Math.round(score * 100);
              return (
                <button
                  key={recipe.id}
                  onClick={() => onSelectRecipe(recipe)}
                  className="w-full bg-white rounded-lg border border-emerald-200 p-4 hover:border-emerald-500 hover:bg-emerald-50 transition-colors text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold text-gray-900">{recipe.title}</div>
                    <span className="text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
                      {pct}% match
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${cuisineClass}`}>
                      {recipe.cuisine.replace("_", " ")}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {recipe.cook_minutes} min
                    </span>
                    {recipe.difficulty && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {recipe.difficulty}
                      </span>
                    )}
                    {recipe.vegetarian && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                        Vegetarian
                      </span>
                    )}
                  </div>
                  {recipe.source_name && (
                    <div className="text-xs text-gray-500 mt-2">
                      by {recipe.source_name}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-4 md:px-6 py-4">
          <button
            onClick={onSearchWeb}
            className="w-full px-4 py-3 md:py-2.5 text-gray-600 hover:text-gray-900 font-medium text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            None of These — Search Web
          </button>
        </div>
      </div>
    </div>
  );
}
