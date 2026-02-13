import type {
  Family, FamilyInput, FamilyMember, FamilyMemberInput,
  Recipe, RecipeInput, MealPlan, GroceryList, DayOfWeek,
  GeneratePlanResponse,
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

export async function updateFamily(id: number, data: FamilyInput): Promise<Family> {
  return json(
    await fetch(`${BASE}/families/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  );
}

// ── Family Members ──
export async function getMembers(familyId: number): Promise<FamilyMember[]> {
  return json(await fetch(`${BASE}/families/${familyId}/members`));
}

export async function createMember(familyId: number, data: FamilyMemberInput): Promise<FamilyMember> {
  return json(
    await fetch(`${BASE}/families/${familyId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  );
}

export async function updateMember(familyId: number, memberId: number, data: FamilyMemberInput): Promise<FamilyMember> {
  return json(
    await fetch(`${BASE}/families/${familyId}/members/${memberId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  );
}

export async function deleteMember(familyId: number, memberId: number): Promise<void> {
  const res = await fetch(`${BASE}/families/${familyId}/members/${memberId}`, {
    method: "DELETE",
  });
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
