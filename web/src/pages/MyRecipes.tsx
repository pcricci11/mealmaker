import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { Recipe, FamilyFavoriteMeal, RecipeInput, Cuisine, Difficulty } from "@shared/types";
import { VALID_CUISINES, VALID_DIFFICULTIES } from "@shared/types";
import {
  getFamilies, getFavoriteMeals, getMealPlanHistory, getRecipes,
  addMealToDay, deleteFavoriteMeal, createFavoriteMeal,
  getSideSuggestions, addSide,
  deleteRecipe, renameRecipe, createRecipe, importRecipeFromUrl,
} from "../api";
import { CUISINE_COLORS } from "../components/SwapMainModal";

interface HistoryPlan {
  id: number;
  week_start: string;
  created_at: string;
  items: { day: string; recipe_name: string | null; meal_type: string }[];
}

type SortOption = "recent" | "alpha" | "cook_time" | "loved";
type QuickFilter = "all" | "loved";

const CUISINE_FILTERS = VALID_CUISINES;

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
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Add recipe modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    cuisine: "american" as Cuisine,
    protein_type: "",
    cook_minutes: 30,
    difficulty: "medium" as Difficulty,
    vegetarian: false,
  });
  const [addingSaving, setAddingSaving] = useState(false);

  // URL recipe modal state
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlProgress, setUrlProgress] = useState<string | null>(null);

  // Search & filter state
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
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

  const startRename = (recipe: Recipe) => {
    setRenamingId(recipe.id);
    setRenameValue(recipe.title);
    setTimeout(() => renameInputRef.current?.select(), 0);
  };

  const handleRename = async (recipe: Recipe) => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === recipe.title) {
      setRenamingId(null);
      return;
    }
    try {
      const updated = await renameRecipe(recipe.id, trimmed);
      setRecipes((prev) => prev.map((r) => r.id === recipe.id ? updated : r));
      showToast(`Renamed to "${trimmed}"`);
    } catch (err: any) {
      showToast(err.message || "Failed to rename");
    } finally {
      setRenamingId(null);
    }
  };

  const handleAddRecipe = async () => {
    if (!addForm.name.trim()) return;
    setAddingSaving(true);
    try {
      const data: RecipeInput = {
        title: addForm.name.trim(),
        cuisine: addForm.cuisine,
        vegetarian: addForm.vegetarian,
        protein_type: addForm.vegetarian ? null : (addForm.protein_type || null),
        cook_minutes: addForm.cook_minutes,
        allergens: [],
        kid_friendly: true,
        makes_leftovers: false,
        leftovers_score: 0,
        ingredients: [],
        tags: [],
        source_type: "user",
        source_name: null,
        source_url: null,
        difficulty: addForm.difficulty,
        seasonal_tags: [],
        frequency_cap_per_month: null,
      };
      const created = await createRecipe(data);
      setRecipes((prev) => [created, ...prev]);
      showToast(`Added "${created.title}"`);
      setShowAddModal(false);
      setAddForm({ name: "", cuisine: "american", protein_type: "", cook_minutes: 30, difficulty: "medium", vegetarian: false });
    } catch (err: any) {
      showToast(err.message || "Failed to add recipe");
    } finally {
      setAddingSaving(false);
    }
  };

  const toggleLoved = async (recipe: Recipe) => {
    const name = recipe.title.toLowerCase();
    const fav = loved.find((f) => f.name.toLowerCase() === name);
    if (fav) {
      try {
        await deleteFavoriteMeal(fav.id);
        setLoved((prev) => prev.filter((f) => f.id !== fav.id));
        showToast(`Removed "${recipe.title}" from loved`);
      } catch { showToast("Failed to update"); }
    } else {
      try {
        const families = await getFamilies();
        const familyId = families[0]?.id;
        if (!familyId) return;
        const created = await createFavoriteMeal(familyId, { name: recipe.title });
        setLoved((prev) => [...prev, created]);
        showToast(`Loved "${recipe.title}"`);
      } catch { showToast("Failed to update"); }
    }
  };

  const handleImportFromUrl = async () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    try {
      setUrlProgress("\uD83D\uDD0D Checking out this recipe...");
      await new Promise((r) => setTimeout(r, 800));
      setUrlProgress("Wow, that looks delicious! Save me some! \uD83D\uDE0B");
      const { recipe, alreadyExists } = await importRecipeFromUrl(trimmed);
      setUrlProgress("\uD83D\uDCDD Reading ingredients for future grocery lists!");
      await new Promise((r) => setTimeout(r, 800));
      setUrlProgress("\u2705 Added to your collection!");
      await new Promise((r) => setTimeout(r, 1000));
      if (alreadyExists) {
        showToast(`"${recipe.title}" was already in your collection`);
      } else {
        setRecipes((prev) => [recipe, ...prev]);
        showToast(`Added "${recipe.title}" with ${recipe.ingredients?.length || 0} ingredients`);
      }
      setShowUrlModal(false);
      setUrlInput("");
      setUrlProgress(null);
    } catch (err: any) {
      setUrlProgress(null);
      showToast(err.message || "Failed to import recipe");
    }
  };

  // Build lookup maps from history for sorting
  const { recencyMap, frequencyMap } = useMemo(() => {
    const recency = new Map<string, string>();
    const frequency = new Map<string, number>();
    for (const plan of history) {
      for (const item of plan.items ?? []) {
        const name = item.recipe_name;
        if (!name) continue;
        const date = plan.week_start || plan.created_at;
        if (!recency.has(name) || date > recency.get(name)!) {
          recency.set(name, date);
        }
        frequency.set(name, (frequency.get(name) || 0) + 1);
      }
    }
    return { recencyMap: recency, frequencyMap: frequency };
  }, [history]);

  const lovedNames = useMemo(
    () => new Set(loved.map((f) => f.name.toLowerCase())),
    [loved],
  );

  // Filter & sort recipes
  const filteredRecipes = useMemo(() => {
    let result = recipes;

    // Quick filter: loved only
    if (quickFilter === "loved") {
      result = result.filter((r) => lovedNames.has(r.title.toLowerCase()));
    }

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

    if (cuisineFilter) {
      result = result.filter((r) => r.cuisine === cuisineFilter);
    }

    if (proteinFilter === "veggie") {
      result = result.filter((r) => r.vegetarian);
    } else if (proteinFilter) {
      result = result.filter(
        (r) => r.protein_type?.toLowerCase() === proteinFilter,
      );
    }

    if (vegetarianOnly) {
      result = result.filter((r) => r.vegetarian);
    }

    if (cookTimeFilter) {
      result = result.filter(
        (r) => r.cook_minutes >= cookTimeFilter.min && r.cook_minutes <= cookTimeFilter.max,
      );
    }

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
  }, [recipes, search, quickFilter, cuisineFilter, proteinFilter, vegetarianOnly, cookTimeFilter, sort, recencyMap, frequencyMap, lovedNames]);

  const hasActiveFilters = !!(search || cuisineFilter || proteinFilter || vegetarianOnly || cookTimeFilter || quickFilter !== "all");

  if (loading) {
    return <div className="text-center py-12 text-gray-400">Loading...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-10 py-4">
      <section className="space-y-4">
        {/* Header with add buttons */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            My Recipes
            <span className="ml-2 text-gray-300 font-normal normal-case">
              {recipes.length} recipes
            </span>
          </h2>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAddModal(true)}
              className="text-sm font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
            >
              + Personal Recipe
            </button>
            <button
              onClick={() => setShowUrlModal(true)}
              className="text-sm font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
            >
              + URL Recipe
            </button>
          </div>
        </div>

        {/* Search + Filters */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          {/* Quick filter tabs */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setQuickFilter("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                quickFilter === "all"
                  ? "bg-emerald-100 text-emerald-700"
                  : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              All Recipes
            </button>
            <button
              onClick={() => setQuickFilter("loved")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                quickFilter === "loved"
                  ? "bg-red-50 text-red-600"
                  : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              Loved
            </button>
          </div>

          {/* Search bar */}
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search recipes..."
              className="w-full border border-gray-300 rounded-lg px-4 py-2 pl-9 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
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

          {/* Filter dropdowns */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={cuisineFilter || ""}
              onChange={(e) => setCuisineFilter(e.target.value || null)}
              className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">All cuisines</option>
              {CUISINE_FILTERS.map((c) => (
                <option key={c} value={c}>{c.replace("_", " ")}</option>
              ))}
            </select>
            <select
              value={proteinFilter || ""}
              onChange={(e) => {
                const val = e.target.value;
                setProteinFilter(val || null);
                setVegetarianOnly(val === "veggie");
              }}
              className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">All proteins</option>
              {PROTEIN_FILTERS.map((p) => (
                <option key={p.label} value={p.value ?? "veggie"}>{p.label}</option>
              ))}
            </select>
            <select
              value={cookTimeFilter ? cookTimeFilter.label : ""}
              onChange={(e) => {
                const ct = COOK_TIME_FILTERS.find((f) => f.label === e.target.value);
                setCookTimeFilter(ct || null);
              }}
              className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Any time</option>
              {COOK_TIME_FILTERS.map((ct) => (
                <option key={ct.label} value={ct.label}>{ct.label}</option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
              className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="recent">Recent</option>
              <option value="loved">Loved</option>
              <option value="alpha">A–Z</option>
              <option value="cook_time">Fastest</option>
            </select>
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setSearch("");
                  setQuickFilter("all");
                  setCuisineFilter(null);
                  setProteinFilter(null);
                  setVegetarianOnly(false);
                  setCookTimeFilter(null);
                }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Clear
              </button>
            )}
          </div>
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
                      {renamingId === r.id ? (
                        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            ref={renameInputRef}
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleRename(r);
                              if (e.key === "Escape") setRenamingId(null);
                            }}
                            className="font-medium text-gray-900 bg-white border border-emerald-300 rounded px-2 py-0.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            autoFocus
                          />
                          <button
                            onClick={() => handleRename(r)}
                            className="text-xs text-emerald-600 hover:text-emerald-700 font-medium shrink-0"
                          >Save</button>
                          <button
                            onClick={() => setRenamingId(null)}
                            className="text-xs text-gray-400 hover:text-gray-600 font-medium shrink-0"
                          >Cancel</button>
                        </div>
                      ) : (
                        <p className="font-medium text-gray-900 truncate group/name flex items-center">
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleLoved(r); }}
                            className="mr-1.5 hover:scale-125 transition-transform shrink-0"
                            title={isLoved ? "Remove from loved" : "Love this recipe"}
                          >
                            {isLoved ? "❤️" : "♡"}
                          </button>
                          {r.title}
                          <button
                            onClick={(e) => { e.stopPropagation(); startRename(r); }}
                            className="ml-1.5 text-gray-300 hover:text-gray-500 opacity-0 group-hover/name:opacity-100 transition-opacity"
                            title="Rename recipe"
                          >✏️</button>
                        </p>
                      )}
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
                              {addingToDay === key ? `Plating up! \uD83C\uDF7D\uFE0F` : label}
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

      {/* ── Past Meal Plans ── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
          Past Meal Plans
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

      {/* Add Recipe Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Add Personal Recipe</h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Recipe name</label>
                <input
                  type="text"
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  placeholder="e.g., Grandma's Meatballs"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter" && addForm.name.trim()) handleAddRecipe(); }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Cuisine</label>
                  <select
                    value={addForm.cuisine}
                    onChange={(e) => setAddForm({ ...addForm, cuisine: e.target.value as Cuisine })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {VALID_CUISINES.map((c) => (
                      <option key={c} value={c}>{c.replace("_", " ")}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Protein</label>
                  <input
                    type="text"
                    value={addForm.protein_type}
                    onChange={(e) => setAddForm({ ...addForm, protein_type: e.target.value })}
                    placeholder="chicken, beef, etc."
                    disabled={addForm.vegetarian}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Cook time (min)</label>
                  <input
                    type="number"
                    value={addForm.cook_minutes}
                    onChange={(e) => setAddForm({ ...addForm, cook_minutes: parseInt(e.target.value) || 0 })}
                    min={0}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Difficulty</label>
                  <select
                    value={addForm.difficulty}
                    onChange={(e) => setAddForm({ ...addForm, difficulty: e.target.value as Difficulty })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {VALID_DIFFICULTIES.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={addForm.vegetarian}
                  onChange={(e) => setAddForm({ ...addForm, vegetarian: e.target.checked, protein_type: e.target.checked ? "" : addForm.protein_type })}
                  className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-sm text-gray-700">Vegetarian</span>
              </label>

            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddRecipe}
                disabled={!addForm.name.trim() || addingSaving}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {addingSaving ? "Adding..." : "Add Recipe"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* URL Recipe Modal */}
      {showUrlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Add Recipe from URL</h3>

            {urlProgress ? (
              <div className="py-8 text-center space-y-3">
                <p className="text-sm text-gray-700 font-medium">{urlProgress}</p>
                {!urlProgress.startsWith("\u2705") && (
                  <div className="flex justify-center">
                    <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Paste recipe URL here</label>
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://www.bonappetit.com/recipe/..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter" && urlInput.trim()) handleImportFromUrl(); }}
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => { setShowUrlModal(false); setUrlInput(""); }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleImportFromUrl}
                    disabled={!urlInput.trim()}
                    className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50"
                  >
                    Add Recipe
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
