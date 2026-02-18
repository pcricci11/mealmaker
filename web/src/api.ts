import type {
  Family, FamilyInput, FamilyMember, FamilyMemberInput,
  FamilyMemberV3, FamilyMemberInputV3,
  FamilyFavoriteChef, FamilyFavoriteMeal, FamilyFavoriteSide, FamilyFavoriteWebsite,
  WeeklyCookingSchedule, WeeklyLunchNeed, GeneratePlanRequestV3,
  Recipe, RecipeInput, Ingredient, MealPlan, GroceryList, DayOfWeek,
  GeneratePlanResponse, WebSearchRecipeResult,
} from "@shared/types";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

// ── Auth token injection ──
let _getToken: (() => Promise<string | null>) | null = null;

export function setTokenGetter(fn: () => Promise<string | null>) {
  _getToken = fn;
}

async function authFetch(url: string, options?: RequestInit): Promise<Response> {
  const headers = new Headers(options?.headers);
  if (_getToken) {
    const token = await _getToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }
  return fetch(url, { ...options, headers });
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

// ── Families ──
export async function getFamilies(): Promise<Family[]> {
  return json(await authFetch(`${BASE}/families`));
}

export async function getFamily(id: number): Promise<Family> {
  return json(await authFetch(`${BASE}/families/${id}`));
}

export async function createFamily(data: FamilyInput): Promise<Family> {
  return json(
    await authFetch(`${BASE}/families`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  );
}

export async function updateFamily(id: number, data: Partial<FamilyInput> & { serving_multiplier?: number }): Promise<Family> {
  return json(
    await authFetch(`${BASE}/families/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  );
}

// ── Family Members (v3: /api/members?family_id=) ──
export async function getMembers(familyId: number): Promise<FamilyMember[]> {
  return json(await authFetch(`${BASE}/members?family_id=${familyId}`));
}
export const getFamilyMembers = getMembers;

export async function createMember(familyId: number, data: FamilyMemberInput): Promise<FamilyMember> {
  return json(
    await authFetch(`${BASE}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, family_id: familyId }),
    }),
  );
}
export async function createFamilyMember(data: FamilyMemberInputV3): Promise<FamilyMemberV3> {
  return json(
    await authFetch(`${BASE}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  );
}

export async function updateMember(familyId: number, memberId: number, data: FamilyMemberInput): Promise<FamilyMember> {
  return json(
    await authFetch(`${BASE}/members/${memberId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  );
}
export async function updateFamilyMember(id: number, data: Partial<FamilyMemberV3>): Promise<FamilyMemberV3> {
  return json(
    await authFetch(`${BASE}/members/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  );
}

export async function deleteMember(familyId: number, memberId: number): Promise<void> {
  const res = await authFetch(`${BASE}/members/${memberId}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
}
export async function deleteFamilyMember(id: number): Promise<void> {
  const res = await authFetch(`${BASE}/members/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
}

// ── Recipes ──
export async function getRecipes(): Promise<Recipe[]> {
  return json(await authFetch(`${BASE}/recipes`));
}

export async function getRecipeById(id: number): Promise<Recipe> {
  return json(await authFetch(`${BASE}/recipes/${id}`));
}

export async function renameRecipe(id: number, name: string): Promise<Recipe> {
  return json(
    await authFetch(`${BASE}/recipes/${id}/rename`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  );
}

export async function updateRecipeNotes(id: number, notes: string | null): Promise<Recipe> {
  return json(
    await authFetch(`${BASE}/recipes/${id}/notes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    }),
  );
}

export async function deleteRecipe(id: number): Promise<void> {
  const res = await authFetch(`${BASE}/recipes/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to delete recipe");
  }
}

export async function createRecipe(data: RecipeInput, signal?: AbortSignal): Promise<Recipe> {
  return json(
    await authFetch(`${BASE}/recipes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal,
    }),
  );
}

export async function importRecipeFromUrl(url: string): Promise<{ recipe: Recipe; alreadyExists: boolean }> {
  return json(
    await authFetch(`${BASE}/recipes/import-from-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    }),
  );
}

export async function matchRecipeInDb(query: string, signal?: AbortSignal): Promise<{ matches: Array<{ recipe: Recipe; score: number }> }> {
  const data = await json<{ matches: Array<{ recipe: Recipe; score: number }> }>(
    await authFetch(`${BASE}/recipes/match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal,
    }),
  );
  return data;
}

export async function aiMatchRecipe(query: string, familyId: number, signal?: AbortSignal): Promise<{ matches: Array<{ recipe: Recipe; score: number; reasoning?: string }> }> {
  const data = await json<{ matches: Array<{ recipe: Recipe; score: number; reasoning?: string }> }>(
    await authFetch(`${BASE}/recipes/ai-match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, family_id: familyId }),
      signal,
    }),
  );
  return data;
}

export async function searchRecipesWeb(query: string, signal?: AbortSignal, familyId?: number): Promise<WebSearchRecipeResult[]> {
  const data = await json<{ results: WebSearchRecipeResult[] }>(
    await authFetch(`${BASE}/recipes/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, family_id: familyId }),
      signal,
    }),
  );
  return data.results;
}

export async function batchSearchRecipesWeb(
  queries: string[],
  signal?: AbortSignal,
  familyId?: number,
): Promise<Record<string, WebSearchRecipeResult[]>> {
  const data = await json<{ results: Record<string, WebSearchRecipeResult[]> }>(
    await authFetch(`${BASE}/recipes/batch-search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queries, family_id: familyId }),
      signal,
    }),
  );
  return data.results;
}

// ── Meal Plans ──
export async function generateMealPlan(
  familyId: number,
  locks?: Record<string, number>,
  variant?: number,
): Promise<GeneratePlanResponse> {
  return json(
    await authFetch(`${BASE}/meal-plans/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ family_id: familyId, locks, variant }),
    }),
  );
}

export async function getMealPlan(id: number): Promise<MealPlan> {
  return json(await authFetch(`${BASE}/meal-plans/${id}`));
}

export async function swapMealPlanItem(planId: number, day: DayOfWeek): Promise<MealPlan> {
  return json(
    await authFetch(`${BASE}/meal-plans/${planId}/swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ day }),
    }),
  );
}

export async function swapMainRecipe(mealItemId: number, newRecipeId: number): Promise<MealPlan> {
  return json(
    await authFetch(`${BASE}/meal-plans/items/${mealItemId}/swap-recipe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipe_id: newRecipeId }),
    }),
  );
}

// ── Smart Setup ──
export async function smartSetup(familyId: number, text: string, signal?: AbortSignal): Promise<{
  cooking_days: Record<string, { is_cooking: boolean; meal_mode: string }>;
  lunch_needs: Record<number, string[]>;
  preferences: {
    max_cook_minutes_weekday?: number;
    max_cook_minutes_weekend?: number;
    vegetarian_ratio?: number;
  };
  specific_meals: Array<{ day: string; description: string }>;
}> {
  return json(
    await authFetch(`${BASE}/smart-setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ family_id: familyId, text }),
      signal,
    }),
  );
}

// ── Sides Operations ──
export async function getSidesLibrary(filters?: { category?: string; weight?: string }): Promise<any[]> {
  let url = `${BASE}/sides/library`;
  if (filters) {
    const params = new URLSearchParams();
    if (filters.category) params.append("category", filters.category);
    if (filters.weight) params.append("weight", filters.weight);
    if (params.toString()) url += `?${params.toString()}`;
  }
  return json(await fetch(url));
}

export async function getSideSuggestions(mainRecipeId: number, excludeIds?: number[]): Promise<any[]> {
  return json(
    await authFetch(`${BASE}/sides/suggest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ main_recipe_id: mainRecipeId, exclude_ids: excludeIds || [] }),
    }),
  );
}

export async function swapSide(mealItemId: number, newSideId?: number, customName?: string): Promise<void> {
  const body: any = {};
  if (newSideId) body.new_side_id = newSideId;
  if (customName) body.custom_name = customName;
  const res = await authFetch(`${BASE}/sides/swap/${mealItemId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to swap side");
}

export async function addSide(mainMealItemId: number, sideId?: number, customName?: string): Promise<void> {
  const body: any = {};
  if (sideId) body.side_id = sideId;
  if (customName) body.custom_name = customName;
  const res = await authFetch(`${BASE}/sides/add/${mainMealItemId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to add side");
}

export async function removeSide(mealItemId: number): Promise<void> {
  const res = await authFetch(`${BASE}/sides/${mealItemId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to remove side");
}

export async function removeMealItem(mealItemId: number): Promise<void> {
  const res = await authFetch(`${BASE}/meal-plans/items/${mealItemId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to remove meal item");
}

export async function addMealToDay(
  planId: number,
  day: string,
  recipeId: number,
  mealType?: string,
): Promise<{ id: number }> {
  return json(
    await authFetch(`${BASE}/meal-plans/${planId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ day, recipe_id: recipeId, meal_type: mealType }),
    }),
  );
}

// ── Grocery List ──
export async function suggestIngredients(recipeId: number): Promise<Ingredient[]> {
  return json(
    await authFetch(`${BASE}/recipes/${recipeId}/suggest-ingredients`, { method: "POST" }),
  );
}

export async function getGroceryList(planId: number): Promise<GroceryList> {
  return json(await authFetch(`${BASE}/meal-plans/${planId}/grocery-list`));
}

// ── Favorite Chefs ──
export async function getFavoriteChefs(familyId: number): Promise<FamilyFavoriteChef[]> {
  return json(await authFetch(`${BASE}/favorites/chefs?family_id=${familyId}`));
}

export async function createFavoriteChef(familyId: number, name: string, cuisines?: string[]): Promise<FamilyFavoriteChef> {
  return json(
    await authFetch(`${BASE}/favorites/chefs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ family_id: familyId, name, cuisines }),
    }),
  );
}

export async function deleteFavoriteChef(id: number): Promise<void> {
  const res = await authFetch(`${BASE}/favorites/chefs/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete favorite chef");
}

// ── Favorite Websites ──
export async function getFavoriteWebsites(familyId: number): Promise<FamilyFavoriteWebsite[]> {
  return json(await authFetch(`${BASE}/favorites/websites?family_id=${familyId}`));
}

export async function createFavoriteWebsite(familyId: number, name: string): Promise<FamilyFavoriteWebsite> {
  return json(
    await authFetch(`${BASE}/favorites/websites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ family_id: familyId, name }),
    }),
  );
}

export async function deleteFavoriteWebsite(id: number): Promise<void> {
  const res = await authFetch(`${BASE}/favorites/websites/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete favorite website");
}

// ── Favorite Meals ──
export async function getFavoriteMeals(familyId: number): Promise<FamilyFavoriteMeal[]> {
  return json(await authFetch(`${BASE}/favorites/meals?family_id=${familyId}`));
}

export async function createFavoriteMeal(familyId: number, data: Partial<FamilyFavoriteMeal>): Promise<FamilyFavoriteMeal> {
  return json(
    await authFetch(`${BASE}/favorites/meals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, family_id: familyId }),
    }),
  );
}

export async function updateFavoriteMeal(id: number, data: Partial<FamilyFavoriteMeal>): Promise<FamilyFavoriteMeal> {
  return json(
    await authFetch(`${BASE}/favorites/meals/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  );
}

export async function deleteFavoriteMeal(id: number): Promise<void> {
  const res = await authFetch(`${BASE}/favorites/meals/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete favorite meal");
}

// ── Favorite Sides ──
export async function getFavoriteSides(familyId: number): Promise<FamilyFavoriteSide[]> {
  return json(await authFetch(`${BASE}/favorites/sides?family_id=${familyId}`));
}

export async function createFavoriteSide(familyId: number, data: Partial<FamilyFavoriteSide>): Promise<FamilyFavoriteSide> {
  return json(
    await authFetch(`${BASE}/favorites/sides`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, family_id: familyId }),
    }),
  );
}

export async function updateFavoriteSide(id: number, data: Partial<FamilyFavoriteSide>): Promise<FamilyFavoriteSide> {
  return json(
    await authFetch(`${BASE}/favorites/sides/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  );
}

export async function deleteFavoriteSide(id: number): Promise<void> {
  const res = await authFetch(`${BASE}/favorites/sides/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete favorite side");
}

// ── Cooking Schedule ──
export async function getCookingSchedule(familyId: number, weekStart: string): Promise<WeeklyCookingSchedule[]> {
  return json(await authFetch(`${BASE}/cooking-schedule?family_id=${familyId}&week_start=${weekStart}`));
}

export async function saveCookingSchedule(familyId: number, weekStart: string, schedule: WeeklyCookingSchedule[]): Promise<void> {
  const res = await authFetch(`${BASE}/cooking-schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ family_id: familyId, week_start: weekStart, schedule }),
  });
  if (!res.ok) throw new Error("Failed to save cooking schedule");
}

// ── Lunch Planning ──
export async function getLunchNeeds(familyId: number, weekStart: string): Promise<WeeklyLunchNeed[]> {
  return json(await authFetch(`${BASE}/cooking-schedule/lunch?family_id=${familyId}&week_start=${weekStart}`));
}

export async function saveLunchNeeds(familyId: number, weekStart: string, lunchNeeds: WeeklyLunchNeed[]): Promise<void> {
  const res = await authFetch(`${BASE}/cooking-schedule/lunch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ family_id: familyId, week_start: weekStart, lunch_needs: lunchNeeds }),
  });
  if (!res.ok) throw new Error("Failed to save lunch needs");
}

// ── V3 Plan Generation ──
export async function generateMealPlanV3(request: GeneratePlanRequestV3): Promise<MealPlan> {
  return json(
    await authFetch(`${BASE}/meal-plans/generate-v3`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }),
  );
}

export async function lockMealPlan(request: {
  family_id: number;
  week_start: string;
  items: Array<{ day: string; recipe_id: number }>;
}, signal?: AbortSignal): Promise<MealPlan> {
  return json(
    await authFetch(`${BASE}/meal-plans/lock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    }),
  );
}

export async function cloneMealPlan(planId: number, weekStart: string, mode?: "replace" | "merge"): Promise<MealPlan> {
  return json(
    await authFetch(`${BASE}/meal-plans/${planId}/clone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ week_start: weekStart, mode: mode || "replace" }),
    }),
  );
}

export async function getMealPlanHistory(familyId?: number): Promise<any[]> {
  let url = `${BASE}/meal-plans/history`;
  if (familyId) {
    url += `?family_id=${familyId}`;
  }
  const res = await authFetch(url);
  if (!res.ok) throw new Error("Failed to fetch meal plan history");
  return res.json();
}

export async function markMealAsLoved(mealItemId: number): Promise<{ loved: boolean }> {
  const res = await authFetch(`${BASE}/meal-plans/items/${mealItemId}/love`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error("Failed to toggle love");
  return res.json();
}

export async function copyMealToThisWeek(mealItemId: number, targetDay: string, targetWeekStart: string): Promise<void> {
  const res = await authFetch(`${BASE}/meal-plans/items/${mealItemId}/copy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target_day: targetDay, target_week_start: targetWeekStart }),
  });
  if (!res.ok) throw new Error("Failed to copy meal");
}

// ── Conversational Plan ──
export interface ConversationParseResult {
  cooking_days: Record<string, { is_cooking: boolean; meal_mode: string }>;
  specific_meals: Array<{ day: string; description: string }>;
  dietary_preferences: {
    vegetarian_ratio: number;
    allergies: string[];
    cuisine_preferences: string[];
  };
  lunch_needs: Record<number, string[]>;
  cook_time_limits: { weekday: number; weekend: number };
}

export async function generateFromConversation(text: string): Promise<ConversationParseResult> {
  return json(
    await authFetch(`${BASE}/plan/generate-from-conversation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }),
  );
}

// ── Auth / Households ──
export async function syncUser(email?: string, displayName?: string): Promise<{
  user: { id: number; clerk_id: string; email: string | null; display_name: string | null };
  household: { id: number; name: string; invite_code: string } | null;
}> {
  return json(
    await authFetch(`${BASE}/auth/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, display_name: displayName }),
    }),
  );
}

export async function getMyHousehold(): Promise<{
  household: { id: number; name: string; invite_code: string; created_by: number } | null;
  members: Array<{ id: number; role: string; user_id: number; display_name: string | null }>;
  myRole?: string;
}> {
  return json(await authFetch(`${BASE}/households/mine`));
}

export async function createHousehold(name: string): Promise<{
  household: { id: number; name: string; invite_code: string };
  family: { id: number; name: string; household_id: number };
}> {
  return json(
    await authFetch(`${BASE}/households`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  );
}

export async function joinHousehold(inviteCode: string): Promise<{
  household: { id: number; name: string; invite_code: string };
  alreadyMember: boolean;
}> {
  return json(
    await authFetch(`${BASE}/households/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invite_code: inviteCode }),
    }),
  );
}

// ── Helpers ──
export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}
