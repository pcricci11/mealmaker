import type {
  Family, FamilyInput, FamilyMember, FamilyMemberInput,
  FamilyMemberV3, FamilyMemberInputV3,
  FamilyFavoriteChef, FamilyFavoriteMeal, FamilyFavoriteSide,
  WeeklyCookingSchedule, WeeklyLunchNeed, GeneratePlanRequestV3,
  Recipe, RecipeInput, MealPlan, GroceryList, DayOfWeek,
  GeneratePlanResponse, ServingMultiplier,
} from "@shared/types";

const BASE = "/api";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

// ── Families ──
export async function getFamilies(): Promise<Family[]> {
  return json(await fetch(`${BASE}/families`));
}

export async function getFamily(id: number): Promise<Family> {
  return json(await fetch(`${BASE}/families/${id}`));
}

export async function createFamily(data: FamilyInput): Promise<Family> {
  return json(
    await fetch(`${BASE}/families`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  );
}

export async function updateFamily(id: number, data: Partial<FamilyInput> & { serving_multiplier?: ServingMultiplier }): Promise<Family> {
  return json(
    await fetch(`${BASE}/families/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  );
}

// ── Family Members (v3: /api/members?family_id=) ──
export async function getMembers(familyId: number): Promise<FamilyMember[]> {
  return json(await fetch(`${BASE}/members?family_id=${familyId}`));
}
export const getFamilyMembers = getMembers;

export async function createMember(familyId: number, data: FamilyMemberInput): Promise<FamilyMember> {
  return json(
    await fetch(`${BASE}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, family_id: familyId }),
    }),
  );
}
export async function createFamilyMember(data: FamilyMemberInputV3): Promise<FamilyMemberV3> {
  return json(
    await fetch(`${BASE}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  );
}

export async function updateMember(familyId: number, memberId: number, data: FamilyMemberInput): Promise<FamilyMember> {
  return json(
    await fetch(`${BASE}/members/${memberId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  );
}
export async function updateFamilyMember(id: number, data: Partial<FamilyMemberV3>): Promise<FamilyMemberV3> {
  return json(
    await fetch(`${BASE}/members/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  );
}

export async function deleteMember(familyId: number, memberId: number): Promise<void> {
  const res = await fetch(`${BASE}/members/${memberId}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
}
export async function deleteFamilyMember(id: number): Promise<void> {
  const res = await fetch(`${BASE}/members/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
}

// ── Recipes ──
export async function getRecipes(): Promise<Recipe[]> {
  return json(await fetch(`${BASE}/recipes`));
}

export async function createRecipe(data: RecipeInput): Promise<Recipe> {
  return json(
    await fetch(`${BASE}/recipes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  );
}

// ── Meal Plans ──
export async function generateMealPlan(
  familyId: number,
  locks?: Record<string, number>,
  variant?: number,
): Promise<GeneratePlanResponse> {
  return json(
    await fetch(`${BASE}/meal-plans/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ family_id: familyId, locks, variant }),
    }),
  );
}

export async function getMealPlan(id: number): Promise<MealPlan> {
  return json(await fetch(`${BASE}/meal-plans/${id}`));
}

export async function swapMealPlanItem(planId: number, day: DayOfWeek): Promise<MealPlan> {
  return json(
    await fetch(`${BASE}/meal-plans/${planId}/swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ day }),
    }),
  );
}

// ── Grocery List ──
export async function getGroceryList(planId: number): Promise<GroceryList> {
  return json(await fetch(`${BASE}/meal-plans/${planId}/grocery-list`));
}

// ── Favorite Chefs ──
export async function getFavoriteChefs(familyId: number): Promise<FamilyFavoriteChef[]> {
  return json(await fetch(`${BASE}/favorites/chefs?family_id=${familyId}`));
}

export async function createFavoriteChef(familyId: number, name: string): Promise<FamilyFavoriteChef> {
  return json(
    await fetch(`${BASE}/favorites/chefs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ family_id: familyId, name }),
    }),
  );
}

export async function deleteFavoriteChef(id: number): Promise<void> {
  const res = await fetch(`${BASE}/favorites/chefs/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete favorite chef");
}

// ── Favorite Meals ──
export async function getFavoriteMeals(familyId: number): Promise<FamilyFavoriteMeal[]> {
  return json(await fetch(`${BASE}/favorites/meals?family_id=${familyId}`));
}

export async function createFavoriteMeal(familyId: number, data: Partial<FamilyFavoriteMeal>): Promise<FamilyFavoriteMeal> {
  return json(
    await fetch(`${BASE}/favorites/meals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, family_id: familyId }),
    }),
  );
}

export async function updateFavoriteMeal(id: number, data: Partial<FamilyFavoriteMeal>): Promise<FamilyFavoriteMeal> {
  return json(
    await fetch(`${BASE}/favorites/meals/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  );
}

export async function deleteFavoriteMeal(id: number): Promise<void> {
  const res = await fetch(`${BASE}/favorites/meals/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete favorite meal");
}

// ── Favorite Sides ──
export async function getFavoriteSides(familyId: number): Promise<FamilyFavoriteSide[]> {
  return json(await fetch(`${BASE}/favorites/sides?family_id=${familyId}`));
}

export async function createFavoriteSide(familyId: number, data: Partial<FamilyFavoriteSide>): Promise<FamilyFavoriteSide> {
  return json(
    await fetch(`${BASE}/favorites/sides`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, family_id: familyId }),
    }),
  );
}

export async function updateFavoriteSide(id: number, data: Partial<FamilyFavoriteSide>): Promise<FamilyFavoriteSide> {
  return json(
    await fetch(`${BASE}/favorites/sides/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  );
}

export async function deleteFavoriteSide(id: number): Promise<void> {
  const res = await fetch(`${BASE}/favorites/sides/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete favorite side");
}

// ── Cooking Schedule ──
export async function getCookingSchedule(familyId: number, weekStart: string): Promise<WeeklyCookingSchedule[]> {
  return json(await fetch(`${BASE}/cooking-schedule?family_id=${familyId}&week_start=${weekStart}`));
}

export async function saveCookingSchedule(familyId: number, weekStart: string, schedule: WeeklyCookingSchedule[]): Promise<void> {
  const res = await fetch(`${BASE}/cooking-schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ family_id: familyId, week_start: weekStart, schedule }),
  });
  if (!res.ok) throw new Error("Failed to save cooking schedule");
}

// ── Lunch Planning ──
export async function getLunchNeeds(familyId: number, weekStart: string): Promise<WeeklyLunchNeed[]> {
  return json(await fetch(`${BASE}/cooking-schedule/lunch?family_id=${familyId}&week_start=${weekStart}`));
}

export async function saveLunchNeeds(familyId: number, weekStart: string, lunchNeeds: WeeklyLunchNeed[]): Promise<void> {
  const res = await fetch(`${BASE}/cooking-schedule/lunch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ family_id: familyId, week_start: weekStart, lunch_needs: lunchNeeds }),
  });
  if (!res.ok) throw new Error("Failed to save lunch needs");
}

// ── V3 Plan Generation ──
export async function generateMealPlanV3(request: GeneratePlanRequestV3): Promise<MealPlan> {
  return json(
    await fetch(`${BASE}/meal-plans/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }),
  );
}
