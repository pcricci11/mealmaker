// components/MealDayCard.tsx
// Display card for a single day with mains, lunches, and sides

import type { MealPlanItemV3, FamilyMemberV3 } from "@shared/types";
import SideCard from "./SideCard";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  day: string;
  mains: MealPlanItemV3[];
  lunches: MealPlanItemV3[];
  sides: MealPlanItemV3[];
  members: FamilyMemberV3[];
  onSwapSide: (mealItemId: number, mainRecipeId: number) => void;
  onAddSide: (mainMealItemId: number) => void;
  onSwapMain: (mealItemId: number) => void;
  onDeleteMain?: (mealItemId: number) => void;
  onRemoveSide?: (mealItemId: number) => void;
  onAddMain?: (day: string) => void;
  lovedItemIds?: Set<number>;
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

const CUISINE_COLORS: Record<string, string> = {
  american: "bg-blue-100 text-blue-700",
  italian: "bg-red-100 text-red-700",
  mexican: "bg-orange-100 text-orange-700",
  indian: "bg-yellow-100 text-yellow-700",
  chinese: "bg-rose-100 text-rose-700",
  japanese: "bg-pink-100 text-pink-700",
  thai: "bg-lime-100 text-lime-700",
  mediterranean: "bg-cyan-100 text-cyan-700",
  korean: "bg-purple-100 text-purple-700",
  french: "bg-indigo-100 text-indigo-700",
  middle_eastern: "bg-amber-100 text-amber-700",
  ethiopian: "bg-teal-100 text-teal-700",
};

export default function MealDayCard({
  day,
  mains,
  lunches,
  sides,
  members,
  onSwapSide,
  onAddSide,
  onSwapMain,
  onDeleteMain,
  onRemoveSide,
  onAddMain,
  lovedItemIds,
}: Props) {
  const isWeekend = day === "saturday" || day === "sunday";

  const getMembersForMain = (main: MealPlanItemV3) => {
    if (!main.assigned_member_ids) return "Everyone";

    const assignedMembers = members.filter((m) =>
      main.assigned_member_ids?.includes(m.id)
    );

    return assignedMembers.map((m) => m.name).join(", ");
  };

  const getSidesForMain = (main: MealPlanItemV3) => {
    return sides.filter(
      (side) =>
        side.parent_meal_item_id === main.id ||
        (side.parent_meal_item_id === null && (
          side.main_number === main.main_number ||
          (side.main_number === null && main.main_number === null)
        ))
    );
  };

  return (
    <Card className="overflow-hidden">
      {/* Day Header */}
      <CardHeader
        className={cn(
          "px-4 md:px-6 py-3 border-b",
          isWeekend
            ? "bg-amber-50 border-amber-200"
            : "bg-gray-50 border-gray-200"
        )}
      >
        <h3
          className={cn(
            "font-bold",
            isWeekend ? "text-amber-700" : "text-gray-900"
          )}
        >
          {DAY_LABELS[day]}
        </h3>
      </CardHeader>

      <CardContent className="p-4 md:p-6 space-y-4 md:space-y-6">
        {/* Mains */}
        {mains.map((main) => {
          const cuisineClass =
            CUISINE_COLORS[main.recipe?.cuisine || ""] ||
            "bg-gray-100 text-gray-700";
          const mainSides = getSidesForMain(main);

          return (
            <div key={main.id} className="space-y-3">
              {/* Main Meal */}
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 relative group/card">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-lg flex items-center gap-1.5">
                      {main.recipe?.source_url ? (
                        <a
                          href={main.recipe.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-900 hover:underline cursor-pointer truncate"
                        >
                          {main.recipe_name || "Unknown Recipe"}
                        </a>
                      ) : (
                        <span className="text-gray-900 truncate">
                          {main.recipe_name || "Unknown Recipe"}
                        </span>
                      )}
                      {lovedItemIds?.has(main.id) && (
                        <span className="text-red-500 text-sm shrink-0" title="Loved">&#9829;</span>
                      )}
                      {main.recipe?.source_url && (
                        <a
                          href={main.recipe.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-orange-500 hover:text-orange-600 shrink-0"
                          title="View Recipe"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      )}
                      {main.main_number && (
                        <span className="text-sm text-gray-500 shrink-0">
                          (Main {main.main_number})
                        </span>
                      )}
                    </div>
                    {main.assigned_member_ids && (
                      <div className="text-sm text-gray-600 mt-1">
                        For: {getMembersForMain(main)}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-2 shrink-0 md:opacity-0 md:group-hover/card:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSwapMain(main.id);
                      }}
                      className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-orange-500 hover:bg-orange-50 transition-colors cursor-pointer"
                      title="Swap this meal"
                      type="button"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                    {onDeleteMain && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onDeleteMain(main.id); }}
                        className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                        title="Remove this meal"
                        type="button"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className={cn("border-0", cuisineClass)}>
                    {main.recipe?.cuisine.replace("_", " ")}
                  </Badge>
                  {main.recipe?.vegetarian && (
                    <Badge variant="outline" className="bg-green-100 text-green-700 border-0">
                      Vegetarian
                    </Badge>
                  )}
                  {main.recipe?.difficulty && (
                    <Badge variant="secondary">
                      {main.recipe.difficulty}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Sides for this main */}
              {mainSides.length > 0 && (
                <div className="pl-4">
                  <div className="text-sm font-medium text-gray-600 mb-2">
                    Sides:
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {mainSides.map((side) => (
                      <SideCard
                        key={side.id}
                        side={side}
                        onSwap={() => onSwapSide(side.id, main.recipe_id!)}
                        onRemove={onRemoveSide ? () => onRemoveSide(side.id) : undefined}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Add Side Button */}
              <div className="pl-4">
                <Button
                  variant="link"
                  onClick={() => onAddSide(main.id)}
                  className="h-auto p-0 text-sm text-blue-600 hover:text-blue-700"
                >
                  + Add Another Side
                </Button>
              </div>
            </div>
          );
        })}

        {/* Add Another Main */}
        {onAddMain && (
          <Button
            variant="link"
            onClick={() => onAddMain(day)}
            className="h-auto p-0 text-sm"
          >
            + Add Another Main
          </Button>
        )}

        {/* Lunches */}
        {lunches.length > 0 && (
          <div className="border-t pt-4">
            <div className="text-sm font-semibold text-gray-600 mb-2">
              Lunches:
            </div>
            {lunches.map((lunch) => (
              <div
                key={lunch.id}
                className="border border-amber-200 bg-amber-50 rounded-lg p-3"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {lunch.recipe_name || "Lunch"}
                  </span>
                  {lunch.notes && lunch.notes.includes("Leftovers") && (
                    <Badge variant="secondary" className="bg-amber-200 text-amber-800">
                      Leftovers
                    </Badge>
                  )}
                  {lunch.assigned_member_ids && (
                    <span className="text-xs text-gray-600">
                      (
                      {members
                        .filter((m) => lunch.assigned_member_ids?.includes(m.id))
                        .map((m) => m.name)
                        .join(", ")}
                      )
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
