import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { Recipe, FamilyFavoriteMeal, RecipeInput, Cuisine, Difficulty } from "@shared/types";
import { VALID_CUISINES, VALID_DIFFICULTIES } from "@shared/types";
import {
  getFamilies, getFavoriteMeals, getMealPlanHistory, getRecipes, getMealPlan,
  addMealToDay, swapMainRecipe, deleteFavoriteMeal, createFavoriteMeal,
  getSideSuggestions, addSide,
  deleteRecipe, renameRecipe, createRecipe, importRecipeFromUrl, updateRecipeNotes, cloneMealPlan,
  UrlValidationError,
} from "../api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import RecipeDetailModal from "@/components/RecipeDetailModal";

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

// Light-theme cuisine colors for card placeholders and tags
const LIGHT_CUISINE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  italian:        { bg: "#FEF2F2", text: "#DC2626", border: "#FECACA" },
  american:       { bg: "#EFF6FF", text: "#2563EB", border: "#BFDBFE" },
  french:         { bg: "#F5F3FF", text: "#7C3AED", border: "#DDD6FE" },
  mediterranean:  { bg: "#ECFDF5", text: "#059669", border: "#A7F3D0" },
  middle_eastern: { bg: "#FFF7ED", text: "#EA580C", border: "#FED7AA" },
  thai:           { bg: "#FFFBEB", text: "#D97706", border: "#FDE68A" },
  mexican:        { bg: "#FFF7ED", text: "#EA580C", border: "#FED7AA" },
  indian:         { bg: "#FFFBEB", text: "#D97706", border: "#FDE68A" },
  chinese:        { bg: "#FFF1F2", text: "#E11D48", border: "#FECDD3" },
  japanese:       { bg: "#FDF2F8", text: "#DB2777", border: "#FBCFE8" },
  korean:         { bg: "#F5F3FF", text: "#7C3AED", border: "#DDD6FE" },
  ethiopian:      { bg: "#ECFDF5", text: "#059669", border: "#A7F3D0" },
};

// Quick filter chips for the horizontal bar
const FILTER_CHIPS = [
  { label: "All", key: "all" },
  { label: "Quick (<30 min)", key: "quick" },
  { label: "Vegetarian", key: "vegetarian" },
  { label: "Chicken", key: "chicken" },
  { label: "Beef", key: "beef" },
  { label: "Salmon", key: "salmon" },
  { label: "Pasta", key: "pasta" },
  { label: "Loved", key: "loved" },
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
  const [searchParams] = useSearchParams();
  const addToDayParam = searchParams.get("addToDay");
  const swapDayParam = searchParams.get("swapDay");
  const pickDayParam = addToDayParam || swapDayParam;
  const pickMode = addToDayParam ? "add" : swapDayParam ? "swap" : null;
  const addToPlanId = searchParams.get("planId");
  const swapMealItemId = searchParams.get("mealItemId");
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loved, setLoved] = useState<FamilyFavoriteMeal[]>([]);
  const [history, setHistory] = useState<HistoryPlan[]>([]);
  const [loading, setLoading] = useState(true);

  // Recipe detail modal state
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [addingToDay, setAddingToDay] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [removingLoved, setRemovingLoved] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Recipe | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [cloningPlanId, setCloningPlanId] = useState<number | null>(null);
  const [reuseConfirmPlan, setReuseConfirmPlan] = useState<HistoryPlan | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [savingNotes, setSavingNotes] = useState(false);

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
  const [urlNotRecipe, setUrlNotRecipe] = useState<{
    reason: string;
    detected_recipe_name: string | null;
    alternative_url: string | null;
  } | null>(null);

  // Search & filter state
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [cuisineFilter, setCuisineFilter] = useState<string | null>(null);
  const [proteinFilter, setProteinFilter] = useState<string | "veggie" | null>(null);
  const [cookTimeFilter, setCookTimeFilter] = useState<typeof COOK_TIME_FILTERS[number] | null>(null);
  const [vegetarianOnly, setVegetarianOnly] = useState(false);
  const [sort, setSort] = useState<SortOption>("recent");

  // Mobile bottom sheet & FAB state
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [fabMenuOpen, setFabMenuOpen] = useState(false);

  // View mode and image error tracking
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [activeChip, setActiveChip] = useState<string>("all");
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());

  // Count active filters for mobile badge
  const bottomSheetFilterCount = useMemo(() => {
    let count = 0;
    if (cuisineFilter) count++;
    if (proteinFilter) count++;
    if (cookTimeFilter) count++;
    if (sort !== "recent") count++;
    return count;
  }, [cuisineFilter, proteinFilter, cookTimeFilter, sort]);

  // Lock body scroll when filter sheet is open
  useEffect(() => {
    if (filterSheetOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [filterSheetOpen]);

  // Close FAB menu on scroll
  useEffect(() => {
    if (!fabMenuOpen) return;
    const handleScroll = () => setFabMenuOpen(false);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [fabMenuOpen]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const families = await getFamilies();
      const familyId = families[0]?.id;

      const [favs, plans, allRecipes] = await Promise.allSettled([
        familyId ? getFavoriteMeals(familyId) : Promise.resolve([]),
        getMealPlanHistory(familyId),
        getRecipes(),
      ]);

      if (favs.status === "fulfilled") setLoved(favs.value);
      if (plans.status === "fulfilled") setHistory(plans.value);
      if (allRecipes.status === "fulfilled") setRecipes(allRecipes.value);
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

  const handlePickForDay = async (recipe: Recipe) => {
    if (!pickDayParam || !addToPlanId) return;
    setAddingToDay(pickDayParam);
    try {
      if (pickMode === "swap" && swapMealItemId) {
        await swapMainRecipe(parseInt(swapMealItemId), recipe.id);
      } else {
        await addMealToDay(parseInt(addToPlanId), pickDayParam, recipe.id, "main");
      }
      navigate("/my-plan");
    } catch (err: any) {
      showToast(err.message || "Failed to update meal");
      setAddingToDay(null);
    }
  };

  const handleAddToDay = async (recipe: Recipe, day: string) => {
    const currentPlanId = localStorage.getItem("currentPlanId");
    if (!currentPlanId) {
      // No plan yet — start one with this recipe as a draft
      setSelectedRecipe(null);
      navigate("/plan", { state: { draftRecipes: [[day, recipe]] } });
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
        notes: null,
        image_url: null,
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

  const handleSaveNotes = async (recipe: Recipe, notesText: string) => {
    setSavingNotes(true);
    try {
      const trimmed = notesText.trim();
      const updated = await updateRecipeNotes(recipe.id, trimmed || null);
      setRecipes((prev) => prev.map((r) => r.id === recipe.id ? updated : r));
      showToast(trimmed ? "Notes saved" : "Notes cleared");
    } catch (err: any) {
      showToast(err.message || "Failed to save notes");
    } finally {
      setSavingNotes(false);
    }
  };

  const handleReusePlan = async (planId: number, mode: "replace" | "merge") => {
    setCloningPlanId(planId);
    setReuseConfirmPlan(null);
    try {
      const today = new Date();
      const dow = today.getDay();
      const diff = dow === 0 ? -6 : 1 - dow;
      const monday = new Date(today);
      monday.setDate(today.getDate() + diff);
      const weekStart = monday.toISOString().split("T")[0];

      const newPlan = await cloneMealPlan(planId, weekStart, mode);
      localStorage.setItem("currentPlanId", String(newPlan.id));
      navigate("/my-plan");
    } catch (err: any) {
      showToast(err.message || "Failed to reuse plan");
      setCloningPlanId(null);
    }
  };

  const handleImportFromUrl = async (overrideUrl?: string) => {
    const trimmed = (overrideUrl || urlInput).trim();
    if (!trimmed) return;
    setUrlNotRecipe(null);
    try {
      setUrlProgress("Checking out this recipe...");
      await new Promise((r) => setTimeout(r, 800));
      setUrlProgress("Wow, that looks delicious! Save me some!");
      const { recipe, alreadyExists, paywall_warning } = await importRecipeFromUrl(trimmed);
      if (paywall_warning) {
        setUrlProgress("Source is paywalled — estimating ingredients with AI...");
        await new Promise((r) => setTimeout(r, 1000));
      }
      setUrlProgress("Reading ingredients for future grocery lists!");
      await new Promise((r) => setTimeout(r, 800));
      setUrlProgress("Added to your collection!");
      await new Promise((r) => setTimeout(r, 1000));
      if (alreadyExists) {
        showToast(`"${recipe.title}" was already in your collection`);
      } else {
        setRecipes((prev) => [recipe, ...prev]);
        const suffix = paywall_warning ? " (ingredients estimated by AI)" : "";
        showToast(`Added "${recipe.title}" with ${recipe.ingredients?.length || 0} ingredients${suffix}`);
      }
      setShowUrlModal(false);
      setUrlInput("");
      setUrlProgress(null);
      setUrlNotRecipe(null);
    } catch (err: any) {
      setUrlProgress(null);
      if (err instanceof UrlValidationError) {
        setUrlNotRecipe({
          reason: err.data.reason,
          detected_recipe_name: err.data.detected_recipe_name,
          alternative_url: err.data.alternative_url,
        });
      } else {
        showToast(err.message || "Failed to import recipe");
      }
    }
  };

  // Handle chip clicks — maps to existing filter state
  const handleChipClick = (chipKey: string) => {
    setActiveChip(chipKey);
    // Reset all chip-driven filters first
    setQuickFilter("all");
    setCuisineFilter(null);
    setProteinFilter(null);
    setVegetarianOnly(false);
    setCookTimeFilter(null);

    switch (chipKey) {
      case "all":
        break;
      case "quick":
        setCookTimeFilter(COOK_TIME_FILTERS[0]); // Under 30min
        break;
      case "vegetarian":
        setVegetarianOnly(true);
        break;
      case "chicken":
        setProteinFilter("chicken");
        break;
      case "beef":
        setProteinFilter("beef");
        break;
      case "salmon":
        setProteinFilter("fish");
        break;
      case "pasta":
        setCuisineFilter("italian");
        break;
      case "loved":
        setQuickFilter("loved");
        break;
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

  // Placeholder image component for grid cards
  const PlaceholderImage = ({ cuisine }: { cuisine: string }) => {
    const colors = LIGHT_CUISINE_COLORS[cuisine] || LIGHT_CUISINE_COLORS.american;
    return (
      <div
        className="w-full h-full flex items-center justify-center"
        style={{
          background: `linear-gradient(135deg, ${colors.bg} 0%, ${colors.border} 100%)`,
        }}
      >
        <span className="text-2xl opacity-60">🍽️</span>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-chef-cream flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-chef-orange border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-stone-400 text-sm font-body">Loading recipes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-chef-cream overflow-hidden">
      <div className="space-y-2 md:space-y-5">
        {/* Pick mode banner */}
        {pickDayParam && (
          <div className="bg-orange-50 border border-orange-300 rounded-xl px-4 py-2 flex items-center justify-between">
            <p className="text-sm font-medium text-orange-800">
              Select a recipe to {pickMode === "swap" ? "swap on" : "add to"} <span className="font-bold">{pickDayParam.charAt(0).toUpperCase() + pickDayParam.slice(1)}</span>
            </p>
            <button
              onClick={() => navigate("/my-plan")}
              className="text-sm font-medium text-orange-500 hover:text-orange-600"
            >
              Cancel
            </button>
          </div>
        )}

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl md:text-2xl font-bold text-stone-800">My Recipes</h1>
            <p className="text-stone-400 text-xs md:text-sm font-body">{recipes.length} recipes</p>
          </div>
          <div className="hidden md:flex items-center gap-1 bg-white rounded-lg border border-stone-200 p-0.5">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                viewMode === "grid" ? "bg-stone-900 text-white" : "text-stone-400 hover:text-stone-600"
              )}
              title="Grid view"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
                <rect x="1" y="1" width="6" height="6" rx="1" />
                <rect x="9" y="1" width="6" height="6" rx="1" />
                <rect x="1" y="9" width="6" height="6" rx="1" />
                <rect x="9" y="9" width="6" height="6" rx="1" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                viewMode === "list" ? "bg-stone-900 text-white" : "text-stone-400 hover:text-stone-600"
              )}
              title="List view"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
                <rect x="1" y="2" width="14" height="3" rx="1" />
                <rect x="1" y="7" width="14" height="3" rx="1" />
                <rect x="1" y="12" width="14" height="3" rx="1" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Search + Loved toggle row ── */}
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <div className="relative flex-1 min-w-0">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400"
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search recipes..."
              className="w-full pl-9 pr-8 py-2 bg-white border border-stone-200 rounded-xl text-sm font-body text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-chef-orange/30 focus:border-chef-orange transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 text-sm"
              >
                ✕
              </button>
            )}
          </div>
          {/* Mobile: Filter button */}
          <button
            onClick={() => setFilterSheetOpen(true)}
            className="md:hidden flex items-center gap-1.5 bg-white border border-stone-200 rounded-xl px-2.5 py-2 text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            {bottomSheetFilterCount > 0 && (
              <span className="bg-chef-orange text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {bottomSheetFilterCount}
              </span>
            )}
          </button>
          {/* Desktop: Add buttons */}
          <div className="hidden md:flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="text-sm font-medium text-chef-orange border-chef-orange/30 hover:bg-orange-50 rounded-xl"
              onClick={() => setShowAddModal(true)}
            >
              + Personal
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-sm font-medium text-chef-orange border-chef-orange/30 hover:bg-orange-50 rounded-xl"
              onClick={() => setShowUrlModal(true)}
            >
              + URL
            </Button>
          </div>
        </div>

        {/* ── Horizontal filter chips (desktop only — mobile uses bottom sheet) ── */}
        <div className="hidden md:flex items-center gap-2 overflow-x-auto hide-scrollbar pb-1">
          {FILTER_CHIPS.map((chip) => (
            <button
              key={chip.key}
              onClick={() => handleChipClick(chip.key)}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all shrink-0",
                activeChip === chip.key
                  ? "bg-stone-900 text-white shadow-sm"
                  : "bg-white text-stone-600 border border-stone-200 hover:border-stone-300 hover:bg-stone-50"
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* ── Recipe results count ── */}
        {filteredRecipes.length > 0 && filteredRecipes.length !== recipes.length && (
          <p className="text-xs text-stone-400 font-body">
            {filteredRecipes.length} of {recipes.length} recipes
          </p>
        )}

        {/* ── Recipe grid/list ── */}
        <section>
          {filteredRecipes.length === 0 ? (
            <div className="bg-white border border-dashed border-stone-300 rounded-2xl p-12 text-center">
              <span className="text-4xl block mb-3">🍳</span>
              <p className="text-stone-500 text-sm font-body">
                {hasActiveFilters
                  ? "No recipes match your filters. Try broadening your search."
                  : "No recipes yet. Add some from your meal plans!"}
              </p>
              {hasActiveFilters && (
                <button
                  onClick={() => {
                    setSearch("");
                    setActiveChip("all");
                    setQuickFilter("all");
                    setCuisineFilter(null);
                    setProteinFilter(null);
                    setVegetarianOnly(false);
                    setCookTimeFilter(null);
                  }}
                  className="mt-3 text-sm text-chef-orange hover:text-orange-600 font-medium"
                >
                  Clear all filters
                </button>
              )}
            </div>
          ) : viewMode === "grid" ? (
            /* ── Grid View ── */
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1 md:gap-3 px-[5%] md:px-0">
              {filteredRecipes.map((r) => {
                const cuisineColor = LIGHT_CUISINE_COLORS[r.cuisine] || LIGHT_CUISINE_COLORS.american;
                const isLoved = lovedNames.has(r.title.toLowerCase());
                const hasImage = r.image_url && !imageErrors.has(r.id);
                return (
                  <div key={r.id} className="min-w-0">
                    <div
                      className={cn(
                        "bg-white rounded-lg md:rounded-2xl overflow-hidden shadow-sm border border-stone-100 cursor-pointer transition-all duration-200",
                        pickDayParam ? "hover:border-orange-400 hover:shadow-md" : "hover:shadow-md hover:-translate-y-0.5",
                        addingToDay && "opacity-50 pointer-events-none"
                      )}
                      onClick={() => pickDayParam ? handlePickForDay(r) : setSelectedRecipe(r)}
                    >
                      {/* Image area — compact on mobile */}
                      <div className="relative overflow-hidden h-[68px] md:h-[160px]">
                        {hasImage ? (
                          <img
                            src={r.image_url!}
                            alt={r.title}
                            className="w-full h-full object-cover"
                            onError={() => setImageErrors((prev) => new Set(prev).add(r.id))}
                          />
                        ) : (
                          <PlaceholderImage cuisine={r.cuisine} />
                        )}
                        {/* Love button overlay */}
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleLoved(r); }}
                          className={cn(
                            "absolute top-0.5 right-0.5 w-5 h-5 rounded-full flex items-center justify-center transition-all shadow-sm",
                            isLoved ? "bg-white text-red-500" : "bg-white/80 text-stone-400 hover:text-red-500 hover:bg-white"
                          )}
                        >
                          {isLoved ? (
                            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                            </svg>
                          ) : (
                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                            </svg>
                          )}
                        </button>
                        {/* Cook time badge */}
                        <span className="absolute bottom-1 left-1 bg-stone-900/75 text-white text-[9px] font-medium px-1 py-px rounded-full backdrop-blur-sm">
                          {r.cook_minutes}m
                        </span>
                        {/* Vegetarian badge */}
                        {r.vegetarian && (
                          <span className="absolute bottom-1 right-1 bg-emerald-600/80 text-white text-[9px] font-medium px-1 py-px rounded-full backdrop-blur-sm">
                            Veg
                          </span>
                        )}
                      </div>
                      {/* Card body */}
                      <div className="px-1.5 py-1 md:p-3">
                        {renamingId === r.id ? (
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <input
                              ref={renameInputRef}
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleRename(r);
                                if (e.key === "Escape") setRenamingId(null);
                              }}
                              className="font-medium text-stone-900 bg-white border border-chef-orange/40 rounded-lg px-1.5 py-0.5 text-[11px] w-full focus:outline-none focus:ring-2 focus:ring-chef-orange/30"
                              autoFocus
                            />
                            <button onClick={() => handleRename(r)} className="text-[10px] text-chef-orange hover:text-orange-600 font-medium shrink-0">OK</button>
                            <button onClick={() => setRenamingId(null)} className="text-[10px] text-stone-400 hover:text-stone-600 font-medium shrink-0">X</button>
                          </div>
                        ) : (
                          <>
                            <h3 className="font-body font-semibold text-stone-800 text-[11px] md:text-sm leading-tight line-clamp-1 md:line-clamp-2">
                              {r.title}
                            </h3>
                            <span
                              className="inline-block mt-px text-[9px] md:text-[10px] font-medium px-1 py-px rounded-full capitalize"
                              style={{
                                backgroundColor: cuisineColor.bg,
                                color: cuisineColor.text,
                                border: `1px solid ${cuisineColor.border}`,
                              }}
                            >
                              {r.cuisine.replace("_", " ")}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── List View ── */
            <div className="space-y-2">
              {filteredRecipes.map((r) => {
                const cuisineColor = LIGHT_CUISINE_COLORS[r.cuisine] || LIGHT_CUISINE_COLORS.american;
                const isLoved = lovedNames.has(r.title.toLowerCase());
                const hasImage = r.image_url && !imageErrors.has(r.id);
                return (
                  <div key={r.id}>
                    <div
                      className={cn(
                        "bg-white rounded-xl border border-stone-100 p-3 flex items-center gap-3 cursor-pointer transition-all duration-200",
                        pickDayParam ? "hover:border-orange-400 hover:shadow-sm" : "hover:shadow-sm hover:border-stone-200",
                        addingToDay && "opacity-50 pointer-events-none"
                      )}
                      onClick={() => pickDayParam ? handlePickForDay(r) : setSelectedRecipe(r)}
                    >
                      {/* Thumbnail */}
                      <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0">
                        {hasImage ? (
                          <img
                            src={r.image_url!}
                            alt={r.title}
                            className="w-full h-full object-cover"
                            onError={() => setImageErrors((prev) => new Set(prev).add(r.id))}
                          />
                        ) : (
                          <PlaceholderImage cuisine={r.cuisine} />
                        )}
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
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
                              className="font-medium text-stone-900 bg-white border border-chef-orange/40 rounded-lg px-2 py-0.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-chef-orange/30"
                              autoFocus
                            />
                            <button onClick={() => handleRename(r)} className="text-xs text-chef-orange hover:text-orange-600 font-medium shrink-0">Save</button>
                            <button onClick={() => setRenamingId(null)} className="text-xs text-stone-400 hover:text-stone-600 font-medium shrink-0">Cancel</button>
                          </div>
                        ) : (
                          <>
                            <h3 className="font-body font-semibold text-stone-800 text-sm truncate">
                              {r.title}
                            </h3>
                            <div className="flex items-center gap-2 mt-1">
                              <span
                                className="text-[11px] font-medium px-2 py-0.5 rounded-full capitalize"
                                style={{
                                  backgroundColor: cuisineColor.bg,
                                  color: cuisineColor.text,
                                  border: `1px solid ${cuisineColor.border}`,
                                }}
                              >
                                {r.cuisine.replace("_", " ")}
                              </span>
                              <span className="text-[11px] text-stone-400">{r.cook_minutes} min</span>
                              {r.vegetarian && <span className="text-[11px] text-emerald-600 font-medium">Veggie</span>}
                              {r.source_name && <span className="text-[11px] text-stone-400 truncate">{r.source_name}</span>}
                            </div>
                          </>
                        )}
                      </div>
                      {/* Love button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleLoved(r); }}
                        className="shrink-0 hover:scale-110 transition-transform"
                      >
                        {isLoved ? (
                          <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5 text-stone-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Past Meal Plans ── */}
        <section className="space-y-4 pt-4">
          <h2 className="font-display text-lg font-bold text-stone-800">Past Meal Plans</h2>

          {history.length === 0 ? (
            <div className="bg-white border border-dashed border-stone-300 rounded-2xl p-8 text-center">
              <span className="text-3xl block mb-2">📋</span>
              <p className="text-stone-400 text-sm font-body">No past plans yet.</p>
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
                    className="bg-white rounded-xl border border-stone-100 px-4 py-3 flex items-center justify-between hover:shadow-sm transition-shadow"
                  >
                    <div className="min-w-0">
                      <p className="font-body font-semibold text-stone-800 text-sm">
                        {plan.week_start
                          ? formatWeekRange(plan.week_start)
                          : timeAgo(plan.created_at)}
                      </p>
                      {preview && (
                        <p className="text-xs text-stone-400 truncate mt-0.5 font-body">
                          {preview}{extra}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 ml-4 text-sm font-medium text-chef-orange hover:text-orange-600 border-chef-orange/30 hover:bg-orange-50 rounded-xl"
                      disabled={cloningPlanId === plan.id}
                      onClick={async () => {
                        let hasExistingMeals = false;

                        const today = new Date();
                        const dow = today.getDay();
                        const diff = dow === 0 ? -6 : 1 - dow;
                        const monday = new Date(today);
                        monday.setDate(today.getDate() + diff);
                        const thisWeek = monday.toISOString().split("T")[0];

                        const currentWeekPlan = history.find(
                          (h) => h.week_start === thisWeek && h.items?.length > 0
                        );
                        if (currentWeekPlan) {
                          hasExistingMeals = true;
                        } else {
                          const currentPlanId = localStorage.getItem("currentPlanId");
                          if (currentPlanId) {
                            try {
                              const livePlan = await getMealPlan(parseInt(currentPlanId));
                              if (livePlan?.items?.length > 0) {
                                hasExistingMeals = true;
                              }
                            } catch {
                              // Plan doesn't exist — no conflict
                            }
                          }
                        }

                        if (hasExistingMeals) {
                          setReuseConfirmPlan(plan);
                        } else {
                          handleReusePlan(plan.id, "replace");
                        }
                      }}
                    >
                      {cloningPlanId === plan.id ? "Cloning..." : "Reuse This Week"}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Toast notification */}
      {successMessage && (
        <div className="fixed top-4 right-4 z-50 bg-stone-900 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg animate-fade-in font-body">
          {successMessage}
        </div>
      )}

      {/* ── Filter Bottom Sheet (mobile only) ── */}
      {filterSheetOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setFilterSheetOpen(false)}
          />
          <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl animate-slide-up md:hidden">
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-stone-300 rounded-full" />
            </div>

            <div className="px-5 pb-6 space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-bold text-stone-800">Filters</h3>
                <button
                  onClick={() => {
                    setActiveChip("all");
                    setQuickFilter("all");
                    setCuisineFilter(null);
                    setProteinFilter(null);
                    setVegetarianOnly(false);
                    setCookTimeFilter(null);
                    setSort("recent");
                  }}
                  className="text-sm text-chef-orange hover:text-orange-600 font-medium"
                >
                  Clear all
                </button>
              </div>

              {/* Quick filters */}
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1.5">Quick Filters</label>
                <div className="flex flex-wrap gap-1.5">
                  {FILTER_CHIPS.map((chip) => (
                    <button
                      key={chip.key}
                      onClick={() => handleChipClick(chip.key)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                        activeChip === chip.key
                          ? "bg-stone-900 text-white"
                          : "bg-stone-100 text-stone-600"
                      )}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cuisine */}
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1.5">Cuisine</label>
                <select
                  value={cuisineFilter || ""}
                  onChange={(e) => setCuisineFilter(e.target.value || null)}
                  className="w-full border border-stone-200 rounded-xl px-3 min-h-[44px] text-sm text-stone-700 font-body focus:outline-none focus:ring-2 focus:ring-chef-orange/30"
                >
                  <option value="">All cuisines</option>
                  {CUISINE_FILTERS.map((c) => (
                    <option key={c} value={c}>{c.replace("_", " ")}</option>
                  ))}
                </select>
              </div>

              {/* Protein */}
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1.5">Protein</label>
                <select
                  value={proteinFilter || ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    setProteinFilter(val || null);
                    setVegetarianOnly(val === "veggie");
                  }}
                  className="w-full border border-stone-200 rounded-xl px-3 min-h-[44px] text-sm text-stone-700 font-body focus:outline-none focus:ring-2 focus:ring-chef-orange/30"
                >
                  <option value="">All proteins</option>
                  {PROTEIN_FILTERS.map((p) => (
                    <option key={p.label} value={p.value ?? "veggie"}>{p.label}</option>
                  ))}
                </select>
              </div>

              {/* Cook Time */}
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1.5">Cook Time</label>
                <select
                  value={cookTimeFilter ? cookTimeFilter.label : ""}
                  onChange={(e) => {
                    const ct = COOK_TIME_FILTERS.find((f) => f.label === e.target.value);
                    setCookTimeFilter(ct || null);
                  }}
                  className="w-full border border-stone-200 rounded-xl px-3 min-h-[44px] text-sm text-stone-700 font-body focus:outline-none focus:ring-2 focus:ring-chef-orange/30"
                >
                  <option value="">Any time</option>
                  {COOK_TIME_FILTERS.map((ct) => (
                    <option key={ct.label} value={ct.label}>{ct.label}</option>
                  ))}
                </select>
              </div>

              {/* Sort */}
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1.5">Sort</label>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortOption)}
                  className="w-full border border-stone-200 rounded-xl px-3 min-h-[44px] text-sm text-stone-700 font-body focus:outline-none focus:ring-2 focus:ring-chef-orange/30"
                >
                  <option value="recent">Recent</option>
                  <option value="loved">Loved</option>
                  <option value="alpha">A–Z</option>
                  <option value="cook_time">Fastest</option>
                </select>
              </div>

              {/* Done button */}
              <Button
                className="w-full rounded-xl"
                onClick={() => setFilterSheetOpen(false)}
              >
                Done
              </Button>
            </div>
          </div>
        </>
      )}

      {/* ── Floating Action Button (mobile only) ── */}
      <div className="md:hidden">
        {/* Backdrop to close FAB menu */}
        {fabMenuOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/20"
            onClick={() => setFabMenuOpen(false)}
          />
        )}

        {/* FAB menu items */}
        {fabMenuOpen && (
          <div className="fixed bottom-24 right-5 z-50 flex flex-col items-end gap-2 animate-slide-up-fade">
            <button
              onClick={() => { setFabMenuOpen(false); setShowAddModal(true); }}
              className="bg-white text-stone-800 text-sm font-medium px-5 py-3 rounded-2xl shadow-lg border border-stone-100 hover:bg-stone-50 transition-colors font-body"
            >
              Personal Recipe
            </button>
            <button
              onClick={() => { setFabMenuOpen(false); setShowUrlModal(true); }}
              className="bg-white text-stone-800 text-sm font-medium px-5 py-3 rounded-2xl shadow-lg border border-stone-100 hover:bg-stone-50 transition-colors font-body"
            >
              URL Recipe
            </button>
          </div>
        )}

        {/* FAB button */}
        <button
          onClick={() => setFabMenuOpen((prev) => !prev)}
          className="fixed bottom-6 right-5 z-50 w-14 h-14 rounded-full text-white shadow-lg flex items-center justify-center transition-all"
          style={{
            background: "linear-gradient(135deg, #EA580C, #DC2626)",
            boxShadow: "0 4px 14px rgba(234, 88, 12, 0.4)",
          }}
        >
          <span
            className={cn(
              "text-2xl leading-none transition-transform duration-200 font-light",
              fabMenuOpen && "rotate-45"
            )}
          >
            +
          </span>
        </button>
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <Dialog open={true} onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}>
          <DialogContent fullScreenMobile={false}>
            <DialogHeader>
              <DialogTitle>Delete {confirmDelete.title}?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground px-6">
              This will remove it from your collection and any future meal plans.
            </p>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleDeleteRecipe(confirmDelete)}
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Add Recipe Modal */}
      {showAddModal && (
        <Dialog open={true} onOpenChange={(open) => { if (!open) setShowAddModal(false); }}>
          <DialogContent fullScreenMobile={false}>
            <DialogHeader>
              <DialogTitle>Add Personal Recipe</DialogTitle>
            </DialogHeader>

            <div className="space-y-3 px-6">
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">Recipe name</label>
                <Input
                  type="text"
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  placeholder="e.g., Grandma's Meatballs"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter" && addForm.name.trim()) handleAddRecipe(); }}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-1">Cuisine</label>
                  <select
                    value={addForm.cuisine}
                    onChange={(e) => setAddForm({ ...addForm, cuisine: e.target.value as Cuisine })}
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm font-body focus:outline-none focus:ring-2 focus:ring-chef-orange/30"
                  >
                    {VALID_CUISINES.map((c) => (
                      <option key={c} value={c}>{c.replace("_", " ")}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-1">Protein</label>
                  <Input
                    type="text"
                    value={addForm.protein_type}
                    onChange={(e) => setAddForm({ ...addForm, protein_type: e.target.value })}
                    placeholder="chicken, beef, etc."
                    disabled={addForm.vegetarian}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-1">Cook time (min)</label>
                  <input
                    type="number"
                    value={addForm.cook_minutes}
                    onChange={(e) => setAddForm({ ...addForm, cook_minutes: parseInt(e.target.value) || 0 })}
                    min={0}
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm font-body focus:outline-none focus:ring-2 focus:ring-chef-orange/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-1">Difficulty</label>
                  <select
                    value={addForm.difficulty}
                    onChange={(e) => setAddForm({ ...addForm, difficulty: e.target.value as Difficulty })}
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm font-body focus:outline-none focus:ring-2 focus:ring-chef-orange/30"
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
                  className="rounded border-stone-300 text-chef-orange focus:ring-chef-orange"
                />
                <span className="text-sm text-stone-700 font-body">Vegetarian</span>
              </label>
            </div>

            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setShowAddModal(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddRecipe}
                disabled={!addForm.name.trim() || addingSaving}
              >
                {addingSaving ? "Adding..." : "Add Recipe"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Reuse Plan Confirmation Modal */}
      {reuseConfirmPlan && (
        <Dialog open={true} onOpenChange={(open) => { if (!open) setReuseConfirmPlan(null); }}>
          <DialogContent fullScreenMobile={false}>
            <DialogHeader>
              <DialogTitle>You already have meals planned this week</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground px-6">
              How would you like to add the meals from{" "}
              <span className="font-medium text-stone-700">
                {reuseConfirmPlan.week_start
                  ? formatWeekRange(reuseConfirmPlan.week_start)
                  : "this plan"}
              </span>
              ?
            </p>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button
                variant="ghost"
                onClick={() => setReuseConfirmPlan(null)}
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={() => handleReusePlan(reuseConfirmPlan.id, "merge")}
              >
                Add to Plan
              </Button>
              <Button
                onClick={() => handleReusePlan(reuseConfirmPlan.id, "replace")}
              >
                Replace Everything
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Recipe Detail Modal */}
      {selectedRecipe && (
        <RecipeDetailModal
          recipe={selectedRecipe}
          isLoved={lovedNames.has(selectedRecipe.title.toLowerCase())}
          onClose={() => setSelectedRecipe(null)}
          onAddToDay={(day) => handleAddToDay(selectedRecipe, day)}
          onToggleLoved={() => toggleLoved(selectedRecipe)}
          onDelete={() => { setConfirmDelete(selectedRecipe); setSelectedRecipe(null); }}
          onRename={() => { startRename(selectedRecipe); setSelectedRecipe(null); }}
          onSaveNotes={async (notes) => {
            await handleSaveNotes(selectedRecipe, notes);
            // Update selectedRecipe with new notes to keep modal in sync
            setSelectedRecipe((prev) => prev ? { ...prev, notes: notes.trim() || null } : null);
          }}
          addingToDay={addingToDay}
          savingNotes={savingNotes}
        />
      )}

      {/* URL Recipe Modal */}
      {showUrlModal && (
        <Dialog open={true} onOpenChange={(open) => { if (!open) { setShowUrlModal(false); setUrlInput(""); setUrlNotRecipe(null); setUrlProgress(null); } }}>
          <DialogContent fullScreenMobile={false}>
            <DialogHeader>
              <DialogTitle>Add Recipe from URL</DialogTitle>
            </DialogHeader>

            {urlProgress ? (
              <div className="py-8 text-center space-y-3 px-6">
                <p className="text-sm text-stone-700 font-medium font-body">{urlProgress}</p>
                {!urlProgress.startsWith("Added") && (
                  <div className="flex justify-center">
                    <div className="w-6 h-6 border-2 border-chef-orange border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
            ) : urlNotRecipe ? (
              <div className="px-6 py-4 space-y-4">
                <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3">
                  <p className="text-sm font-medium text-amber-800 mb-1">That doesn't look like a recipe page</p>
                  <p className="text-sm text-amber-700 font-body">{urlNotRecipe.reason}</p>
                </div>
                {urlNotRecipe.alternative_url && (
                  <div className="space-y-2">
                    <p className="text-sm text-stone-600 font-body">
                      {urlNotRecipe.detected_recipe_name
                        ? `Did you mean "${urlNotRecipe.detected_recipe_name}"?`
                        : "We found a recipe you might be looking for:"}
                    </p>
                    <Button
                      className="w-full"
                      onClick={() => handleImportFromUrl(urlNotRecipe.alternative_url!)}
                    >
                      Import from {new URL(urlNotRecipe.alternative_url).hostname}
                    </Button>
                  </div>
                )}
                <button
                  onClick={() => { setUrlNotRecipe(null); }}
                  className="text-sm text-chef-orange hover:text-orange-600 font-medium"
                >
                  Try a Different URL
                </button>
              </div>
            ) : (
              <>
                <div className="px-6">
                  <label className="block text-xs font-medium text-stone-500 mb-1">Paste recipe URL here</label>
                  <Input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://www.bonappetit.com/recipe/..."
                    autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter" && urlInput.trim()) handleImportFromUrl(); }}
                  />
                </div>

                <DialogFooter>
                  <Button
                    variant="ghost"
                    onClick={() => { setShowUrlModal(false); setUrlInput(""); }}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => handleImportFromUrl()}
                    disabled={!urlInput.trim()}
                  >
                    Add Recipe
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
