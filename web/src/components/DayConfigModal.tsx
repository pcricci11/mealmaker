// components/DayConfigModal.tsx
// Modal for detailed per-day meal configuration

import { useState, useEffect } from "react";
import type { DayOfWeek, FamilyMemberV3 } from "@shared/types";

// ── Types ──

export interface MainConfig {
  recipeHints: string[];
  dietaryTags: string[];
  maxCookMinutes: number;
  needsLeftovers: boolean;
}

export interface DayConfig {
  numMains: number;
  mains: MainConfig[];
  numSides: number | null;
  sideHints: string[];
}

interface Props {
  day: DayOfWeek;
  members: FamilyMemberV3[];
  onSave: (config: DayConfig) => void;
  onClose: () => void;
  initialConfig?: DayConfig;
}

// ── Constants ──

const DAY_FULL_LABELS: Record<DayOfWeek, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

const DIETARY_OPTIONS = [
  "Vegetarian",
  "Vegan",
  "Gluten-Free",
  "Dairy-Free",
  "Kid-Friendly",
  "Quick",
  "Comfort Food",
  "Light",
  "Spicy",
];

const COMMON_SIDES = [
  "Rice",
  "Salad",
  "Bread",
  "Roasted Veggies",
  "Mashed Potatoes",
  "Steamed Broccoli",
  "Corn",
  "Coleslaw",
];

const DEFAULT_MAIN: MainConfig = {
  recipeHints: [],
  dietaryTags: [],
  maxCookMinutes: 45,
  needsLeftovers: false,
};

const NUM_MAINS_OPTIONS = [1, 2, 3, 4];
const NUM_SIDES_OPTIONS: (number | null)[] = [null, 1, 2, 3];

// ── Component ──

export default function DayConfigModal({
  day,
  members,
  onSave,
  onClose,
  initialConfig,
}: Props) {
  const [numMains, setNumMains] = useState(1);
  const [mains, setMains] = useState<MainConfig[]>([{ ...DEFAULT_MAIN }]);
  const [numSides, setNumSides] = useState<number | null>(null);
  const [sideHints, setSideHints] = useState<string[]>([]);
  const [sideHintInput, setSideHintInput] = useState("");
  const [recipeHintInputs, setRecipeHintInputs] = useState<string[]>([""]);

  useEffect(() => {
    if (initialConfig) {
      setNumMains(initialConfig.numMains);
      setMains(initialConfig.mains.map((m) => ({ ...m })));
      setNumSides(initialConfig.numSides);
      setSideHints([...initialConfig.sideHints]);
      setRecipeHintInputs(initialConfig.mains.map(() => ""));
    }
  }, [initialConfig]);

  // ── Mains count ──

  const handleNumMainsChange = (n: number) => {
    setNumMains(n);
    setMains((prev) => {
      if (n > prev.length) {
        const additions = Array.from({ length: n - prev.length }, () => ({
          ...DEFAULT_MAIN,
        }));
        return [...prev, ...additions];
      }
      return prev.slice(0, n);
    });
    setRecipeHintInputs((prev) => {
      if (n > prev.length) {
        return [...prev, ...Array.from({ length: n - prev.length }, () => "")];
      }
      return prev.slice(0, n);
    });
  };

  // ── Per-main helpers ──

  const updateMain = (index: number, update: Partial<MainConfig>) => {
    setMains((prev) =>
      prev.map((m, i) => (i === index ? { ...m, ...update } : m))
    );
  };

  const addRecipeHint = (mainIndex: number) => {
    const trimmed = recipeHintInputs[mainIndex]?.trim();
    if (
      trimmed &&
      !mains[mainIndex].recipeHints.includes(trimmed)
    ) {
      updateMain(mainIndex, {
        recipeHints: [...mains[mainIndex].recipeHints, trimmed],
      });
      setRecipeHintInputs((prev) =>
        prev.map((v, i) => (i === mainIndex ? "" : v))
      );
    }
  };

  const removeRecipeHint = (mainIndex: number, hint: string) => {
    updateMain(mainIndex, {
      recipeHints: mains[mainIndex].recipeHints.filter((h) => h !== hint),
    });
  };

  const toggleDietaryTag = (mainIndex: number, tag: string) => {
    const current = mains[mainIndex].dietaryTags;
    updateMain(mainIndex, {
      dietaryTags: current.includes(tag)
        ? current.filter((t) => t !== tag)
        : [...current, tag],
    });
  };

  // ── Sides helpers ──

  const addSideHint = () => {
    const trimmed = sideHintInput.trim();
    if (trimmed && !sideHints.includes(trimmed)) {
      setSideHints([...sideHints, trimmed]);
      setSideHintInput("");
    }
  };

  const removeSideHint = (hint: string) => {
    setSideHints(sideHints.filter((h) => h !== hint));
  };

  const toggleCommonSide = (side: string) => {
    setSideHints((prev) =>
      prev.includes(side) ? prev.filter((s) => s !== side) : [...prev, side]
    );
  };

  // ── Submit ──

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      numMains,
      mains: mains.slice(0, numMains),
      numSides,
      sideHints,
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] flex flex-col">
        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
          {/* Header */}
          <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
            <h3 className="text-lg font-bold">{DAY_FULL_LABELS[day]}</h3>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* How many mains? */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                How many mains?
              </label>
              <div className="flex gap-2">
                {NUM_MAINS_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => handleNumMainsChange(n)}
                    className={`px-4 py-2 rounded-full border-2 text-sm font-medium transition-colors ${
                      numMains === n
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                        : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Per-main sections */}
            {mains.slice(0, numMains).map((main, idx) => (
              <div key={idx}>
                {idx > 0 && <hr className="border-gray-200 mb-6" />}
                <h4 className="text-sm font-bold text-gray-800 mb-3">
                  Main {idx + 1}
                </h4>

                {/* Recipe hints */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Got something specific in mind?
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={recipeHintInputs[idx] || ""}
                      onChange={(e) =>
                        setRecipeHintInputs((prev) =>
                          prev.map((v, i) =>
                            i === idx ? e.target.value : v
                          )
                        )
                      }
                      onKeyPress={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addRecipeHint(idx);
                        }
                      }}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      placeholder="tacos, salmon's on sale; cauliflower in the fridge..."
                    />
                    <button
                      type="button"
                      onClick={() => addRecipeHint(idx)}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300"
                    >
                      Add
                    </button>
                  </div>
                  {main.recipeHints.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {main.recipeHints.map((hint) => (
                        <span
                          key={hint}
                          className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm flex items-center gap-1"
                        >
                          {hint}
                          <button
                            type="button"
                            onClick={() => removeRecipeHint(idx, hint)}
                            className="ml-1 hover:text-emerald-900"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Dietary & Style tags */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Dietary & Style
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {DIETARY_OPTIONS.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleDietaryTag(idx, tag)}
                        className={`px-3 py-1 rounded-full text-sm transition-colors ${
                          main.dietaryTags.includes(tag)
                            ? "bg-emerald-100 text-emerald-700 border-2 border-emerald-500"
                            : "bg-gray-100 text-gray-600 border-2 border-transparent hover:border-gray-300"
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cook time slider */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Cook time: {main.maxCookMinutes} min
                  </label>
                  <input
                    type="range"
                    min={15}
                    max={120}
                    step={5}
                    value={main.maxCookMinutes}
                    onChange={(e) =>
                      updateMain(idx, {
                        maxCookMinutes: Number(e.target.value),
                      })
                    }
                    className="w-full accent-emerald-600"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>15 min</span>
                    <span>120 min</span>
                  </div>
                </div>

                {/* Needs leftovers */}
                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={main.needsLeftovers}
                      onChange={(e) =>
                        updateMain(idx, {
                          needsLeftovers: e.target.checked,
                        })
                      }
                      className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      Need leftovers
                    </span>
                  </label>
                </div>
              </div>
            ))}

            {/* Sides section */}
            <div>
              <hr className="border-gray-200 mb-6" />
              <h4 className="text-sm font-bold text-gray-800 mb-3">Sides</h4>

              {/* How many sides? */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  How many sides?
                </label>
                <div className="flex gap-2">
                  {NUM_SIDES_OPTIONS.map((n) => (
                    <button
                      key={n === null ? "auto" : n}
                      type="button"
                      onClick={() => setNumSides(n)}
                      className={`px-4 py-2 rounded-full border-2 text-sm font-medium transition-colors ${
                        numSides === n
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                          : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      {n === null ? "Auto" : n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Specific side ideas */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Any specific sides?
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={sideHintInput}
                    onChange={(e) => setSideHintInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addSideHint();
                      }
                    }}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="e.g., Garlic bread..."
                  />
                  <button
                    type="button"
                    onClick={addSideHint}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300"
                  >
                    Add
                  </button>
                </div>
                {sideHints.filter((h) => !COMMON_SIDES.includes(h)).length >
                  0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {sideHints
                      .filter((h) => !COMMON_SIDES.includes(h))
                      .map((hint) => (
                        <span
                          key={hint}
                          className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm flex items-center gap-1"
                        >
                          {hint}
                          <button
                            type="button"
                            onClick={() => removeSideHint(hint)}
                            className="ml-1 hover:text-emerald-900"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                  </div>
                )}
              </div>

              {/* Quick-pick common sides */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Quick picks
                </label>
                <div className="flex flex-wrap gap-2">
                  {COMMON_SIDES.map((side) => (
                    <button
                      key={side}
                      type="button"
                      onClick={() => toggleCommonSide(side)}
                      className={`px-3 py-1 rounded-full text-sm transition-colors ${
                        sideHints.includes(side)
                          ? "bg-emerald-100 text-emerald-700 border-2 border-emerald-500"
                          : "bg-gray-100 text-gray-600 border-2 border-transparent hover:border-gray-300"
                      }`}
                    >
                      {side}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
