// components/RecipeSearchModal.tsx
// Modal for searching recipes: Tier 1 (My Recipes) → Tier 2 (Spoonacular) → Tier 3 (Claude web search)

import { useState, useEffect, useRef, useCallback } from "react";
import { matchRecipeInDb, searchRecipesWeb, createRecipe, isAbortError } from "../api";
import { formatApiError } from "../utils/errorFormatter";
import type { Recipe, WebSearchRecipeResult } from "@shared/types";
import { CUISINE_COLORS } from "./SwapMainModal";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Props {
  initialQuery?: string;
  dayLabel?: string;
  stepLabel?: string;          // e.g. "1 of 3"
  prefetchedResults?: WebSearchRecipeResult[];
  familyId?: number;
  onRecipeSelected: (recipe: Recipe) => void;
  onClose: () => void;
}

type LoadingTier = "my-recipes" | "spoonacular" | "claude" | null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function RecipeSearchModal({
  initialQuery,
  dayLabel,
  stepLabel,
  prefetchedResults,
  familyId,
  onRecipeSelected,
  onClose,
}: Props) {
  const [query, setQuery] = useState(initialQuery || "");
  const [loadingTier, setLoadingTier] = useState<LoadingTier>(null);
  const [completedTiers, setCompletedTiers] = useState<Set<string>>(new Set());
  const [myRecipeMatches, setMyRecipeMatches] = useState<Array<{ recipe: Recipe; score: number }>>([]);
  const [webResults, setWebResults] = useState<WebSearchRecipeResult[]>([]);
  const [saving, setSaving] = useState(false);
  const [savingPhase, setSavingPhase] = useState<"adding" | "ingredients" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const didAutoSearch = useRef(!!(prefetchedResults && prefetchedResults.length > 0));
  const savingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Abort on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Collect source_urls from My Recipe matches for dedup
  const myRecipeUrls = useRef(new Set<string>());

  const markTierCompleted = useCallback((tier: string) => {
    setCompletedTiers((prev) => new Set(prev).add(tier));
    setLoadingTier(null);
  }, []);

  // Dedup helper: filter out web results that duplicate existing webResults or myRecipeMatches
  const deduplicateWebResults = useCallback((incoming: WebSearchRecipeResult[], existingWeb: WebSearchRecipeResult[]): WebSearchRecipeResult[] => {
    const existingUrls = new Set(existingWeb.map((r) => r.source_url));
    return incoming.filter(
      (r) => !existingUrls.has(r.source_url) && !myRecipeUrls.current.has(r.source_url),
    );
  }, []);

  // ── Tier 1: My Recipes ──
  const handleSearchMyRecipes = useCallback(async (searchQuery?: string) => {
    const trimmed = (searchQuery ?? query).trim();
    if (!trimmed) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Reset all state
    setMyRecipeMatches([]);
    setWebResults([]);
    setCompletedTiers(new Set());
    setError(null);
    setLoadingTier("my-recipes");
    myRecipeUrls.current.clear();

    try {
      const [result] = await Promise.all([
        matchRecipeInDb(trimmed, controller.signal),
        sleep(1500),
      ]);
      const matches = result.matches;
      setMyRecipeMatches(matches);
      // Track source_urls for dedup
      for (const m of matches) {
        if (m.recipe.source_url) myRecipeUrls.current.add(m.recipe.source_url);
      }
      markTierCompleted("my-recipes");
    } catch (err: unknown) {
      if (isAbortError(err)) return;
      setError("Couldn't check your recipes. Try searching again.");
      setLoadingTier(null);
    }
  }, [query, markTierCompleted]);

  // ── Tier 2: Spoonacular ──
  const handleSearchSpoonacular = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setError(null);
    setLoadingTier("spoonacular");

    try {
      const data = await searchRecipesWeb(trimmed, controller.signal, undefined, { spoonacularOnly: true });
      setWebResults((prev) => {
        const deduped = deduplicateWebResults(data, prev);
        return [...prev, ...deduped];
      });
      markTierCompleted("spoonacular");
    } catch (err: unknown) {
      if (isAbortError(err)) return;
      setError("Database search didn't work out. Try the web search below.");
      setLoadingTier(null);
      // Still mark tier as completed so user can proceed to Tier 3
      markTierCompleted("spoonacular");
    }
  }, [query, deduplicateWebResults, markTierCompleted]);

  // ── Tier 3: Claude web search ──
  const handleSearchClaude = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setError(null);
    setLoadingTier("claude");

    try {
      const data = await searchRecipesWeb(trimmed, controller.signal, familyId, { skipSpoonacular: true });
      setWebResults((prev) => {
        const deduped = deduplicateWebResults(data, prev);
        return [...prev, ...deduped];
      });
      markTierCompleted("claude");
    } catch (err: unknown) {
      if (isAbortError(err)) return;
      setError("Web search didn't work out. Give it another try.");
      setLoadingTier(null);
      markTierCompleted("claude");
    }
  }, [query, familyId, deduplicateWebResults, markTierCompleted]);

  // Auto-search on mount
  useEffect(() => {
    if (didAutoSearch.current) {
      // Have prefetched results — still run Tier 1, then set prefetched as webResults
      if (initialQuery) {
        (async () => {
          await handleSearchMyRecipes(initialQuery);
          if (prefetchedResults && prefetchedResults.length > 0) {
            setWebResults(prefetchedResults);
            setCompletedTiers((prev) => new Set(prev).add("my-recipes").add("spoonacular"));
          }
        })();
      }
      return;
    }
    if (initialQuery) {
      didAutoSearch.current = true;
      handleSearchMyRecipes(initialQuery);
    }
  }, [initialQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Selection handlers ──

  const handleSelectMyRecipe = (recipe: Recipe) => {
    onRecipeSelected(recipe);
  };

  const handleSelect = async (result: WebSearchRecipeResult) => {
    const controller = new AbortController();
    abortRef.current = controller;

    setSaving(true);
    setSavingPhase("adding");
    setError(null);

    savingTimerRef.current = setTimeout(() => {
      setSavingPhase("ingredients");
    }, 3000);

    try {
      const saved = await createRecipe({
        title: result.name,
        cuisine: result.cuisine,
        vegetarian: result.vegetarian,
        protein_type: result.protein_type,
        cook_minutes: result.cook_minutes,
        allergens: [],
        kid_friendly: result.kid_friendly,
        makes_leftovers: false,
        leftovers_score: 0,
        ingredients: result.ingredients || [],
        tags: [],
        source_type: "web_search",
        source_name: result.source_name,
        source_url: result.source_url,
        difficulty: result.difficulty,
        seasonal_tags: [],
        frequency_cap_per_month: null,
        notes: null,
        image_url: result.image_url || null,
      }, controller.signal);
      if (savingTimerRef.current) clearTimeout(savingTimerRef.current);
      onRecipeSelected(saved);
    } catch (err: unknown) {
      if (isAbortError(err)) return;
      if (savingTimerRef.current) clearTimeout(savingTimerRef.current);
      setError(formatApiError(err));
      setSaving(false);
      setSavingPhase(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !loadingTier && !saving) {
      handleSearchMyRecipes();
    }
  };

  const isLoading = loadingTier !== null;
  const hasAnyResults = myRecipeMatches.length > 0 || webResults.length > 0;
  const tier1Done = completedTiers.has("my-recipes");
  const tier2Done = completedTiers.has("spoonacular");
  const tier3Done = completedTiers.has("claude");

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) { abortRef.current?.abort(); onClose(); } }}>
      <DialogContent className="flex flex-col">
        {/* Header */}
        <DialogHeader className="border-b border-gray-200 px-4 md:px-6 py-4 space-y-1.5">
          <DialogTitle className="text-lg font-bold text-gray-900">Find a Recipe</DialogTitle>
          {(dayLabel || stepLabel) && (
            <div className="flex items-center gap-2 mt-1">
              {dayLabel && (
                <span className="text-xs font-semibold uppercase tracking-wide text-orange-600 bg-orange-50 px-2 py-0.5 rounded">
                  {dayLabel}
                </span>
              )}
              {stepLabel && (
                <span className="text-xs text-gray-400">
                  Recipe {stepLabel}
                </span>
              )}
            </div>
          )}
          {initialQuery && (
            <DialogDescription className="text-sm text-gray-500 mt-1">
              Searching for: <span className="font-medium text-gray-700">{initialQuery}</span>
            </DialogDescription>
          )}
        </DialogHeader>

        {/* Search Input */}
        <div className="px-4 md:px-6 pt-4 pb-2">
          <div className="flex gap-2">
            <Input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Ina Garten mac and cheese"
              disabled={isLoading || saving}
            />
            <Button
              onClick={() => handleSearchMyRecipes()}
              disabled={isLoading || saving || !query.trim()}
              className="whitespace-nowrap"
            >
              {loadingTier === "my-recipes" ? "Searching..." : "Search"}
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-4">
          {/* Tier 1 full-screen loading */}
          {loadingTier === "my-recipes" && !hasAnyResults ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-orange-200 border-t-orange-500 mb-3" />
              <p className="text-gray-500 text-sm">Checking Your Recipes First...</p>
              <Button
                variant="ghost"
                onClick={() => {
                  abortRef.current?.abort();
                  setLoadingTier(null);
                }}
                className="mt-3"
              >
                Cancel Search
              </Button>
            </div>
          ) : saving ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-orange-200 border-t-orange-500 mb-3" />
              {savingPhase === "ingredients" ? (
                <>
                  <p className="text-gray-500 text-sm">Chopping through the ingredient list...</p>
                  <p className="text-gray-400 text-xs mt-1">Prepping ingredients for your grocery lists</p>
                </>
              ) : (
                <>
                  <p className="text-gray-500 text-sm">Whisking this recipe into your collection...</p>
                  <p className="text-gray-400 text-xs mt-1">Almost plated!</p>
                </>
              )}
              <Button
                variant="ghost"
                onClick={() => {
                  abortRef.current?.abort();
                  if (savingTimerRef.current) clearTimeout(savingTimerRef.current);
                  setSaving(false);
                  setSavingPhase(null);
                }}
                className="mt-3"
              >
                Cancel
              </Button>
            </div>
          ) : (
            <>
              {error && (
                <div className="mt-2 mb-2 px-4 py-3 bg-orange-50 border border-orange-200 rounded-lg text-center">
                  <p className="text-gray-700 text-sm">{error}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSearchMyRecipes()}
                    disabled={!query.trim()}
                    className="mt-2 text-orange-600 hover:text-orange-700"
                  >
                    Try Again
                  </Button>
                </div>
              )}

              {/* ── My Recipes Section ── */}
              {tier1Done && myRecipeMatches.length > 0 && (
                <div className="mt-2">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">📖</span>
                    <span className="text-sm font-medium text-orange-800">From Your Recipes</span>
                  </div>
                  <div className="space-y-2">
                    {myRecipeMatches.map(({ recipe, score }) => {
                      const cuisineClass = CUISINE_COLORS[recipe.cuisine] || "bg-gray-100 text-gray-700";
                      const pct = Math.round(score * 100);
                      return (
                        <button
                          key={recipe.id}
                          onClick={() => handleSelectMyRecipe(recipe)}
                          disabled={saving}
                          className="w-full bg-white rounded-lg border border-orange-200 p-4 hover:border-orange-500 hover:bg-orange-50 transition-colors text-left"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-semibold text-gray-900">{recipe.title}</div>
                            <span className="text-xs font-medium text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
                              {pct}% match
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            <Badge variant="outline" className={cn("border-0", cuisineClass)}>
                              {recipe.cuisine.replace("_", " ")}
                            </Badge>
                            <Badge variant="secondary">
                              {recipe.cook_minutes} min
                            </Badge>
                            {recipe.difficulty && (
                              <Badge variant="secondary">
                                {recipe.difficulty}
                              </Badge>
                            )}
                            {recipe.vegetarian && (
                              <Badge variant="outline" className="bg-green-100 text-green-700 border-0">
                                Vegetarian
                              </Badge>
                            )}
                          </div>
                          {recipe.source_name && (
                            <div className="text-xs text-gray-500 mt-2">
                              by {recipe.source_name}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Empty state for Tier 1 */}
              {tier1Done && myRecipeMatches.length === 0 && (
                <div className="mt-2 mb-2 text-center py-3 text-gray-400 text-sm">
                  No matches in your recipes
                </div>
              )}

              {/* ── Web Results Section ── */}
              {webResults.length > 0 && (
                <div className={cn("mt-4", myRecipeMatches.length > 0 && "border-t border-gray-100 pt-4")}>
                  {myRecipeMatches.length > 0 && (
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm font-medium text-gray-600">More Recipes</span>
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mb-1">
                    Pick one to add to your recipes and use it this week:
                  </p>
                  <div className="space-y-2">
                    {webResults.map((result, i) => {
                      const cuisineClass = CUISINE_COLORS[result.cuisine] || "bg-gray-100 text-gray-700";
                      return (
                        <button
                          key={`web-${i}`}
                          onClick={() => handleSelect(result)}
                          disabled={saving || isLoading}
                          className="w-full border border-gray-200 rounded-lg p-4 hover:border-orange-500 hover:bg-orange-50 transition-colors text-left disabled:opacity-50"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-medium text-gray-900">
                              {result.name}
                            </div>
                            {result.source_url && (
                              <a
                                href={result.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-orange-500 hover:text-orange-600 shrink-0"
                                title="View original recipe"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              </a>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 mt-1">
                            {result.description}
                          </p>
                          <div className="flex flex-wrap gap-2 mt-2">
                            <Badge variant="outline" className={cn("border-0", cuisineClass)}>
                              {result.cuisine.replace("_", " ")}
                            </Badge>
                            <Badge variant="secondary">
                              {result.cook_minutes} min
                            </Badge>
                            <Badge variant="secondary">
                              {result.difficulty}
                            </Badge>
                            {result.vegetarian && (
                              <Badge variant="outline" className="bg-green-100 text-green-700 border-0">
                                Vegetarian
                              </Badge>
                            )}
                            {result.kid_friendly && (
                              <Badge variant="outline" className="bg-blue-100 text-blue-700 border-0">
                                Kid Friendly
                              </Badge>
                            )}
                            {result.is_paywalled && (
                              <Badge variant="outline" className="bg-amber-100 text-amber-700 border-0">
                                Paywalled
                              </Badge>
                            )}
                            {result.ingredients && result.ingredients.length > 0 && (
                              <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-0">
                                {result.ingredients.length} ingredients
                              </Badge>
                            )}
                          </div>
                          <div className="mt-2 text-xs text-gray-400">
                            via {result.source_name}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Inline loading spinners for Tier 2 & 3 ── */}
              {loadingTier === "spoonacular" && (
                <div className="text-center py-6">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-3 border-orange-200 border-t-orange-500 mb-2" />
                  <p className="text-gray-500 text-sm">Searching Our Database...</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      abortRef.current?.abort();
                      setLoadingTier(null);
                      markTierCompleted("spoonacular");
                    }}
                    className="mt-2"
                  >
                    Cancel
                  </Button>
                </div>
              )}

              {loadingTier === "claude" && (
                <div className="text-center py-6">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-3 border-orange-200 border-t-orange-500 mb-2" />
                  <p className="text-gray-500 text-sm">Sizzling up some recipe ideas...</p>
                  <p className="text-gray-400 text-xs mt-1">Sauteing through the web for you</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      abortRef.current?.abort();
                      setLoadingTier(null);
                      markTierCompleted("claude");
                    }}
                    className="mt-2"
                  >
                    Cancel
                  </Button>
                </div>
              )}

              {/* ── Progressive CTAs ── */}
              {tier1Done && !tier2Done && !loadingTier && (
                <button
                  onClick={handleSearchSpoonacular}
                  className="w-full mt-3 py-3 rounded-lg text-sm font-medium text-gray-500 hover:text-orange-600 hover:bg-orange-50 border border-dashed border-gray-200 hover:border-orange-300 transition-colors flex items-center justify-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Search our recipe database for more
                </button>
              )}

              {tier2Done && !tier3Done && !loadingTier && (
                <button
                  onClick={handleSearchClaude}
                  className="w-full mt-3 py-3 rounded-lg text-sm font-medium text-gray-500 hover:text-orange-600 hover:bg-orange-50 border border-dashed border-gray-200 hover:border-orange-300 transition-colors flex items-center justify-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                  Search the Web Using Your Preferences
                </button>
              )}

              {/* Initial empty state */}
              {!tier1Done && !isLoading && !initialQuery && (
                <div className="text-center py-8 text-gray-400 text-sm">
                  Search for a recipe to get started
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="border-t border-gray-200 px-4 md:px-6 py-4">
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => { abortRef.current?.abort(); onClose(); }}
          >
            {hasAnyResults ? "Skip this recipe" : "Cancel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
