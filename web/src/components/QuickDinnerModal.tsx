// components/QuickDinnerModal.tsx
// Multi-step wizard for quick dinner tonight
//
// Flow: Count → Configure each main → Summary → Sequential RecipeSearchModal per main

import { useState, useEffect, useRef } from "react";
import { getRecipes } from "../api";
import type { Recipe, Cuisine } from "@shared/types";
import { VALID_CUISINES } from "@shared/types";
import { CUISINE_COLORS } from "./SwapMainModal";
import RecipeSearchModal from "./RecipeSearchModal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ── Types ──

interface QuickDinnerModalProps {
  familyId?: number;
  onRecipesSelected: (recipes: Recipe[]) => void;
  onClose: () => void;
}

type SourceType = "my_recipes" | "search_web" | "surprise_me";
type WizardStep = "count" | "configure" | "summary" | "searching";

interface MainConfig {
  cuisines: Cuisine[];
  source: SourceType;
  chefPreference: string;
  ingredients: string;
  dietary: {
    vegetarian: boolean;
    glutenFree: boolean;
    kidFriendly: boolean;
    dairyFree: boolean;
    quick: boolean;
  };
}

// ── Constants ──

const DEFAULT_DIETARY = {
  vegetarian: false,
  glutenFree: false,
  kidFriendly: false,
  dairyFree: false,
  quick: false,
};

const DEFAULT_CONFIG: MainConfig = {
  cuisines: [],
  source: "search_web",
  chefPreference: "",
  ingredients: "",
  dietary: { ...DEFAULT_DIETARY },
};

const DIETARY_CHIPS: { key: keyof MainConfig["dietary"]; label: string }[] = [
  { key: "vegetarian", label: "Vegetarian" },
  { key: "glutenFree", label: "Gluten-Free" },
  { key: "kidFriendly", label: "Kid-Friendly" },
  { key: "dairyFree", label: "Dairy-Free" },
  { key: "quick", label: "Quick (under 30 min)" },
];

const SOURCE_OPTIONS: { value: SourceType; label: string }[] = [
  { value: "my_recipes", label: "My Recipes" },
  { value: "search_web", label: "Search Web" },
  { value: "surprise_me", label: "Surprise Me" },
];

// ── Helpers ──

function buildSearchQuery(config: MainConfig): string {
  const parts: string[] = [];
  if (config.source === "search_web" && config.chefPreference.trim())
    parts.push(config.chefPreference.trim());
  if (config.cuisines.length > 0)
    parts.push(config.cuisines.map((c) => c.replace("_", " ")).join(" or "));
  if (config.source === "surprise_me") parts.push("surprise me");
  if (config.ingredients.trim())
    parts.push(`using ${config.ingredients.trim()}`);
  parts.push("dinner recipe");
  if (config.dietary.vegetarian) parts.push("vegetarian");
  if (config.dietary.glutenFree) parts.push("gluten-free");
  if (config.dietary.kidFriendly) parts.push("kid-friendly");
  if (config.dietary.dairyFree) parts.push("dairy-free");
  if (config.dietary.quick) parts.push("quick 30 minute");
  return parts.join(" ");
}

function filterLocalRecipes(recipes: Recipe[], config: MainConfig): Recipe[] {
  return recipes.filter((r) => {
    if (config.cuisines.length > 0 && !config.cuisines.includes(r.cuisine)) return false;
    if (config.dietary.vegetarian && !r.vegetarian) return false;
    if (config.dietary.kidFriendly && !r.kid_friendly) return false;
    if (config.dietary.glutenFree && r.allergens.includes("gluten")) return false;
    if (config.dietary.dairyFree && r.allergens.includes("dairy")) return false;
    if (config.dietary.quick && r.cook_minutes > 30) return false;
    return true;
  });
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ── Local Recipe Picker (for "my_recipes" source) ──

function LocalRecipePicker({
  config,
  stepLabel,
  onRecipeSelected,
  onClose,
}: {
  config: MainConfig;
  stepLabel?: string;
  onRecipeSelected: (recipe: Recipe) => void;
  onClose: () => void;
}) {
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([]);
  const [displayed, setDisplayed] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const shownIds = useRef<Set<number>>(new Set());

  useEffect(() => {
    loadRecipes();
  }, []);

  const loadRecipes = async () => {
    setLoading(true);
    setError(null);
    try {
      const recipes = await getRecipes();
      setAllRecipes(recipes);
      showFresh(recipes);
    } catch (err: any) {
      setError(err.message || "Failed to load recipes.");
    } finally {
      setLoading(false);
    }
  };

  const showFresh = (recipes: Recipe[]) => {
    const filtered = filterLocalRecipes(recipes, config);
    const unseen = filtered.filter((r) => !shownIds.current.has(r.id));
    const pool = unseen.length >= 3 ? unseen : filtered;
    if (pool === filtered) shownIds.current = new Set();
    const picks = shuffle(pool).slice(0, 6);
    picks.forEach((r) => shownIds.current.add(r.id));
    setDisplayed(picks);
    if (picks.length === 0) {
      setError("No matching recipes found in your collection.");
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex flex-col">
        <DialogHeader className="border-b border-gray-200 px-4 md:px-6 py-4 space-y-1.5">
          <DialogTitle className="text-lg font-bold text-gray-900">Pick from My Recipes</DialogTitle>
          {stepLabel && (
            <DialogDescription className="text-sm text-gray-500">
              Recipe {stepLabel}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-4">
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-orange-200 border-t-orange-500 mb-3" />
              <p className="text-gray-500 text-sm">Loading your recipes...</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="mt-2 mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-600 text-sm">{error}</p>
                </div>
              )}
              {displayed.length > 0 && (
                <div className="space-y-2 mt-2">
                  <p className="text-xs text-gray-400 mb-1">Tap to pick:</p>
                  {displayed.map((recipe) => {
                    const cuisineClass = CUISINE_COLORS[recipe.cuisine] || "bg-gray-100 text-gray-700";
                    return (
                      <button
                        key={recipe.id}
                        onClick={() => onRecipeSelected(recipe)}
                        className="w-full border border-gray-200 rounded-lg p-4 hover:border-orange-500 hover:bg-orange-50 transition-colors text-left"
                      >
                        <div className="font-medium text-gray-900">{recipe.title}</div>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <Badge variant="outline" className={cn("border-0", cuisineClass)}>
                            {recipe.cuisine.replace("_", " ")}
                          </Badge>
                          <Badge variant="secondary">{recipe.cook_minutes} min</Badge>
                          <Badge variant="secondary">{recipe.difficulty}</Badge>
                          {recipe.vegetarian && (
                            <Badge variant="outline" className="bg-green-100 text-green-700 border-0">
                              Vegetarian
                            </Badge>
                          )}
                          {recipe.kid_friendly && (
                            <Badge variant="outline" className="bg-blue-100 text-blue-700 border-0">
                              Kid Friendly
                            </Badge>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="border-t border-gray-200 px-4 md:px-6 py-4 flex flex-col space-y-2 sm:flex-col sm:space-x-0 sm:space-y-2">
          {!loading && displayed.length > 0 && (
            <Button className="w-full" onClick={() => showFresh(allRecipes)}>
              Show Different Recipes
            </Button>
          )}
          <Button variant="ghost" className="w-full" onClick={onClose}>
            Skip
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Component ──

export default function QuickDinnerModal({
  familyId,
  onRecipesSelected,
  onClose,
}: QuickDinnerModalProps) {
  const [step, setStep] = useState<WizardStep>("count");
  const [numMains, setNumMains] = useState(1);
  const [currentConfigIndex, setCurrentConfigIndex] = useState(0);
  const [configs, setConfigs] = useState<MainConfig[]>([{ ...DEFAULT_CONFIG, dietary: { ...DEFAULT_DIETARY } }]);

  // Search phase
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const [collectedRecipes, setCollectedRecipes] = useState<Recipe[]>([]);

  const handleClose = () => { onClose(); };

  // ── Count Screen ──

  const handleCountSelect = (n: number) => {
    setNumMains(n);
    setConfigs(Array.from({ length: n }, () => ({
      ...DEFAULT_CONFIG,
      dietary: { ...DEFAULT_DIETARY },
    })));
    setCurrentConfigIndex(0);
    setStep("configure");
  };

  // ── Configure Screen ──

  const updateCurrentConfig = (update: Partial<MainConfig>) => {
    setConfigs((prev) =>
      prev.map((c, i) => (i === currentConfigIndex ? { ...c, ...update } : c))
    );
  };

  const toggleCuisine = (cuisine: Cuisine) => {
    const current = configs[currentConfigIndex].cuisines;
    updateCurrentConfig({
      cuisines: current.includes(cuisine)
        ? current.filter((c) => c !== cuisine)
        : [...current, cuisine],
    });
  };

  const toggleDietary = (key: keyof MainConfig["dietary"]) => {
    const current = configs[currentConfigIndex].dietary;
    updateCurrentConfig({ dietary: { ...current, [key]: !current[key] } });
  };

  const handleConfigBack = () => {
    if (currentConfigIndex > 0) setCurrentConfigIndex((i) => i - 1);
    else setStep("count");
  };

  const handleConfigNext = () => {
    if (currentConfigIndex < numMains - 1) setCurrentConfigIndex((i) => i + 1);
    else setStep("summary");
  };

  // ── Summary Screen ──

  const handleEditConfig = (index: number) => {
    setCurrentConfigIndex(index);
    setStep("configure");
  };

  const handleLetsCook = () => {
    setCurrentSearchIndex(0);
    setCollectedRecipes([]);
    setStep("searching");
  };

  // ── Search Phase: recipe selected or skipped ──

  const handleRecipePicked = (recipe: Recipe) => {
    const updated = [...collectedRecipes, recipe];
    if (currentSearchIndex + 1 < numMains) {
      setCollectedRecipes(updated);
      setCurrentSearchIndex((i) => i + 1);
    } else {
      // All done
      onRecipesSelected(updated);
    }
  };

  const handleSearchSkip = () => {
    if (currentSearchIndex + 1 < numMains) {
      setCurrentSearchIndex((i) => i + 1);
    } else {
      // Done — deliver whatever we collected (may be fewer than numMains)
      if (collectedRecipes.length > 0) {
        onRecipesSelected(collectedRecipes);
      } else {
        onClose();
      }
    }
  };

  // ── Searching step: render the appropriate modal ──

  if (step === "searching") {
    const config = configs[currentSearchIndex];
    const stepLabel = numMains > 1
      ? `${currentSearchIndex + 1} of ${numMains}`
      : undefined;

    if (config.source === "my_recipes") {
      return (
        <LocalRecipePicker
          key={currentSearchIndex}
          config={config}
          stepLabel={stepLabel}
          onRecipeSelected={handleRecipePicked}
          onClose={handleSearchSkip}
        />
      );
    }

    // Web search or surprise me — delegate to RecipeSearchModal
    return (
      <RecipeSearchModal
        key={currentSearchIndex}
        initialQuery={buildSearchQuery(config)}
        stepLabel={stepLabel}
        familyId={familyId}
        onRecipeSelected={handleRecipePicked}
        onClose={handleSearchSkip}
      />
    );
  }

  // ── Wizard steps: count / configure / summary ──

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="flex flex-col">
        <DialogHeader className="border-b border-gray-200 px-4 md:px-6 py-4 space-y-1.5">
          <DialogTitle className="text-lg font-bold text-gray-900">
            {step === "count" && "Quick Dinner Tonight"}
            {step === "configure" && (
              numMains > 1
                ? `Main ${currentConfigIndex + 1} of ${numMains}`
                : "Configure Your Main"
            )}
            {step === "summary" && "Review Your Picks"}
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-500">
            {step === "count" && "How many mains do you need?"}
            {step === "configure" && "Set your preferences for this main"}
            {step === "summary" && "Tap a card to edit, or hit Let's Cook!"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4">

          {/* ──── COUNT ──── */}
          {step === "count" && (
            <div className="flex flex-col items-center py-8 space-y-6">
              <p className="text-sm text-gray-600 font-medium">How many mains?</p>
              <div className="flex gap-3">
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    onClick={() => handleCountSelect(n)}
                    className={`w-14 h-14 rounded-full border-2 text-lg font-bold transition-colors ${
                      numMains === n
                        ? "border-orange-500 bg-orange-50 text-orange-600"
                        : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ──── CONFIGURE ──── */}
          {step === "configure" && configs[currentConfigIndex] && (
            <div className="space-y-5">
              {/* Cuisine */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Cuisine</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => updateCurrentConfig({ cuisines: [] })}
                    className={`px-3 py-1 rounded-full text-sm transition-colors ${
                      configs[currentConfigIndex].cuisines.length === 0
                        ? "bg-orange-100 text-orange-600 border-2 border-orange-500"
                        : "bg-gray-100 text-gray-600 border-2 border-transparent hover:border-gray-300"
                    }`}
                  >
                    Any
                  </button>
                  {VALID_CUISINES.map((cuisine) => {
                    const selected = configs[currentConfigIndex].cuisines.includes(cuisine);
                    const colorClass = selected
                      ? CUISINE_COLORS[cuisine] || "bg-orange-100 text-orange-700"
                      : "bg-gray-100 text-gray-600";
                    return (
                      <button
                        key={cuisine}
                        onClick={() => toggleCuisine(cuisine)}
                        className={`px-3 py-1 rounded-full text-sm transition-colors border-2 ${
                          selected ? `${colorClass} border-current` : `${colorClass} border-transparent hover:border-gray-300`
                        }`}
                      >
                        {cuisine.replace("_", " ")}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Source */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Source</label>
                <div className="flex flex-wrap gap-2">
                  {SOURCE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => updateCurrentConfig({ source: opt.value })}
                      className={`px-3 py-1 rounded-full text-sm transition-colors ${
                        configs[currentConfigIndex].source === opt.value
                          ? "bg-orange-100 text-orange-600 border-2 border-orange-500"
                          : "bg-gray-100 text-gray-600 border-2 border-transparent hover:border-gray-300"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dietary */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Dietary</label>
                <div className="flex flex-wrap gap-2">
                  {DIETARY_CHIPS.map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => toggleDietary(key)}
                      className={`px-3 py-1 rounded-full text-sm transition-colors ${
                        configs[currentConfigIndex].dietary[key]
                          ? "bg-orange-100 text-orange-600 border-2 border-orange-500"
                          : "bg-gray-100 text-gray-600 border-2 border-transparent hover:border-gray-300"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ingredients on hand */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ingredients I want to use
                </label>
                <p className="text-xs text-gray-400 mb-2">Optional — list what you have on hand</p>
                <Input
                  value={configs[currentConfigIndex].ingredients}
                  onChange={(e) => updateCurrentConfig({ ingredients: e.target.value })}
                  placeholder="e.g. chicken thighs, broccoli, soy sauce"
                />
              </div>

              {/* Chef/Site Preference */}
              {configs[currentConfigIndex].source === "search_web" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Chef or site preference
                  </label>
                  <Input
                    value={configs[currentConfigIndex].chefPreference}
                    onChange={(e) => updateCurrentConfig({ chefPreference: e.target.value })}
                    placeholder='e.g. "Ina Garten", "Budget Bytes"'
                  />
                </div>
              )}
            </div>
          )}

          {/* ──── SUMMARY ──── */}
          {step === "summary" && (
            <div className="space-y-3">
              {configs.map((config, idx) => {
                const activeDietary = DIETARY_CHIPS.filter(({ key }) => config.dietary[key]);
                const sourceLabel = SOURCE_OPTIONS.find((o) => o.value === config.source)?.label;
                return (
                  <button
                    key={idx}
                    onClick={() => handleEditConfig(idx)}
                    className="w-full border border-gray-200 rounded-lg p-4 hover:border-orange-500 hover:bg-orange-50 transition-colors text-left"
                  >
                    <div className="font-medium text-gray-900 mb-2">Main {idx + 1}</div>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {config.cuisines.length === 0 ? (
                        <Badge variant="secondary">Any cuisine</Badge>
                      ) : (
                        config.cuisines.map((c) => (
                          <Badge
                            key={c}
                            variant="outline"
                            className={cn("border-0", CUISINE_COLORS[c] || "bg-gray-100 text-gray-700")}
                          >
                            {c.replace("_", " ")}
                          </Badge>
                        ))
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="secondary">{sourceLabel}</Badge>
                      {config.source === "search_web" && config.chefPreference.trim() && (
                        <Badge variant="outline" className="bg-purple-50 text-purple-700 border-0">
                          {config.chefPreference.trim()}
                        </Badge>
                      )}
                      {config.ingredients.trim() && (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-0">
                          Using: {config.ingredients.trim()}
                        </Badge>
                      )}
                      {activeDietary.map(({ key, label }) => (
                        <Badge key={key} variant="outline" className="bg-green-50 text-green-700 border-0">
                          {label}
                        </Badge>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="border-t border-gray-200 px-4 md:px-6 py-4">
          {step === "count" && (
            <Button variant="ghost" className="w-full" onClick={handleClose}>Cancel</Button>
          )}

          {step === "configure" && (
            <div className="flex w-full gap-3">
              <Button variant="ghost" onClick={handleConfigBack}>Back</Button>
              <Button className="flex-1" onClick={handleConfigNext}>
                {currentConfigIndex < numMains - 1 ? "Next" : "Review"}
              </Button>
            </div>
          )}

          {step === "summary" && (
            <div className="flex w-full gap-3">
              <Button
                variant="ghost"
                onClick={() => { setCurrentConfigIndex(numMains - 1); setStep("configure"); }}
              >
                Back
              </Button>
              <Button className="flex-1" onClick={handleLetsCook}>Let's Cook!</Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
