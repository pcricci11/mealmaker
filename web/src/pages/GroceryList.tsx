import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { GroceryItem, GroceryList as GroceryListType } from "@shared/types";
import { getGroceryList } from "../api";

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

const CATEGORY_ORDER = ["produce", "protein", "dairy", "grains", "pantry", "spices", "frozen", "other"];

export default function GroceryList() {
  const navigate = useNavigate();
  const [groceries, setGroceries] = useState<GroceryListType | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Get the latest meal plan's grocery list
    // We'll try plan ID 1, then increment if needed. For MVP, we store the plan ID in localStorage.
    const lastPlanId = localStorage.getItem("lastPlanId");
    if (!lastPlanId) {
      setLoading(false);
      return;
    }
    getGroceryList(Number(lastPlanId))
      .then(setGroceries)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const toggleCheck = (name: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
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
          onClick={() => navigate("/plan")}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700"
        >
          Go to Meal Plan
        </button>
      </div>
    );
  }

  // Group by category
  const grouped = new Map<string, GroceryItem[]>();
  for (const item of groceries.items) {
    const cat = item.category;
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(item);
  }

  const checkedCount = checked.size;
  const totalCount = groceries.items.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Grocery List</h2>
        <span className="text-sm text-gray-500">
          {checkedCount} / {totalCount} items checked
        </span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {CATEGORY_ORDER.filter((cat) => grouped.has(cat)).map((cat) => (
          <div key={cat}>
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">
              {CATEGORY_LABELS[cat] || cat}
            </h3>
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {grouped.get(cat)!.map((item) => {
                const key = `${item.name}|${item.unit}`;
                const isChecked = checked.has(key);
                return (
                  <label
                    key={key}
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
                    <span className={`flex-1 ${isChecked ? "line-through text-gray-400" : "text-gray-900"}`}>
                      {item.name}
                    </span>
                    <span className="text-sm text-gray-500 tabular-nums">
                      {item.total_quantity} {item.unit}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
