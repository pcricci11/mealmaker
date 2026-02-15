import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { GroceryItem, GroceryList as GroceryListType, Ingredient } from "@shared/types";
import { getGroceryList, suggestIngredients } from "../api";

const CATEGORY_LABELS: Record<string, string> = {
  produce: "Produce",
  dairy: "Dairy & Eggs",
  pantry: "Pantry",
  protein: "Protein",
  spices: "Spices",
  grains: "Grains & Bread",
  frozen: "Frozen",
  other: "Other",
};

const CATEGORY_PILLS: Array<{ key: string; label: string; emoji: string }> = [
  { key: "produce", label: "Produce", emoji: "🥬" },
  { key: "protein", label: "Protein", emoji: "🥩" },
  { key: "dairy", label: "Dairy", emoji: "🧀" },
  { key: "grains", label: "Grains", emoji: "🍞" },
  { key: "pantry", label: "Pantry", emoji: "🥫" },
  { key: "spices", label: "Spices", emoji: "🧂" },
  { key: "frozen", label: "Frozen", emoji: "🧊" },
  { key: "other", label: "Other", emoji: "🛒" },
];

const CATEGORY_ORDER = CATEGORY_PILLS.map((p) => p.key);

interface CustomItem {
  name: string;
  category: string;
}

function loadChecked(planId: string): Set<string> {
  try {
    const raw = localStorage.getItem(`grocery-checked-${planId}`);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

function saveChecked(planId: string, checked: Set<string>) {
  localStorage.setItem(`grocery-checked-${planId}`, JSON.stringify([...checked]));
}

function loadCustomItems(planId: string): CustomItem[] {
  try {
    const raw = localStorage.getItem(`grocery-custom-${planId}`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveCustomItems(planId: string, items: CustomItem[]) {
  localStorage.setItem(`grocery-custom-${planId}`, JSON.stringify(items));
}

export default function GroceryList() {
  const navigate = useNavigate();
  const [planId] = useState(() => localStorage.getItem("lastPlanId"));
  const [groceries, setGroceries] = useState<GroceryListType | null>(null);
  const [checked, setChecked] = useState<Set<string>>(() => planId ? loadChecked(planId) : new Set());
  const [customItems, setCustomItems] = useState<CustomItem[]>(() => planId ? loadCustomItems(planId) : []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("other");

  // Suggest ingredients state
  const [suggestingFor, setSuggestingFor] = useState<number | null>(null);
  const [suggestedIngredients, setSuggestedIngredients] = useState<Record<number, Ingredient[]>>({});
  const [selectedSuggestions, setSelectedSuggestions] = useState<Record<number, Set<number>>>({});
  const [dismissedRecipes, setDismissedRecipes] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!planId) {
      setLoading(false);
      return;
    }
    getGroceryList(Number(planId))
      .then(setGroceries)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [planId]);

  const toggleCheck = useCallback((key: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (planId) saveChecked(planId, next);
      return next;
    });
  }, [planId]);

  const addCustomItem = () => {
    const name = newItemName.trim();
    if (!name || !planId) return;
    const updated = [...customItems, { name, category: newItemCategory }];
    setCustomItems(updated);
    saveCustomItems(planId, updated);
    setNewItemName("");
    setShowAddForm(false);
  };

  const addCustomItems = (items: CustomItem[]) => {
    if (!planId) return;
    const updated = [...customItems, ...items];
    setCustomItems(updated);
    saveCustomItems(planId, updated);
  };

  const removeCustomItem = (index: number) => {
    if (!planId) return;
    const item = customItems[index];
    const key = `custom|${item.name}`;
    setChecked((prev) => {
      const next = new Set(prev);
      next.delete(key);
      saveChecked(planId, next);
      return next;
    });
    const updated = customItems.filter((_, i) => i !== index);
    setCustomItems(updated);
    saveCustomItems(planId, updated);
  };

  const clearAllChecks = () => {
    if (!planId) return;
    const empty = new Set<string>();
    setChecked(empty);
    saveChecked(planId, empty);
  };

  const openAddForm = (category: string) => {
    setNewItemCategory(category);
    setShowAddForm(true);
  };

  const handleSuggest = async (recipeId: number) => {
    setSuggestingFor(recipeId);
    try {
      const ingredients = await suggestIngredients(recipeId);
      setSuggestedIngredients((prev) => ({ ...prev, [recipeId]: ingredients }));
      // Pre-select all suggestions
      setSelectedSuggestions((prev) => ({
        ...prev,
        [recipeId]: new Set(ingredients.map((_, i) => i)),
      }));
    } catch (err) {
      console.error("Failed to suggest ingredients:", err);
    } finally {
      setSuggestingFor(null);
    }
  };

  const toggleSuggestion = (recipeId: number, index: number) => {
    setSelectedSuggestions((prev) => {
      const current = prev[recipeId] || new Set();
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return { ...prev, [recipeId]: next };
    });
  };

  const addSuggestedToList = (recipeId: number) => {
    const ingredients = suggestedIngredients[recipeId] || [];
    const selected = selectedSuggestions[recipeId] || new Set();
    const items: CustomItem[] = [];
    ingredients.forEach((ing, i) => {
      if (selected.has(i)) {
        items.push({ name: `${ing.quantity} ${ing.unit} ${ing.name}`, category: ing.category });
      }
    });
    addCustomItems(items);
    // Dismiss this recipe after adding
    setDismissedRecipes((prev) => new Set(prev).add(recipeId));
    setSuggestedIngredients((prev) => {
      const next = { ...prev };
      delete next[recipeId];
      return next;
    });
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-400">Loading...</div>;
  }

  if (!groceries) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-4">No meal plan found. Generate a plan first.</p>
        <button
          onClick={() => navigate("/meal-plan")}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700"
        >
          Go to Meal Plan
        </button>
      </div>
    );
  }

  // Group API items by category
  const grouped = new Map<string, Array<GroceryItem | (CustomItem & { _custom: true; _index: number })>>();
  for (const item of groceries.items) {
    if (!grouped.has(item.category)) grouped.set(item.category, []);
    grouped.get(item.category)!.push(item);
  }

  // Merge custom items into groups
  customItems.forEach((item, index) => {
    if (!grouped.has(item.category)) grouped.set(item.category, []);
    grouped.get(item.category)!.push({ ...item, _custom: true as const, _index: index });
  });

  const totalCount = groceries.items.length + customItems.length;
  const checkedCount = checked.size;

  const missingRecipes = (groceries.missing_recipes || []).filter(
    (r) => !dismissedRecipes.has(r.recipe_id),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Grocery List</h2>
        <div className="flex items-center gap-3">
          {checkedCount > 0 && (
            <button
              onClick={clearAllChecks}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Clear checks
            </button>
          )}
          <span className="text-sm text-gray-500">
            {checkedCount} / {totalCount} checked
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Missing recipes section */}
      {missingRecipes.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-bold text-amber-800 flex items-center gap-2">
            Manual Shopping Needed
          </h3>
          <p className="text-xs text-amber-700">
            These recipes don't have ingredient lists yet. You can ask AI to suggest ingredients or add them manually.
          </p>
          <div className="space-y-2">
            {missingRecipes.map((recipe) => (
              <div key={recipe.recipe_id} className="bg-white rounded-lg border border-amber-200 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900 text-sm">{recipe.name}</span>
                  {!suggestedIngredients[recipe.recipe_id] && (
                    <button
                      onClick={() => handleSuggest(recipe.recipe_id)}
                      disabled={suggestingFor === recipe.recipe_id}
                      className="text-xs px-3 py-1.5 bg-amber-100 text-amber-800 rounded-lg font-medium hover:bg-amber-200 transition-colors disabled:opacity-50"
                    >
                      {suggestingFor === recipe.recipe_id ? "Thinking..." : "Suggest Ingredients"}
                    </button>
                  )}
                </div>

                {/* Suggested ingredients review */}
                {suggestedIngredients[recipe.recipe_id] && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-gray-500 font-medium">Review suggested ingredients:</p>
                    <div className="space-y-1">
                      {suggestedIngredients[recipe.recipe_id].map((ing, i) => {
                        const isSelected = selectedSuggestions[recipe.recipe_id]?.has(i) ?? false;
                        return (
                          <label
                            key={i}
                            className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 rounded px-2 py-1"
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSuggestion(recipe.recipe_id, i)}
                              className="accent-emerald-600 w-3.5 h-3.5"
                            />
                            <span className={isSelected ? "text-gray-900" : "text-gray-400 line-through"}>
                              {ing.quantity} {ing.unit} {ing.name}
                            </span>
                            <span className="text-xs text-gray-400 ml-auto">
                              {CATEGORY_LABELS[ing.category] || ing.category}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => addSuggestedToList(recipe.recipe_id)}
                        className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700"
                      >
                        Add Selected to List
                      </button>
                      <button
                        onClick={() => setDismissedRecipes((prev) => new Set(prev).add(recipe.recipe_id))}
                        className="text-xs px-3 py-1.5 text-gray-500 hover:text-gray-700"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grocery categories */}
      <div className="space-y-6">
        {CATEGORY_ORDER.filter((cat) => grouped.has(cat)).map((cat) => (
          <div key={cat}>
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">
              {CATEGORY_LABELS[cat] || cat}
            </h3>
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {grouped.get(cat)!.map((item) => {
                const isCustom = "_custom" in item;
                const key = isCustom ? `custom|${item.name}` : `${item.name}|${(item as GroceryItem).unit}`;
                const isChecked = checked.has(key);
                return (
                  <label
                    key={isCustom ? `custom-${(item as any)._index}` : key}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                      isChecked ? "opacity-50" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleCheck(key)}
                      className="accent-emerald-600 w-4 h-4"
                    />
                    <span className={`flex-1 ${isChecked ? "line-through text-gray-400" : "text-gray-900"} ${isCustom ? "italic" : ""}`}>
                      {item.name}
                    </span>
                    {!isCustom && (
                      <span className="text-sm text-gray-500 tabular-nums">
                        {(item as GroceryItem).total_quantity} {(item as GroceryItem).unit}
                      </span>
                    )}
                    {isCustom && (
                      <button
                        onClick={(e) => { e.preventDefault(); removeCustomItem((item as any)._index); }}
                        className="text-gray-400 hover:text-red-500 text-sm px-1"
                      >
                        ✕
                      </button>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Add custom item section */}
      <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-5 space-y-3">
        <div>
          <h3 className="font-semibold text-emerald-900">Add Your Own Items</h3>
          <p className="text-sm text-emerald-700 mt-0.5">
            Lunches, snacks, desserts, drinks, or anything else you need
          </p>
        </div>

        {/* Quick-add category pills */}
        <div className="flex flex-wrap gap-2">
          {CATEGORY_PILLS.map((pill) => (
            <button
              key={pill.key}
              onClick={() => openAddForm(pill.key)}
              className="text-xs px-3 py-1.5 bg-white border border-emerald-200 rounded-full text-emerald-800 font-medium hover:bg-emerald-100 hover:border-emerald-300 transition-colors shadow-sm"
            >
              {pill.emoji} {pill.label}
            </button>
          ))}
        </div>

        {/* Add form */}
        {showAddForm && (
          <div className="bg-white rounded-lg border border-emerald-200 p-3 space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addCustomItem(); }}
                placeholder="Item name..."
                autoFocus
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
              <select
                value={newItemCategory}
                onChange={(e) => setNewItemCategory(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {CATEGORY_ORDER.map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={addCustomItem}
                disabled={!newItemName.trim()}
                className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50"
              >
                Add
              </button>
              <button
                onClick={() => { setShowAddForm(false); setNewItemName(""); }}
                className="px-4 py-2 text-gray-600 text-sm hover:text-gray-800"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
