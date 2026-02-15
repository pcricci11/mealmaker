import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { FamilyFavoriteMeal, MealPlan } from "@shared/types";
import { getFamilies, getFavoriteMeals, getMealPlanHistory } from "../api";

interface HistoryPlan {
  id: number;
  week_start: string;
  created_at: string;
  items: { day: string; recipe_name: string | null; meal_type: string }[];
}

function formatWeekRange(weekStart: string): string {
  const start = new Date(weekStart + "T00:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return "1 week ago";
  return `${weeks} weeks ago`;
}

const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DAY_LABELS: Record<string, string> = {
  monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday",
  thursday: "Thursday", friday: "Friday", saturday: "Saturday", sunday: "Sunday",
};

export default function MyRecipes() {
  const navigate = useNavigate();
  const [loved, setLoved] = useState<FamilyFavoriteMeal[]>([]);
  const [history, setHistory] = useState<HistoryPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const families = await getFamilies();
      const familyId = families[0]?.id;

      const [favs, plans] = await Promise.all([
        familyId ? getFavoriteMeals(familyId) : Promise.resolve([]),
        getMealPlanHistory(familyId),
      ]);

      setLoved(favs);
      setHistory(plans);
    } catch (err) {
      console.error("Error loading recipes data:", err);
    } finally {
      setLoading(false);
    }
  };

  // Derive recently-made recipes from history
  const recentRecipes: { name: string; lastMade: string }[] = [];
  const seen = new Set<string>();
  for (const plan of history) {
    for (const item of plan.items ?? []) {
      const name = item.recipe_name;
      if (!name || seen.has(name)) continue;
      seen.add(name);
      recentRecipes.push({ name, lastMade: plan.week_start || plan.created_at });
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-400">Loading...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-10 py-4">
      {/* ── Loved Recipes ── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
          <span className="text-base">❤️</span> Loved Recipes
        </h2>

        {loved.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-8 text-center text-gray-400 text-sm">
            No loved recipes yet. Start loving recipes from your meal plans!
          </div>
        ) : (
          <div className="space-y-2">
            {loved.map((fav) => (
              <div
                key={fav.id}
                className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center justify-between hover:shadow-sm transition-shadow"
              >
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">{fav.name}</p>
                  {fav.notes && (
                    <p className="text-sm text-gray-500 truncate mt-0.5">{fav.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                  {fav.frequency_preference && (
                    <span className="text-xs text-gray-400 capitalize">
                      {fav.frequency_preference.replace("_", "/")}
                    </span>
                  )}
                  {fav.recipe_url && (
                    <a
                      href={fav.recipe_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-600 text-sm font-medium hover:text-emerald-700"
                    >
                      View
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Recently Made ── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
          <span className="text-base">📅</span> Recently Made
        </h2>

        {recentRecipes.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-8 text-center text-gray-400 text-sm">
            No meal history yet. Generate your first plan!
          </div>
        ) : (
          <div className="space-y-2">
            {recentRecipes.slice(0, 12).map((r) => (
              <div
                key={r.name}
                className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center justify-between hover:shadow-sm transition-shadow"
              >
                <p className="font-medium text-gray-900 truncate">{r.name}</p>
                <span className="text-sm text-gray-400 shrink-0 ml-4">
                  {timeAgo(r.lastMade)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Past Meal Plans ── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
          <span className="text-base">🌟</span> Past Meal Plans
        </h2>

        {history.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-8 text-center text-gray-400 text-sm">
            No past plans yet.
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((plan) => {
              const mainNames = (plan.items ?? [])
                .filter((i) => i.meal_type === "main" && i.recipe_name)
                .map((i) => i.recipe_name!);
              const preview = mainNames.slice(0, 3).join(", ");
              const extra = mainNames.length > 3 ? ` +${mainNames.length - 3} more` : "";

              return (
                <div
                  key={plan.id}
                  className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center justify-between hover:shadow-sm transition-shadow"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">
                      {plan.week_start
                        ? formatWeekRange(plan.week_start)
                        : timeAgo(plan.created_at)}
                    </p>
                    {preview && (
                      <p className="text-sm text-gray-500 truncate mt-0.5">
                        {preview}{extra}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      const mainItems = (plan.items ?? [])
                        .filter((i) => i.meal_type === "main" && i.recipe_name)
                        .sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day));
                      const cookingDays = [...new Set(mainItems.map((i) => i.day))];
                      const dayParts = mainItems.map(
                        (i) => `${i.recipe_name} on ${DAY_LABELS[i.day] || i.day}`
                      );
                      const description =
                        `Cook ${cookingDays.map((d) => DAY_LABELS[d] || d).join(", ")}. ` +
                        `I want ${dayParts.join(", ")}.`;
                      navigate("/plan", { state: { prefill: description } });
                    }}
                    className="shrink-0 ml-4 text-sm font-medium text-emerald-600 hover:text-emerald-700 border border-emerald-200 rounded-lg px-3 py-1.5 hover:bg-emerald-50 transition-colors"
                  >
                    Reuse This Week
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
