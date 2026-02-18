import type { Recipe } from "@shared/types";
import { CUISINE_COLORS } from "./SwapMainModal";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface PendingConfirmation {
  day: string;
  description: string;
  matches: Array<{ recipe: Recipe; score: number; reasoning?: string }>;
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
  const hasReasoning = matches.some((m) => m.reasoning);

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent className="flex flex-col">
        {/* Header */}
        <div className="px-4 md:px-6 pt-6 pb-3">
          <div className="flex items-center gap-2">
            {day && (
              <span className="text-xs font-semibold uppercase tracking-wide text-orange-600 bg-orange-50 px-2 py-0.5 rounded">
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
            <span className="text-lg">{hasReasoning ? "✨" : "📖"}</span>
            <span className="text-sm font-medium text-orange-800">
              {hasReasoning
                ? "AI picked these based on your family:"
                : "Found these in your collection:"}
            </span>
          </div>
          <div className="space-y-2">
            {matches.map(({ recipe, score, reasoning }, i) => {
              const cuisineClass =
                CUISINE_COLORS[recipe.cuisine] || "bg-gray-100 text-gray-700";
              const pct = Math.round(score * 100);
              return (
                <button
                  key={recipe.id}
                  onClick={() => onSelectRecipe(recipe)}
                  className="w-full bg-white rounded-lg border border-orange-200 p-4 hover:border-orange-500 hover:bg-orange-50 transition-colors text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold text-gray-900">{recipe.title}</div>
                    <span className="text-xs font-medium text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
                      {pct}% match
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <Badge variant="outline" className={cn("border-0", cuisineClass)}>
                      {recipe.cuisine.replace("_", " ")}
                    </Badge>
                    <Badge variant="secondary">
                      {recipe.cook_minutes} min
                    </Badge>
                    {recipe.difficulty && (
                      <Badge variant="secondary">
                        {recipe.difficulty}
                      </Badge>
                    )}
                    {recipe.vegetarian && (
                      <Badge variant="outline" className="bg-green-100 text-green-700 border-0">
                        Vegetarian
                      </Badge>
                    )}
                  </div>
                  {recipe.source_name && (
                    <div className="text-xs text-gray-500 mt-2">
                      by {recipe.source_name}
                    </div>
                  )}
                  {reasoning && (
                    <div className="text-xs italic text-gray-400 mt-2">
                      {reasoning}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <DialogFooter>
          <Button variant="outline" className="w-full" onClick={onSearchWeb}>
            None of These — Search Web
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
