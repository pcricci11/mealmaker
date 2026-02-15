import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { generateFromConversation, generateMealPlanV3, getFamilies, markMealAsLoved } from "../api";
import type { DayOfWeek } from "@shared/types";

interface PlanItem {
  id: number;
  day: string;
  recipe_id: number | null;
  meal_type: string;
  recipe_name: string | null;
  cuisine: string | null;
  vegetarian: boolean;
  cook_minutes: number | null;
  makes_leftovers: boolean;
  kid_friendly: boolean;
  notes: any;
}

interface GeneratedPlan {
  id: number;
  week_start: string;
  items: PlanItem[];
}

const DAYS = [
  { key: "monday", label: "Mon" },
  { key: "tuesday", label: "Tue" },
  { key: "wednesday", label: "Wed" },
  { key: "thursday", label: "Thu" },
  { key: "friday", label: "Fri" },
  { key: "saturday", label: "Sat" },
  { key: "sunday", label: "Sun" },
];

export default function Plan() {
  const navigate = useNavigate();
  const location = useLocation();
  const [input, setInput] = useState((location.state as any)?.prefill || "");
  const [plan, setPlan] = useState<GeneratedPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lovedIds, setLovedIds] = useState<Set<number>>(new Set());

  const handleGenerate = async () => {
    if (!input.trim()) return;

    setLoading(true);
    setError(null);
    try {
      // Step 1: Parse conversational input
      const parsed = await generateFromConversation(input.trim());

      // Get default family
      const families = await getFamilies();
      const familyId = families[0]?.id;
      if (!familyId) throw new Error("No family found. Please create a family first.");

      // Compute next Monday as week_start
      const today = new Date();
      const dayOfWeek = today.getDay();
      const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek) % 7 || 7;
      const nextMonday = new Date(today);
      nextMonday.setDate(today.getDate() + daysUntilMonday);
      const weekStart = nextMonday.toISOString().split("T")[0];

      // Map parsed data to V3 request
      const days: DayOfWeek[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
      const cookingSchedule = days.map((day) => ({
        family_id: familyId,
        week_start: weekStart,
        day,
        is_cooking: parsed.cooking_days[day]?.is_cooking ?? true,
        meal_mode: (parsed.cooking_days[day]?.meal_mode || "one_main") as "one_main" | "customize_mains",
      }));

      const lunchNeeds: Array<{
        family_id: number;
        week_start: string;
        member_id: number;
        day: "monday" | "tuesday" | "wednesday" | "thursday" | "friday";
        needs_lunch: boolean;
        leftovers_ok: boolean;
      }> = [];
      const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
      for (const [memberId, memberDays] of Object.entries(parsed.lunch_needs)) {
        for (const d of memberDays) {
          if (weekdays.includes(d as any)) {
            lunchNeeds.push({
              family_id: familyId,
              week_start: weekStart,
              member_id: Number(memberId),
              day: d as "monday" | "tuesday" | "wednesday" | "thursday" | "friday",
              needs_lunch: true,
              leftovers_ok: true,
            });
          }
        }
      }

      // Step 2: Generate the meal plan
      const result = await generateMealPlanV3({
        family_id: familyId,
        week_start: weekStart,
        cooking_schedule: cookingSchedule,
        lunch_needs: lunchNeeds,
        max_cook_minutes_weekday: parsed.cook_time_limits.weekday,
        max_cook_minutes_weekend: parsed.cook_time_limits.weekend,
        vegetarian_ratio: parsed.dietary_preferences.vegetarian_ratio,
        specific_meals: parsed.specific_meals,
      });

      setPlan({ id: result.id, week_start: result.week_start || weekStart, items: (result.items || []) as any });
      localStorage.setItem("lastPlanId", String(result.id));
      localStorage.setItem("lastMealPlanId", String(result.id));
    } catch (err: any) {
      setError(err.message || "Failed to generate plan");
    } finally {
      setLoading(false);
    }
  };

  const handleLove = async (itemId: number) => {
    try {
      const result = await markMealAsLoved(itemId);
      setLovedIds((prev) => {
        const next = new Set(prev);
        if (result.loved === false) {
          next.delete(itemId);
        } else {
          next.add(itemId);
        }
        return next;
      });
    } catch (err) {
      console.error("Failed to love meal:", err);
    }
  };

  // Group plan items by day
  const dayData = plan
    ? DAYS.map(({ key, label }) => {
        const items = (plan.items || []).filter((i) => i.day === key);
        const mains = items.filter((i) => i.meal_type === "main");
        const sides = items.filter((i) => i.meal_type === "side");
        const lunches = items.filter((i) => i.meal_type === "lunch");
        return { key, label, mains, sides, lunches, hasMeals: items.length > 0 };
      })
    : null;

  return (
    <div className="max-w-2xl mx-auto space-y-8 py-4">
      {/* Welcome message */}
      {!plan && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 space-y-4 text-gray-700 leading-relaxed text-[15px]">
          <p>
            What are you thinking about this week? What nights are you thinking of
            cooking? Do you already know what meals you want to make?
          </p>
          <p>
            I can pull your favorite recipes from the web or pull from your own
            recipes, or both! Based on your profile, I'll suggest meals you might
            want to make. I'll keep track of the recipes you love, and keep a
            record of all the meals you make.
          </p>
          <p className="font-semibold text-emerald-800">
            Shall we get started?
          </p>
        </div>
      )}

      {/* Text input */}
      <div className="space-y-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. We're cooking Monday, Wednesday, and Friday this week. I'd love to try something with salmon..."
          rows={plan ? 3 : 5}
          disabled={loading}
          className="w-full rounded-2xl border border-gray-300 px-5 py-4 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none text-[15px] leading-relaxed shadow-sm disabled:opacity-50"
        />
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => alert("Voice input coming soon!")}
          disabled={loading}
          className="px-5 py-3.5 rounded-xl border border-gray-300 text-gray-600 font-medium hover:bg-gray-100 transition-colors shadow-sm disabled:opacity-50"
        >
          🎤 Voice
        </button>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading || !input.trim()}
          className="flex-1 px-5 py-3.5 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors shadow-sm text-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Generating..." : "✨ Generate My Week"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            Your Week
          </h3>
          <div className="grid grid-cols-7 gap-2">
            {DAYS.map(({ label }) => (
              <div
                key={label}
                className="bg-white border border-gray-200 rounded-xl p-4 text-center min-h-[140px] flex flex-col items-center justify-center animate-pulse"
              >
                <span className="text-xs font-semibold text-gray-400 uppercase">
                  {label}
                </span>
                <div className="mt-3 space-y-2 w-full px-1">
                  <div className="h-3 bg-gray-200 rounded w-full" />
                  <div className="h-2 bg-gray-100 rounded w-3/4 mx-auto" />
                </div>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-gray-400">
            Talking to the chef... picking recipes... setting the table...
          </p>
        </div>
      )}

      {/* Empty grid (no plan yet, not loading) */}
      {!plan && !loading && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            Your Week
          </h3>
          <div className="grid grid-cols-7 gap-2">
            {DAYS.map(({ label }) => (
              <div
                key={label}
                className="bg-white border border-dashed border-gray-300 rounded-xl p-4 text-center min-h-[120px] flex flex-col items-center justify-center"
              >
                <span className="text-xs font-semibold text-gray-400 uppercase">
                  {label}
                </span>
                <span className="text-gray-300 text-2xl mt-2">+</span>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-gray-400">
            Tell me about your week and hit Generate to fill this in
          </p>
        </div>
      )}

      {/* Generated plan grid */}
      {plan && !loading && dayData && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              Your Week — {plan.week_start}
            </h3>
            <button
              onClick={() => navigate("/grocery")}
              className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
            >
              View Grocery List →
            </button>
          </div>

          <div className="grid grid-cols-7 gap-2">
            {dayData.map(({ key, label, mains, sides, lunches, hasMeals }) => (
              <div
                key={key}
                className={`rounded-xl p-3 min-h-[160px] flex flex-col ${
                  hasMeals
                    ? "bg-white border border-gray-200"
                    : "bg-gray-50 border border-dashed border-gray-300"
                }`}
              >
                <span className="text-xs font-semibold text-gray-400 uppercase text-center">
                  {label}
                </span>

                {!hasMeals && (
                  <div className="flex-1 flex items-center justify-center">
                    <span className="text-xs text-gray-300 italic">Off</span>
                  </div>
                )}

                {/* Mains */}
                {mains.map((item) => (
                  <div key={item.id} className="mt-2 space-y-1">
                    <p className="text-xs font-medium text-gray-900 leading-tight">
                      {item.recipe_name || "—"}
                    </p>
                    {item.cook_minutes && (
                      <p className="text-[10px] text-gray-400">
                        {item.cook_minutes}min
                        {item.vegetarian && " · 🌿"}
                        {item.makes_leftovers && " · 📦"}
                      </p>
                    )}
                    <div className="flex gap-1 mt-1">
                      <button
                        onClick={() => handleLove(item.id)}
                        className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                          lovedIds.has(item.id)
                            ? "bg-red-100 text-red-500"
                            : "hover:bg-gray-100 text-gray-400"
                        }`}
                        title="Love this recipe"
                      >
                        {lovedIds.has(item.id) ? "❤️" : "🤍"}
                      </button>
                      <button
                        onClick={() => alert("Swap coming soon!")}
                        className="text-xs px-1.5 py-0.5 rounded text-gray-400 hover:bg-gray-100 transition-colors"
                        title="Swap recipe"
                      >
                        🔄
                      </button>
                    </div>
                  </div>
                ))}

                {/* Sides */}
                {sides.map((item) => {
                  const sideName =
                    item.recipe_name ||
                    (typeof item.notes === "object" ? item.notes?.side_name : null) ||
                    "Side";
                  return (
                    <p
                      key={item.id}
                      className="text-[10px] text-gray-500 mt-1 italic"
                    >
                      + {sideName}
                    </p>
                  );
                })}

                {/* Lunches */}
                {lunches.length > 0 && (
                  <div className="mt-auto pt-2 border-t border-gray-100">
                    {lunches.map((item) => (
                      <p
                        key={item.id}
                        className="text-[10px] text-amber-600"
                      >
                        🥪 {item.recipe_name || "Leftovers"}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Regenerate hint */}
          <p className="text-center text-sm text-gray-400">
            Not quite right? Edit your description above and generate again.
          </p>
        </div>
      )}
    </div>
  );
}
