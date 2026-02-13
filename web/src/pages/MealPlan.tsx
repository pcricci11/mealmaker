import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { Family, MealPlan as MealPlanType, MealPlanItem, DayOfWeek } from "@shared/types";
import { getFamilies, generateMealPlan, getMealPlan } from "../api";

const DAY_LABELS: Record<DayOfWeek, string> = {
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

export default function MealPlan() {
  const navigate = useNavigate();
  const [family, setFamily] = useState<Family | null>(null);
  const [plan, setPlan] = useState<MealPlanType | null>(null);
  const [locks, setLocks] = useState<Record<string, number>>({});
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getFamilies().then((families) => {
      if (families.length > 0) {
        setFamily(families[0]);
      }
    });
  }, []);

  const handleGenerate = async () => {
    if (!family) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await generateMealPlan(family.id, Object.keys(locks).length > 0 ? locks : undefined);
      setPlan(result);
      localStorage.setItem("lastPlanId", String(result.id));
      // Preserve locks
      const newLocks: Record<string, number> = {};
      for (const item of result.items) {
        if (locks[item.day]) {
          newLocks[item.day] = item.recipe_id;
        }
      }
      setLocks(newLocks);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const toggleLock = (item: MealPlanItem) => {
    setLocks((prev) => {
      const next = { ...prev };
      if (next[item.day]) {
        delete next[item.day];
      } else {
        next[item.day] = item.recipe_id;
      }
      return next;
    });
  };

  const swapMeal = async (day: DayOfWeek) => {
    if (!family || !plan) return;
    // Generate with all current meals locked EXCEPT this day
    const swapLocks: Record<string, number> = {};
    for (const item of plan.items) {
      if (item.day !== day) {
        swapLocks[item.day] = item.recipe_id;
      }
    }
    setGenerating(true);
    setError(null);
    try {
      const result = await generateMealPlan(family.id, swapLocks);
      setPlan(result);
      localStorage.setItem("lastPlanId", String(result.id));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  if (!family) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-4">No family profile found.</p>
        <button
          onClick={() => navigate("/profile")}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700"
        >
          Create Profile
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Meal Plan</h2>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="bg-emerald-600 text-white px-5 py-2 rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          {generating
            ? "Generating..."
            : plan
              ? "Regenerate Plan"
              : "Generate This Week's Plan"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {plan && (
        <>
          <p className="text-sm text-gray-500">
            Plan for <strong>{family.name}</strong> &middot; {Object.keys(locks).length} meals locked
          </p>

          <div className="space-y-3">
            {plan.items.map((item) => {
              const r = item.recipe!;
              const isLocked = !!locks[item.day];
              const cuisineClass = CUISINE_COLORS[r.cuisine] || "bg-gray-100 text-gray-700";
              const isWeekend = item.day === "saturday" || item.day === "sunday";

              return (
                <div
                  key={item.id}
                  className={`bg-white rounded-xl border p-4 flex items-start gap-4 ${
                    isLocked ? "border-emerald-400 ring-1 ring-emerald-200" : "border-gray-200"
                  }`}
                >
                  {/* Day */}
                  <div className="w-24 shrink-0">
                    <div className={`text-sm font-bold ${isWeekend ? "text-emerald-600" : "text-gray-700"}`}>
                      {DAY_LABELS[item.day as DayOfWeek]}
                    </div>
                  </div>

                  {/* Meal details */}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900">{r.name}</div>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${cuisineClass}`}>
                        {r.cuisine.replace("_", " ")}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        r.vegetarian ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                      }`}>
                        {r.vegetarian ? "veg" : r.protein_type}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {r.cook_minutes} min
                      </span>
                    </div>
                    {item.lunch_leftover_label && (
                      <div className="text-xs text-amber-600 mt-1">
                        {item.lunch_leftover_label}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => toggleLock(item)}
                      title={isLocked ? "Unlock meal" : "Lock meal"}
                      className={`p-2 rounded-lg text-sm transition-colors ${
                        isLocked
                          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      }`}
                    >
                      {isLocked ? "Locked" : "Lock"}
                    </button>
                    <button
                      onClick={() => swapMeal(item.day as DayOfWeek)}
                      disabled={generating}
                      className="p-2 rounded-lg text-sm bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:opacity-50 transition-colors"
                    >
                      Swap
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => navigate("/grocery")}
              className="bg-emerald-600 text-white px-5 py-2 rounded-lg font-medium hover:bg-emerald-700 transition-colors"
            >
              View Grocery List
            </button>
          </div>
        </>
      )}

      {!plan && !generating && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">Click &ldquo;Generate&rdquo; to create your weekly dinner plan.</p>
        </div>
      )}
    </div>
  );
}
