import type { Family, FamilyInput, Recipe, MealPlan, GroceryList, DayOfWeek } from "@shared/types";

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

export async function updateFamily(id: number, data: FamilyInput): Promise<Family> {
  return json(
    await fetch(`${BASE}/families/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  );
}

// ── Recipes ──
export async function getRecipes(): Promise<Recipe[]> {
  return json(await fetch(`${BASE}/recipes`));
}

// ── Meal Plans ──
export async function generateMealPlan(
  familyId: number,
  locks?: Record<string, number>,
): Promise<MealPlan> {
  return json(
    await fetch(`${BASE}/meal-plans/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ family_id: familyId, locks }),
    }),
  );
}

export async function getMealPlan(id: number): Promise<MealPlan> {
  return json(await fetch(`${BASE}/meal-plans/${id}`));
}

// ── Grocery List ──
export async function getGroceryList(planId: number): Promise<GroceryList> {
  return json(await fetch(`${BASE}/meal-plans/${planId}/grocery-list`));
}
