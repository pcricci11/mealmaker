import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { GroceryItem, GroceryList as GroceryListType } from "@shared/types";
import { getGroceryList } from "../api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const CATEGORY_CONFIG: Record<string, { label: string; emoji: string; color: string; bgColor: string }> = {
  produce: { label: "Produce",        emoji: "\u{1F96C}", color: "#059669", bgColor: "#ECFDF5" },
  protein: { label: "Protein",        emoji: "\u{1F969}", color: "#DC2626", bgColor: "#FEF2F2" },
  dairy:   { label: "Dairy & Eggs",   emoji: "\u{1F9C0}", color: "#D97706", bgColor: "#FFFBEB" },
  grains:  { label: "Grains & Bread", emoji: "\u{1F35D}", color: "#EA580C", bgColor: "#FFF7ED" },
  pantry:  { label: "Pantry",         emoji: "\u{1FAD9}", color: "#78716C", bgColor: "#F5F5F4" },
  spices:  { label: "Spices",         emoji: "\u{1F9C2}", color: "#B45309", bgColor: "#FFFBEB" },
  frozen:  { label: "Frozen",         emoji: "\u{1F9CA}", color: "#2563EB", bgColor: "#EFF6FF" },
  other:   { label: "Other",          emoji: "\u{1F6D2}", color: "#78716C", bgColor: "#F5F5F4" },
};

const CATEGORY_ORDER = Object.keys(CATEGORY_CONFIG);

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

function getCurrentWeekRange(): string {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `Week of ${fmt(monday)} \u2013 ${fmt(sunday)}`;
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

  // New visual state
  const [showChecked, setShowChecked] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newItemInline, setNewItemInline] = useState("");
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);

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

  const addInlineItem = (category: string) => {
    const name = newItemInline.trim();
    if (!name || !planId) return;
    const updated = [...customItems, { name, category }];
    setCustomItems(updated);
    saveCustomItems(planId, updated);
    setNewItemInline("");
    setAddingTo(null);
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

  const buildListText = () => {
    if (!groceries) return "";
    const grouped = new Map<string, string[]>();
    for (const item of groceries.items) {
      const key = `${item.name}|${item.unit}`;
      if (checked.has(key)) continue;
      if (!grouped.has(item.category)) grouped.set(item.category, []);
      grouped.get(item.category)!.push(`  ${item.total_quantity} ${item.unit} ${item.name}`);
    }
    customItems.forEach((item) => {
      const key = `custom|${item.name}`;
      if (checked.has(key)) return;
      if (!grouped.has(item.category)) grouped.set(item.category, []);
      grouped.get(item.category)!.push(`  ${item.name}`);
    });
    return CATEGORY_ORDER
      .filter((cat) => grouped.has(cat))
      .map((cat) => {
        const cfg = CATEGORY_CONFIG[cat];
        return `${cfg.emoji} ${cfg.label}\n${grouped.get(cat)!.join("\n")}`;
      })
      .join("\n\n");
  };

  const copyList = async () => {
    const text = buildListText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for insecure contexts or denied permissions
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const shareList = async () => {
    const text = buildListText();
    if (!text) return;
    const shareData = { title: "Grocery List", text };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      } catch (err: any) {
        // User cancelled share — ignore AbortError
        if (err.name !== "AbortError") {
          await copyList();
        }
      }
    } else {
      // Fallback: copy to clipboard when Web Share API not available
      await copyList();
    }
  };

  // --- Loading state ---
  if (loading) {
    return (
      <div className="min-h-screen bg-chef-cream flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-3 border-stone-200 border-t-chef-orange rounded-full animate-spin" />
        <p className="text-sm text-stone-400">Loading grocery list...</p>
      </div>
    );
  }

  // --- Empty state ---
  if (!groceries) {
    return (
      <div className="min-h-screen bg-chef-cream flex flex-col items-center justify-center gap-4 px-4">
        <span className="text-5xl">{"\u{1F6D2}"}</span>
        <p className="text-stone-500 text-center">No meal plan found. Generate a plan first.</p>
        <Button onClick={() => navigate("/plan")}>
          Go to Plan
        </Button>
      </div>
    );
  }

  // --- Group API items by category ---
  const grouped = new Map<string, Array<GroceryItem | (CustomItem & { _custom: true; _index: number })>>();
  for (const item of groceries.items) {
    if (!grouped.has(item.category)) grouped.set(item.category, []);
    grouped.get(item.category)!.push(item);
  }
  customItems.forEach((item, index) => {
    if (!grouped.has(item.category)) grouped.set(item.category, []);
    grouped.get(item.category)!.push({ ...item, _custom: true as const, _index: index });
  });

  const totalCount = groceries.items.length + customItems.length;
  const checkedCount = checked.size;
  const progress = totalCount > 0 ? (checkedCount / totalCount) * 100 : 0;
  const remainingCount = totalCount - checkedCount;

  return (
    <div className="min-h-screen bg-chef-cream">
      <div className="max-w-2xl mx-auto px-4 py-5 md:py-8">

        {/* Title + Actions */}
        <div className="flex items-start justify-between mb-2">
          <div>
            <h1 className="font-display text-2xl font-bold text-stone-800">
              Grocery List
            </h1>
            <p className="text-stone-400 text-xs mt-0.5">
              {getCurrentWeekRange()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copyList}
              className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all border"
              style={{
                background: copied ? "#ECFDF5" : "white",
                color: copied ? "#059669" : "#78716C",
                borderColor: copied ? "#A7F3D0" : "#E7E5E4",
              }}
            >
              {copied ? "\u2713 Copied!" : "\u{1F4CB} Copy"}
            </button>
            <div className="relative group">
              <button
                className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-default bg-white text-stone-400 border border-stone-200"
              >
                {"\u{1F6D2}"} Shop Mode
              </button>
              <div
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-xl whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                style={{
                  background: "#1C1917",
                  color: "white",
                  fontSize: "0.75rem",
                  fontWeight: 500,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                }}
              >
                Coming soon! {"\u{1F680}"}
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 rotate-45 w-2 h-2 bg-stone-900" />
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {/* Progress Bar */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-stone-500">
              {checkedCount} of {totalCount} items
            </span>
            {checkedCount > 0 && (
              <button onClick={clearAllChecks} className="text-xs text-stone-400 hover:text-stone-600 transition-colors">
                Reset all
              </button>
            )}
          </div>
          <div className="w-full h-2 rounded-full overflow-hidden bg-stone-200/60">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progress}%`,
                background: progress === 100
                  ? "linear-gradient(90deg, #059669, #34D399)"
                  : "linear-gradient(90deg, #EA580C, #FDBA74)",
              }}
            />
          </div>
          {progress === 100 && (
            <p className="text-xs text-emerald-600 font-semibold mt-1.5 text-center">
              All done, Chef! {"\u{1F389}"}
            </p>
          )}
        </div>

        {/* All Items / Remaining toggle + Edit */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-2">
            <button
              onClick={() => setShowChecked(true)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                showChecked
                  ? "bg-stone-900 text-white border-stone-900"
                  : "bg-white text-stone-500 border-stone-200 hover:border-stone-300"
              }`}
            >
              All Items
            </button>
            <button
              onClick={() => setShowChecked(false)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                !showChecked
                  ? "bg-stone-900 text-white border-stone-900"
                  : "bg-white text-stone-500 border-stone-200 hover:border-stone-300"
              }`}
            >
              Remaining ({remainingCount})
            </button>
          </div>
          <button
            onClick={() => { setEditMode(!editMode); if (editMode) { setAddingTo(null); setNewItemInline(""); } }}
            className="text-xs font-medium transition-colors"
            style={{ color: editMode ? "#EA580C" : "#A8A29E" }}
          >
            {editMode ? "Done" : "Edit"}
          </button>
        </div>

        {/* Extraction warnings */}
        {(groceries.extraction_warnings || []).length > 0 && (
          <div className="rounded-xl p-3 mb-4 bg-amber-50/60 border border-amber-200/50">
            <p className="text-xs text-amber-700">
              <span className="font-semibold">Heads up:</span> Ingredients for{' '}
              {groceries.extraction_warnings.map(r => r.name).join(', ')}{' '}
              couldn't be determined. You may want to add them manually.
            </p>
          </div>
        )}

        {/* Grocery Categories */}
        <div className="flex flex-col gap-4">
          {CATEGORY_ORDER.filter((cat) => grouped.has(cat)).map((cat) => {
            const cfg = CATEGORY_CONFIG[cat];
            const items = grouped.get(cat)!;
            const visibleItems = showChecked
              ? items
              : items.filter((item) => {
                  const isCustom = "_custom" in item;
                  const key = isCustom ? `custom|${item.name}` : `${item.name}|${(item as GroceryItem).unit}`;
                  return !checked.has(key);
                });
            const uncheckedInCategory = items.filter((item) => {
              const isCustom = "_custom" in item;
              const key = isCustom ? `custom|${item.name}` : `${item.name}|${(item as GroceryItem).unit}`;
              return !checked.has(key);
            }).length;

            if (visibleItems.length === 0 && addingTo !== cat) return null;

            return (
              <div key={cat} className="rounded-2xl overflow-hidden bg-white border border-stone-100">
                {/* Category Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100/80">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ background: cfg.bgColor }}
                    >
                      <span className="text-base">{cfg.emoji}</span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-stone-900">{cfg.label}</h3>
                      <span className="text-[0.65rem] text-stone-400">
                        {uncheckedInCategory} remaining
                      </span>
                    </div>
                  </div>
                  {editMode && (
                    <button
                      onClick={() => { setAddingTo(addingTo === cat ? null : cat); setNewItemInline(""); }}
                      className="w-7 h-7 rounded-full flex items-center justify-center bg-stone-100 text-stone-500 hover:bg-stone-200 transition-colors text-base"
                    >
                      +
                    </button>
                  )}
                </div>

                {/* Items */}
                <div className="divide-y divide-stone-50">
                  {visibleItems.map((item) => {
                    const isCustom = "_custom" in item;
                    const key = isCustom ? `custom|${item.name}` : `${item.name}|${(item as GroceryItem).unit}`;
                    const isChecked = checked.has(key);
                    return (
                      <div
                        key={isCustom ? `custom-${(item as CustomItem & { _index: number })._index}` : key}
                        className="flex items-center gap-3 px-4 py-2.5 transition-all"
                        style={{ opacity: isChecked ? 0.55 : 1 }}
                      >
                        {/* Circle Checkbox */}
                        <button
                          onClick={() => toggleCheck(key)}
                          className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center transition-all"
                          style={{
                            border: isChecked ? `2px solid ${cfg.color}` : "2px solid #D6D3D1",
                            background: isChecked ? cfg.color : "transparent",
                          }}
                        >
                          {isChecked && (
                            <span className="text-white text-[0.65rem] font-bold">{"\u2713"}</span>
                          )}
                        </button>

                        {/* Item Info */}
                        <div className="flex-1 min-w-0 flex items-baseline gap-2">
                          <span
                            className="font-medium text-sm"
                            style={{
                              color: isChecked ? "#A8A29E" : "#1C1917",
                              textDecoration: isChecked ? "line-through" : "none",
                            }}
                          >
                            {item.name}
                          </span>
                          {!isCustom && (
                            <span className="text-xs text-stone-400 ml-auto flex-shrink-0 tabular-nums">
                              {(item as GroceryItem).total_quantity} {(item as GroceryItem).unit}
                            </span>
                          )}
                        </div>

                        {/* Remove button (edit mode, custom items only) */}
                        {editMode && isCustom && (
                          <button
                            onClick={() => removeCustomItem((item as CustomItem & { _index: number })._index)}
                            className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 bg-red-50 text-red-600 text-xs hover:bg-red-100 transition-colors"
                          >
                            {"\u00D7"}
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {/* Inline Add Input */}
                  {addingTo === cat && (
                    <div className="flex items-center gap-2 px-4 py-2.5">
                      <input
                        type="text"
                        placeholder="Add item..."
                        value={newItemInline}
                        onChange={(e) => setNewItemInline(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addInlineItem(cat)}
                        className="flex-1 py-1.5 px-3 rounded-lg outline-none text-sm bg-stone-50 border border-stone-200 focus:border-stone-300 focus:ring-1 focus:ring-stone-200 transition-all"
                        autoFocus
                      />
                      <button
                        onClick={() => addInlineItem(cat)}
                        disabled={!newItemInline.trim()}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors disabled:opacity-40"
                        style={{ background: "#EA580C" }}
                      >
                        Add
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom Actions */}
        <div className="mt-6 flex flex-col gap-3 pb-8">
          <button
            onClick={() => { setEditMode(true); setAddingTo(CATEGORY_ORDER[0]); }}
            className="w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 text-sm text-stone-500 hover:text-stone-700 hover:border-stone-400 transition-colors"
            style={{ border: "2px dashed #D6D3D1" }}
          >
            + Add Custom Item
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={copyList}
              className="py-3 rounded-xl font-medium flex items-center justify-center gap-2 bg-white border border-stone-200 text-stone-600 text-sm hover:bg-stone-50 transition-colors"
            >
              {"\u{1F4CB}"} Copy to Clipboard
            </button>
            <button
              onClick={shareList}
              className="py-3 rounded-xl font-medium flex items-center justify-center gap-2 bg-white border border-stone-200 text-stone-600 text-sm hover:bg-stone-50 transition-colors"
              style={shared ? { background: "#ECFDF5", color: "#059669", borderColor: "#A7F3D0" } : undefined}
            >
              {shared ? "\u2713 Shared!" : "\u{1F4E4} Share List"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
