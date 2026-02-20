// components/RecipeSearchModal.tsx
// Modal for searching and importing recipes from the web via Claude

import { useState, useEffect, useRef } from "react";
import { searchRecipesWeb, createRecipe, isAbortError } from "../api";
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
  onRecipeSelected: (recipe: Recipe) => void;
  onClose: () => void;
}

export default function RecipeSearchModal({
  initialQuery,
  dayLabel,
  stepLabel,
  prefetchedResults,
  onRecipeSelected,
  onClose,
}: Props) {
  const [query, setQuery] = useState(initialQuery || "");
  const hasPrefetched = !!(prefetchedResults && prefetchedResults.length > 0);
  const [results, setResults] = useState<WebSearchRecipeResult[]>(hasPrefetched ? prefetchedResults : []);
  const [searching, setSearching] = useState(false);
  const [searchingWeb, setSearchingWeb] = useState(false);
  const [didWebSearch, setDidWebSearch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingPhase, setSavingPhase] = useState<"adding" | "ingredients" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const didAutoSearch = useRef(hasPrefetched);
  const savingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Abort on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Only auto-search when there are no prefetched results
  useEffect(() => {
    if (didAutoSearch.current) return;
    if (initialQuery) {
      didAutoSearch.current = true;
      handleSearch();
    }
  }, [initialQuery]);

  const handleSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSearching(true);
    setError(null);
    setResults([]);
    setDidWebSearch(false);

    try {
      const data = await searchRecipesWeb(trimmed, controller.signal);
      setResults(data);
      if (data.length === 0) {
        setError("Sorry Chef, nothing matched your search! Try tweaking the words or searching for something different.");
      }
    } catch (err: any) {
      if (isAbortError(err)) return;
      setError("Sorry Chef, that search didn't work out! Give it another try or tweak your search terms.");
    } finally {
      setSearching(false);
    }
  };

  const handleWebSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSearchingWeb(true);
    setError(null);

    try {
      const data = await searchRecipesWeb(trimmed, controller.signal, undefined, { skipSpoonacular: true });
      // Append web results, deduplicating by source_url
      setResults((prev) => {
        const existingUrls = new Set(prev.map((r) => r.source_url));
        const newResults = data.filter((r) => !existingUrls.has(r.source_url));
        return [...prev, ...newResults];
      });
      setDidWebSearch(true);
    } catch (err: any) {
      if (isAbortError(err)) return;
      setError("Web search didn't work out. Give it another try.");
    } finally {
      setSearchingWeb(false);
    }
  };

  const handleSelect = async (result: WebSearchRecipeResult) => {
    console.log("[RecipeSearchModal] handleSelect clicked", { name: result.name, cuisine: result.cuisine });
    const controller = new AbortController();
    abortRef.current = controller;

    setSaving(true);
    setSavingPhase("adding");
    setError(null);

    // After 3 seconds, switch to the ingredients phase message
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
      console.log("[RecipeSearchModal] recipe saved to DB", { id: saved.id, title: saved.title });
      if (savingTimerRef.current) clearTimeout(savingTimerRef.current);
      onRecipeSelected(saved);
    } catch (err: any) {
      if (isAbortError(err)) return;
      console.error("[RecipeSearchModal] createRecipe failed", err);
      if (savingTimerRef.current) clearTimeout(savingTimerRef.current);
      setError(err.message || "Failed to save recipe.");
      setSaving(false);
      setSavingPhase(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !searching) {
      handleSearch();
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) { abortRef.current?.abort(); onClose(); } }}>
      <DialogContent className="flex flex-col">
        {/* Header */}
        <DialogHeader className="border-b border-gray-200 px-4 md:px-6 py-4 space-y-1.5">
          <DialogTitle className="text-lg font-bold text-gray-900">Find a Recipe</DialogTitle>
          {/* Context: which day and what the user asked for */}
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
              disabled={searching || saving}
            />
            <Button
              onClick={handleSearch}
              disabled={searching || saving || !query.trim()}
              className="whitespace-nowrap"
            >
              {searching ? "Searching..." : "Search"}
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-4">
          {searching || (searchingWeb && results.length === 0) ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-orange-200 border-t-orange-500 mb-3" />
              <p className="text-gray-500 text-sm">
                Sizzling up some recipe ideas...
              </p>
              <p className="text-gray-400 text-xs mt-1">
                Sauteing through the web for you
              </p>
              <Button
                variant="ghost"
                onClick={() => {
                  abortRef.current?.abort();
                  setSearching(false);
                  setResults([]);
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
                    onClick={handleSearch}
                    disabled={!query.trim()}
                    className="mt-2 text-orange-600 hover:text-orange-700"
                  >
                    Try Again
                  </Button>
                </div>
              )}
              {results.length > 0 ? (
                <div className="space-y-2 mt-2">
                  <p className="text-xs text-gray-400 mb-1">
                    Pick one to add to your recipes and use it this week:
                  </p>
                  {results.map((result, i) => {
                    const cuisineClass =
                      CUISINE_COLORS[result.cuisine] || "bg-gray-100 text-gray-700";
                    return (
                      <button
                        key={i}
                        onClick={() => handleSelect(result)}
                        disabled={saving || searchingWeb}
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

                  {/* Web search CTA / spinner */}
                  {searchingWeb ? (
                    <div className="text-center py-6">
                      <div className="inline-block animate-spin rounded-full h-6 w-6 border-3 border-orange-200 border-t-orange-500 mb-2" />
                      <p className="text-gray-500 text-sm">Searching the web for more...</p>
                    </div>
                  ) : !didWebSearch ? (
                    <button
                      onClick={handleWebSearch}
                      className="w-full mt-1 py-3 rounded-lg text-sm font-medium text-gray-500 hover:text-orange-600 hover:bg-orange-50 border border-dashed border-gray-200 hover:border-orange-300 transition-colors flex items-center justify-center gap-2"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      Can't find it? Search the web for more
                    </button>
                  ) : null}
                </div>
              ) : !searching && !initialQuery ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  Search for a recipe to get started
                </div>
              ) : null}
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
            {results.length > 0 ? "Skip this recipe" : "Cancel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
