import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { Recipe, FamilyFavoriteMeal } from "@shared/types";
import {
  getFamilies, getFavoriteMeals, getMealPlanHistory, getRecipes,
  addMealToDay, deleteFavoriteMeal, getSideSuggestions, addSide,
  deleteRecipe, deleteGenericRecipes,
} from "../api";
import { CUISINE_COLORS } from "../components/SwapMainModal";

interface HistoryPlan {
  id: number;
  week_start: string;
  created_at: string;
  items: { day: string; recipe_name: string | null; meal_type: string }[];
}

type SortOption = "recent" | "alpha" | "cook_time" | "loved";

const CUISINE_FILTERS = [
  "italian", "mexican", "american", "indian", "chinese",
  "japanese", "thai", "mediterranean", "korean", "french",
] as const;

const PROTEIN_FILTERS = [
  { label: "Chicken", value: "chicken" },
  { label: "Beef", value: "beef" },
  { label: "Fish", value: "fish" },
  { label: "Pork", value: "pork" },
  { label: "Veggie", value: null },
] as const;

const COOK_TIME_FILTERS = [
  { label: "Under 30min", min: 0, max: 29 },
  { label: "30–60min", min: 30, max: 60 },
  { label: "60+ min", min: 61, max: Infinity },
] as const;

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
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loved, setLoved] = useState<FamilyFavoriteMeal[]>([]);
  const [history, setHistory] = useState<HistoryPlan[]>([]);
  const [loading, setLoading] = useState(true);

  // Expandable card actions state
  const [expandedRecipeId, setExpandedRecipeId] = useState<number | null>(null);
  const [addingToDay, setAddingToDay] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [removingLoved, setRemovingLoved] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Recipe | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);

  // Search & filter state
  const [search, setSearch] = useState("");
  const [cuisineFilter, setCuisineFilter] = useState<string | null>(null);
  const [proteinFilter, setProteinFilter] = useState<string | "veggie" | null>(null);
  const [cookTimeFilter, setCookTimeFilter] = useState<typeof COOK_TIME_FILTERS[number] | null>(null);
  const [vegetarianOnly, setVegetarianOnly] = useState(false);
  const [sort, setSort] = useState<SortOption>("recent");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const families = await getFamilies();
      const familyId = families[0]?.id;

      const [favs, plans, allRecipes] = await Promise.all([
        familyId ? getFavoriteMeals(familyId) : Promise.resolve([]),
        getMealPlanHistory(familyId),
        getRecipes(),
      ]);

      setLoved(favs);
      setHistory(plans);
      setRecipes(allRecipes);
    } catch (err) {
      console.error("Error loading recipes data:", err);
    } finally {
      setLoading(false);
    }
  };

  const DAY_CHIPS = [
    { key: "monday", label: "Mon" },
    { key: "tuesday", label: "Tue" },
    { key: "wednesday", label: "Wed" },
    { key: "thursday", label: "Thu" },
    { key: "friday", label: "Fri" },
    { key: "saturday", label: "Sat" },
    { key: "sunday", label: "Sun" },
  ] as const;

  const showToast = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleAddToDay = async (recipe: Recipe, day: string) => {
    const currentPlanId = localStorage.getItem("currentPlanId");
    if (!currentPlanId) {
      showToast("Generate a plan first");
      return;
    }
    setAddingToDay(day);
    try {
      const { id: newItemId } = await addMealToDay(parseInt(currentPlanId), day, recipe.id);
      // Try to add auto-suggested sides (optional)
      try {
        const sides = await getSideSuggestions(recipe.id);
        for (const side of sides.slice(0, 2)) {
          await addSide(newItemId, side.id);
        }
      } catch (err) {
        console.warn("Side suggestions failed (main still added):", err);
      }
      showToast(`Added ${recipe.title} to ${DAY_LABELS[day] || day}`);
      setExpandedRecipeId(null);
    } catch (err: any) {
      showToast(err.message || "Failed to add meal");
    } finally {
      setAddingToDay(null);
    }
  };

  const handleRemoveLoved = async (recipe: Recipe) => {
    const fav = loved.find(
      (f) => f.name.toLowerCase() === recipe.title.toLowerCase(),
    );
    if (!fav) return;
    setRemovingLoved(recipe.id);
    try {
      await deleteFavoriteMeal(fav.id);
      setLoved((prev) => prev.filter((f) => f.id !== fav.id));
    } catch (err) {
      console.error("Failed to remove loved:", err);
    } finally {
      setRemovingLoved(null);
    }
  };

  const handleDeleteRecipe = async (recipe: Recipe) => {
    setDeleting(true);
    try {
      await deleteRecipe(recipe.id);
      setRecipes((prev) => prev.filter((r) => r.id !== recipe.id));
      // Also remove from loved if applicable
      const fav = loved.find((f) => f.name.toLowerCase() === recipe.title.toLowerCase());
      if (fav) {
        try { await deleteFavoriteMeal(fav.id); } catch {}
        setLoved((prev) => prev.filter((f) => f.id !== fav.id));
      }
      showToast(`Deleted "${recipe.title}"`);
    } catch (err: any) {
      showToast(err.message || "Failed to delete recipe");
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  };

  const handleCleanUpGeneric = async () => {
    setCleaningUp(true);
    try {
      const { deleted } = await deleteGenericRecipes();
      if (deleted > 0) {
        const updated = await getRecipes();
        setRecipes(updated);
        showToast(`Removed ${deleted} generic recipe${deleted !== 1 ? "s" : ""}`);
      } else {
        showToast("No generic recipes to remove");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to clean up");
    } finally {
      setCleaningUp(false);
    }
  };

  const genericCount = useMemo(
    () => recipes.filter((r) => !r.source_url).length,
    [recipes],
  );

  // Build lookup maps from history for sorting
  const { recencyMap, frequencyMap } = useMemo(() => {
    const recency = new Map<string, string>(); // recipe title -> most recent week_start
    const frequency = new Map<string, number>(); // recipe title -> count
    for (const plan of history) {
      for (const item of plan.items ?? []) {
        const name = item.recipe_name;
        if (!name) continue;
        // Recency: keep the latest date
        const date = plan.week_start || plan.created_at;
        if (!recency.has(name) || date > recency.get(name)!) {
          recency.set(name, date);
        }
        frequency.set(name, (frequency.get(name) || 0) + 1);
      }
    }
    return { recencyMap: recency, frequencyMap: frequency };
  }, [history]);

  // Loved recipe names for the "loved" sort
  const lovedNames = useMemo(
    () => new Set(loved.map((f) => f.name.toLowerCase())),
    [loved],
  );

  // Filter & sort recipes
  const filteredRecipes = useMemo(() => {
    let result = recipes;

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((r) => {
        const ingredientNames = (r.ingredients || []).map((i) => i.name.toLowerCase()).join(" ");
        return (
          r.title.toLowerCase().includes(q) ||
          r.cuisine.toLowerCase().includes(q) ||
          (r.source_name || "").toLowerCase().includes(q) ||
          (r.protein_type || "").toLowerCase().includes(q) ||
          ingredientNames.includes(q)
        );
      });
    }

    // Cuisine filter
    if (cuisineFilter) {
      result = result.filter((r) => r.cuisine === cuisineFilter);
    }

    // Protein filter
    if (proteinFilter === "veggie") {
      result = result.filter((r) => r.vegetarian);
    } else if (proteinFilter) {
      result = result.filter(
        (r) => r.protein_type?.toLowerCase() === proteinFilter,
      );
    }

    // Vegetarian only
    if (vegetarianOnly) {
      result = result.filter((r) => r.vegetarian);
    }

    // Cook time filter
    if (cookTimeFilter) {
      result = result.filter(
        (r) => r.cook_minutes >= cookTimeFilter.min && r.cook_minutes <= cookTimeFilter.max,
      );
    }

    // Sort
    result = [...result].sort((a, b) => {
      switch (sort) {
        case "recent": {
          const aDate = recencyMap.get(a.title) || "";
          const bDate = recencyMap.get(b.title) || "";
          if (bDate !== aDate) return bDate.localeCompare(aDate);
          return a.title.localeCompare(b.title);
        }
        case "loved": {
          const aLoved = lovedNames.has(a.title.toLowerCase()) ? 1 : 0;
          const bLoved = lovedNames.has(b.title.toLowerCase()) ? 1 : 0;
          if (bLoved !== aLoved) return bLoved - aLoved;
          const aFreq = frequencyMap.get(a.title) || 0;
          const bFreq = frequencyMap.get(b.title) || 0;
          if (bFreq !== aFreq) return bFreq - aFreq;
          return a.title.localeCompare(b.title);
        }
        case "alpha":
          return a.title.localeCompare(b.title);
        case "cook_time":
          return a.cook_minutes - b.cook_minutes;
        default:
          return 0;
      }
    });

    return result;
  }, [recipes, search, cuisineFilter, proteinFilter, vegetarianOnly, cookTimeFilter, sort, recencyMap, frequencyMap, lovedNames]);

  const hasActiveFilters = !!(search || cuisineFilter || proteinFilter || vegetarianOnly || cookTimeFilter);

  // Derive recently-made recipes from history (for the section below)
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
      {/* ── Recipe Collection with Search/Filter/Sort ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            My Recipe Collection
            <span className="ml-2 text-gray-300 font-normal normal-case">
              {recipes.length} recipes
            </span>
          </h2>
          {genericCount > 0 && (
            <button
              onClick={handleCleanUpGeneric}
              disabled={cleaningUp}
              className="text-xs text-gray-400 hover:text-red-500 font-medium transition-colors disabled:opacity-50"
            >
              {cleaningUp ? "Cleaning up..." : `Clean up ${genericCount} generic recipe${genericCount !== 1 ? "s" : ""}`}
            </button>
          )}
        </div>

        {/* Search bar */}
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your recipes..."
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter chips */}
        <div className="space-y-2">
          {/* Cuisine */}
          <div className="flex flex-wrap gap-1.5">
            {CUISINE_FILTERS.map((c) => (
              <button
                key={c}
                onClick={() => setCuisineFilter(cuisineFilter === c ? null : c)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  cuisineFilter === c
                    ? (CUISINE_COLORS[c] || "bg-emerald-100 text-emerald-700")
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {c.replace("_", " ")}
              </button>
            ))}
          </div>

          {/* Protein + Dietary */}
          <div className="flex flex-wrap gap-1.5">
            {PROTEIN_FILTERS.map((p) => (
              <button
                key={p.label}
                onClick={() => setProteinFilter(
                  proteinFilter === (p.value ?? "veggie") ? null : (p.value ?? "veggie"),
                )}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  proteinFilter === (p.value ?? "veggie")
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={() => setVegetarianOnly(!vegetarianOnly)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                vegetarianOnly
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              Vegetarian
            </button>
          </div>

          {/* Cook time */}
          <div className="flex flex-wrap gap-1.5">
            {COOK_TIME_FILTERS.map((ct) => (
              <button
                key={ct.label}
                onClick={() => setCookTimeFilter(cookTimeFilter === ct ? null : ct)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  cookTimeFilter === ct
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {ct.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sort + Clear filters */}
        <div className="flex items-center justify-between">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="recent">Most recently made</option>
            <option value="loved">Most loved / frequent</option>
            <option value="alpha">Alphabetical</option>
            <option value="cook_time">Shortest cook time</option>
          </select>

          {hasActiveFilters && (
            <button
              onClick={() => {
                setSearch("");
                setCuisineFilter(null);
                setProteinFilter(null);
                setVegetarianOnly(false);
                setCookTimeFilter(null);
              }}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Clear all filters
            </button>
          )}
        </div>

        {/* Recipe list */}
        {filteredRecipes.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-8 text-center text-gray-400 text-sm">
            {hasActiveFilters
              ? "No recipes match your filters. Try broadening your search."
              : "No recipes yet. Add some from your meal plans!"}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-gray-400">
              {filteredRecipes.length === recipes.length
                ? `${recipes.length} recipes`
                : `${filteredRecipes.length} of ${recipes.length} recipes`}
            </p>
            {filteredRecipes.map((r) => {
              const cuisineClass =
                CUISINE_COLORS[r.cuisine] || "bg-gray-100 text-gray-700";
              const isLoved = lovedNames.has(r.title.toLowerCase());
              const lastMade = recencyMap.get(r.title);
              const isExpanded = expandedRecipeId === r.id;
              return (
                <div
                  key={r.id}
                  className={`bg-white border rounded-xl px-5 py-4 transition-shadow cursor-pointer ${
                    isExpanded ? "border-emerald-300 shadow-sm" : "border-gray-200 hover:shadow-sm"
                  }`}
                  onClick={() => setExpandedRecipeId(isExpanded ? null : r.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {isLoved && <span className="mr-1">❤️</span>}
                        {r.title}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${cuisineClass}`}>
                          {r.cuisine.replace("_", " ")}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {r.cook_minutes} min
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {r.difficulty}
                        </span>
                        {r.vegetarian && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                            Vegetarian
                          </span>
                        )}
                        {r.protein_type && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                            {r.protein_type}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end shrink-0 gap-1">
                      {lastMade && (
                        <span className="text-xs text-gray-400">
                          {timeAgo(lastMade)}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">
                        {isExpanded ? "▲" : "▼"}
                      </span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div
                      className="mt-3 pt-3 border-t border-gray-100 space-y-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Day picker */}
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1.5">Add to this week:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {DAY_CHIPS.map(({ key, label }) => (
                            <button
                              key={key}
                              disabled={addingToDay !== null}
                              onClick={() => handleAddToDay(r, key)}
                              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                                addingToDay === key
                                  ? "bg-emerald-200 text-emerald-800 animate-pulse"
                                  : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                              {addingToDay === key ? "..." : label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Actions row */}
                      <div className="flex items-center gap-3">
                        {r.source_url && (
                          <a
                            href={r.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                          >
                            View Recipe
                          </a>
                        )}
                        {isLoved && (
                          <button
                            disabled={removingLoved === r.id}
                            onClick={() => handleRemoveLoved(r)}
                            className="text-xs text-red-500 hover:text-red-600 font-medium disabled:opacity-50"
                          >
                            {removingLoved === r.id ? "Removing..." : "Remove from Loved"}
                          </button>
                        )}
                        <button
                          onClick={() => setConfirmDelete(r)}
                          className="text-xs text-gray-400 hover:text-red-500 font-medium ml-auto"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Toast notification */}
      {successMessage && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg animate-fade-in">
          {successMessage}
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full mx-4 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Delete {confirmDelete.title}?
            </h3>
            <p className="text-sm text-gray-500">
              This will remove it from your collection and any future meal plans.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteRecipe(confirmDelete)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

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
