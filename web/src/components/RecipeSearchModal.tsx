// components/RecipeSearchModal.tsx
// Modal for searching and importing recipes from the web via Claude

import { useState, useEffect, useRef } from "react";
import { searchRecipesWeb, createRecipe } from "../api";
import type { Recipe, WebSearchRecipeResult } from "@shared/types";
import { CUISINE_COLORS } from "./SwapMainModal";

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
  const [results, setResults] = useState<WebSearchRecipeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const didAutoSearch = useRef(false);

  useEffect(() => {
    if (prefetchedResults && prefetchedResults.length > 0) {
      setResults(prefetchedResults);
      didAutoSearch.current = true;
      return;
    }
    if (initialQuery && !didAutoSearch.current) {
      didAutoSearch.current = true;
      handleSearch();
    }
  }, [initialQuery]);

  const handleSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setSearching(true);
    setError(null);
    setResults([]);

    try {
      const data = await searchRecipesWeb(trimmed);
      setResults(data);
      if (data.length === 0) {
        setError("No recipes found. Try a different search.");
      }
    } catch (err: any) {
      setError(err.message || "Search failed. Please try again.");
    } finally {
      setSearching(false);
    }
  };

  const handleSelect = async (result: WebSearchRecipeResult) => {
    console.log("[RecipeSearchModal] handleSelect clicked", { name: result.name, cuisine: result.cuisine });
    setSaving(true);
    setError(null);

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
        ingredients: [],
        tags: [],
        source_type: "web_search",
        source_name: result.source_name,
        source_url: result.source_url,
        difficulty: result.difficulty,
        seasonal_tags: [],
        frequency_cap_per_month: null,
      });
      console.log("[RecipeSearchModal] recipe saved to DB", { id: saved.id, title: saved.title });
      onRecipeSelected(saved);
    } catch (err: any) {
      console.error("[RecipeSearchModal] createRecipe failed", err);
      setError(err.message || "Failed to save recipe.");
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !searching) {
      handleSearch();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-900">Find a Recipe</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
              disabled={saving}
            >
              ✕
            </button>
          </div>
          {/* Context: which day and what the user asked for */}
          {(dayLabel || stepLabel) && (
            <div className="flex items-center gap-2 mt-1">
              {dayLabel && (
                <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
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
            <p className="text-sm text-gray-500 mt-1">
              Searching for: <span className="font-medium text-gray-700">{initialQuery}</span>
            </p>
          )}
        </div>

        {/* Search Input */}
        <div className="px-6 pt-4 pb-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Ina Garten mac and cheese"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              disabled={searching || saving}
            />
            <button
              onClick={handleSearch}
              disabled={searching || saving || !query.trim()}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 text-sm whitespace-nowrap"
            >
              {searching ? "Searching..." : "Search"}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 pb-4">
          {searching ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-emerald-200 border-t-emerald-600 mb-3" />
              <p className="text-gray-500 text-sm">
                Searching the web for recipes...
              </p>
              <p className="text-gray-400 text-xs mt-1">
                This may take 5-15 seconds
              </p>
            </div>
          ) : saving ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-emerald-200 border-t-emerald-600 mb-3" />
              <p className="text-gray-500 text-sm">Saving recipe and fetching ingredients...</p>
              <p className="text-gray-400 text-xs mt-1">This may take 10-20 seconds</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="mt-2 mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-600 text-sm">{error}</p>
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
                        disabled={saving}
                        className="w-full border border-gray-200 rounded-lg p-4 hover:border-emerald-500 hover:bg-emerald-50 transition-colors text-left disabled:opacity-50"
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
                              className="text-emerald-600 hover:text-emerald-700 shrink-0"
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
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${cuisineClass}`}
                          >
                            {result.cuisine.replace("_", " ")}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                            {result.cook_minutes} min
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                            {result.difficulty}
                          </span>
                          {result.vegetarian && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                              Vegetarian
                            </span>
                          )}
                          {result.kid_friendly && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                              Kid Friendly
                            </span>
                          )}
                        </div>
                        <div className="mt-2 text-xs text-gray-400">
                          via {result.source_name}
                        </div>
                      </button>
                    );
                  })}
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
        <div className="border-t border-gray-200 px-6 py-4">
          <button
            onClick={onClose}
            disabled={saving}
            className="w-full px-4 py-2 text-gray-600 hover:text-gray-900 font-medium text-sm"
          >
            {results.length > 0 ? "Skip this recipe" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}
