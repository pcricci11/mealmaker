import type { Recipe } from "@shared/types";
import { CUISINE_COLORS } from "./SwapMainModal";

interface PendingConfirmation {
  day: string;
  description: string;
  recipe: Recipe;
  score: number;
}

interface Props {
  confirmation: PendingConfirmation;
  stepLabel?: string;
  onUseThis: () => void;
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
  onUseThis,
  onSearchWeb,
}: Props) {
  const { day, description, recipe, score } = confirmation;
  const cuisineClass =
    CUISINE_COLORS[recipe.cuisine] || "bg-gray-100 text-gray-700";
  const isExact = score >= 1.0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-0 md:p-4 z-50">
      <div className="bg-white rounded-none md:rounded-xl max-w-md w-full mx-0 md:mx-4 p-6 space-y-5">
        {/* Header */}
        <div>
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

        {/* Match card */}
        <div className="border border-emerald-200 bg-emerald-50 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">📖</span>
            <span className="text-sm font-medium text-emerald-800">
              {isExact ? "Found an exact match!" : "Found this in your collection:"}
            </span>
          </div>
          <div className="bg-white rounded-lg border border-emerald-200 p-4">
            <div className="font-semibold text-gray-900">{recipe.title}</div>
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
          </div>
          {!isExact && (
            <div className="text-xs text-emerald-600">
              {Math.round(score * 100)}% match confidence
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <button
            onClick={onUseThis}
            className="w-full px-4 py-3 md:py-2.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors"
          >
            Use This Recipe
          </button>
          <button
            onClick={onSearchWeb}
            className="w-full px-4 py-3 md:py-2.5 text-gray-600 hover:text-gray-900 font-medium text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Search Web Instead
          </button>
        </div>
      </div>
    </div>
  );
}
