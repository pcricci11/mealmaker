// api-v3-history.ts
// API functions for meal plan history
// Add these to your existing api.ts file

const API_BASE = "http://localhost:3001/api";

// ===== MEAL PLAN HISTORY =====

export async function getMealPlanHistory(familyId?: number): Promise<any[]> {
  let url = `${API_BASE}/meal-plans/history`;
  
  if (familyId) {
    url += `?family_id=${familyId}`;
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch meal plan history");
  return res.json();
}

export async function markMealAsLoved(mealItemId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/meal-plans/items/${mealItemId}/love`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error("Failed to mark meal as loved");
}

export async function copyMealToThisWeek(
  mealItemId: number,
  targetDay: string,
  targetWeekStart: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/meal-plans/items/${mealItemId}/copy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target_day: targetDay,
      target_week_start: targetWeekStart,
    }),
  });
  if (!res.ok) throw new Error("Failed to copy meal");
}
