// components/MealDayCard.tsx
// Display card for a single day with mains, lunches, and sides

import { useState } from "react";
import type { MealPlanItemV3, FamilyMemberV3, DayOfWeek } from "@shared/types";
import SideCard from "./SideCard";

interface Props {
  day: string;
  mains: MealPlanItemV3[];
  lunches: MealPlanItemV3[];
  sides: MealPlanItemV3[];
  members: FamilyMemberV3[];
  onSwapSide: (mealItemId: number, mainRecipeId: number) => void;
  onAddSide: (mainMealItemId: number) => void;
  onLoveMeal: (mealItemId: number) => void;
  onSwapMain: (mealItemId: number) => void;
  onRemoveSide?: (mealItemId: number) => void;
  onMealClick?: (item: MealPlanItemV3) => void;
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
  onLoveMeal,
  onSwapMain,
  onRemoveSide,
  onMealClick,
}: Props) {
  const [lovedMeals, setLovedMeals] = useState<Set<number>>(new Set());
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
        side.main_number === main.main_number ||
        (side.main_number === null && main.main_number === null)
    );
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Day Header */}
      <div
        className={`px-6 py-3 border-b ${
          isWeekend
            ? "bg-emerald-50 border-emerald-200"
            : "bg-gray-50 border-gray-200"
        }`}
      >
        <h3
          className={`font-bold ${
            isWeekend ? "text-emerald-700" : "text-gray-900"
          }`}
        >
          {DAY_LABELS[day]}
        </h3>
      </div>

      <div className="p-6 space-y-6">
        {/* Mains */}
        {mains.map((main) => {
          const cuisineClass =
            CUISINE_COLORS[main.recipe?.cuisine || ""] ||
            "bg-gray-100 text-gray-700";
          const mainSides = getSidesForMain(main);

          return (
            <div key={main.id} className="space-y-3">
              {/* Main Meal */}
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 relative">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div
                      className={`font-semibold text-lg text-gray-900${onMealClick ? " cursor-pointer hover:text-emerald-600 transition-colors" : ""}`}
                      onClick={onMealClick ? () => onMealClick(main) : undefined}
                    >
                      {main.recipe_name || "Unknown Recipe"}
                      {main.main_number && (
                        <span className="ml-2 text-sm text-gray-500">
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
                  <div className="flex items-center gap-2 ml-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSwapMain(main.id);
                      }}
                      className="text-xl hover:scale-110 transition-transform cursor-pointer"
                      title="Swap this meal"
                      type="button"
                    >
                      🔄
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        const newLoved = new Set(lovedMeals);
                        if (newLoved.has(main.id)) {
                          newLoved.delete(main.id);
                        } else {
                          newLoved.add(main.id);
                          onLoveMeal(main.id);
                        }
                        setLovedMeals(newLoved);
                      }}
                      className="text-xl hover:scale-110 transition-transform cursor-pointer"
                      title="Love this meal"
                      type="button"
                    >
                      {lovedMeals.has(main.id) ? '❤️' : '♡'}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className={`text-xs px-2 py-1 rounded-full ${cuisineClass}`}>
                    {main.recipe?.cuisine.replace("_", " ")}
                  </span>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      main.recipe?.vegetarian
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {main.recipe?.vegetarian ? "Vegetarian" : main.recipe?.protein_type}
                  </span>
                  <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                    {main.recipe?.cook_minutes} min
                  </span>
                  {main.recipe?.difficulty && (
                    <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                      {main.recipe.difficulty}
                    </span>
                  )}
                </div>
              </div>

              {/* Sides for this main */}
              {mainSides.length > 0 && (
                <div className="pl-4">
                  <div className="text-sm font-medium text-gray-600 mb-2">
                    Sides:
                  </div>
                  <div className="grid grid-cols-2 gap-2">
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
                <button
                  onClick={() => onAddSide(main.id)}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  + Add Another Side
                </button>
              </div>
            </div>
          );
        })}

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
                    <span className="text-xs px-2 py-0.5 bg-amber-200 text-amber-800 rounded">
                      Leftovers
                    </span>
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
      </div>
    </div>
  );
}
