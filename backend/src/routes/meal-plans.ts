import { Router, Request, Response } from "express";
import db from "../db";
import { rowToRecipe } from "../helpers";
import { generatePlan, normalizeToMonday, deriveSeed } from "../planner/index";
import type { PlannerContext } from "../planner/types";
import { validateGeneratePlanRequest, validateSwapRequest } from "../validation";
import type { Family, FamilyMember, DayOfWeek, ReasonCodeValue, GroceryItem, GroceryCategory } from "../../../shared/types";
import { VALID_DAYS } from "../../../shared/types";

const router = Router();

function rowToFamily(row: any): Family {
  return {
    id: row.id,
    name: row.name,
    allergies: JSON.parse(row.allergies),
    vegetarian_ratio: row.vegetarian_ratio,
    gluten_free: !!row.gluten_free,
    dairy_free: !!row.dairy_free,
    nut_free: !!row.nut_free,
    max_cook_minutes_weekday: row.max_cook_minutes_weekday,
    max_cook_minutes_weekend: row.max_cook_minutes_weekend,
    leftovers_nights_per_week: row.leftovers_nights_per_week,
    picky_kid_mode: !!row.picky_kid_mode,
    planning_mode: row.planning_mode || "strictest_household",
    created_at: row.created_at,
  };
}

function rowToMember(row: any): FamilyMember {
  return {
    id: row.id,
    family_id: row.family_id,
    name: row.name,
    dietary_style: row.dietary_style || "omnivore",
    allergies: JSON.parse(row.allergies || "[]"),
    dislikes: JSON.parse(row.dislikes || "[]"),
    favorites: JSON.parse(row.favorites || "[]"),
    no_spicy: !!row.no_spicy,
    created_at: row.created_at,
  };
}

/** Build a full item response from a joined row (meal_plan_items + recipes). */
function buildItemResponse(row: any) {
  const reasons: ReasonCodeValue[] = JSON.parse(row.reasons_json || "[]");
  return {
    id: row.item_id,
    meal_plan_id: row.meal_plan_id,
    day: row.day,
    recipe_id: row.recipe_id,
    locked: !!row.locked,
    lunch_leftover_label: row.lunch_leftover_label,
    leftover_lunch_recipe_id: row.leftover_lunch_recipe_id,
    notes: row.notes || null,
    reasons,
    leftovers_for_lunch: reasons.includes("LEFTOVERS_LUNCH"),
    // V3 fields
    meal_type: row.meal_type || "main",
    main_number: row.main_number || null,
    assigned_member_ids: row.assigned_member_ids ? JSON.parse(row.assigned_member_ids) : null,
    parent_meal_item_id: row.parent_meal_item_id || null,
    is_custom: !!row.is_custom,
    recipe_name: row.name || null,
    recipe: row.r_id ? rowToRecipe({ ...row, id: row.r_id }) : null,
  };
}

const ITEMS_QUERY = `
  SELECT mpi.id as item_id, mpi.meal_plan_id, mpi.day, mpi.recipe_id, mpi.locked,
         mpi.lunch_leftover_label, mpi.leftover_lunch_recipe_id, mpi.notes, mpi.reasons_json,
         mpi.meal_type, mpi.main_number, mpi.assigned_member_ids,
         mpi.parent_meal_item_id, mpi.is_custom,
         r.id as r_id, r.name, r.cuisine, r.vegetarian, r.protein_type,
         r.cook_minutes, r.allergens, r.kid_friendly, r.makes_leftovers, r.ingredients, r.tags,
         r.source_type, r.source_name, r.source_url, r.difficulty, r.leftovers_score,
         r.seasonal_tags, r.frequency_cap_per_month
  FROM meal_plan_items mpi
  LEFT JOIN recipes r ON r.id = mpi.recipe_id
  WHERE mpi.meal_plan_id = ?
  ORDER BY CASE mpi.day
    WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2 WHEN 'wednesday' THEN 3
    WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5 WHEN 'saturday' THEN 6 WHEN 'sunday' THEN 7
  END, mpi.meal_type, mpi.main_number
`;

// POST /api/meal-plans/generate
router.post("/generate", (req: Request, res: Response) => {
  const validation = validateGeneratePlanRequest(req.body);
  if (!validation.isValid) {
    return res.status(400).json({ error: "Validation failed", details: validation.errors });
  }

  const { family_id, locks, week_start, variant: reqVariant, settings } = req.body;
  const variant = reqVariant ?? 0;

  const familyRow = db.prepare("SELECT * FROM families WHERE id = ?").get(family_id);
  if (!familyRow) return res.status(404).json({ error: "Family not found" });
  const family = rowToFamily(familyRow);

  const memberRows = db.prepare("SELECT * FROM family_members WHERE family_id = ?").all(family_id);
  const members = memberRows.map(rowToMember);

  // Normalize week_start to Monday
  const normalizedWeek = week_start ? normalizeToMonday(week_start) : normalizeToMonday(new Date().toISOString().slice(0, 10));

  // Check for existing plan with same (family_id, week_start, variant)
  const existingPlan = db.prepare(
    "SELECT * FROM meal_plans WHERE family_id = ? AND week_start = ? AND variant = ?",
  ).get(family_id, normalizedWeek, variant) as any;

  if (existingPlan) {
    const items = db.prepare(ITEMS_QUERY).all(existingPlan.id);
    return res.status(200).json({
      id: existingPlan.id,
      family_id: existingPlan.family_id,
      week_start: existingPlan.week_start,
      variant: existingPlan.variant,
      created_at: existingPlan.created_at,
      settings_snapshot: existingPlan.settings_snapshot ? JSON.parse(existingPlan.settings_snapshot) : null,
      alreadyExisted: true,
      items: items.map(buildItemResponse),
    });
  }

  const recipeRows = db.prepare("SELECT * FROM recipes").all();
  const allRecipes = recipeRows.map(rowToRecipe);

  // Get recent recipe history (trailing 30 days)
  const recentRows = db.prepare(`
    SELECT mpi.recipe_id FROM meal_plan_items mpi
    JOIN meal_plans mp ON mp.id = mpi.meal_plan_id
    WHERE mp.family_id = ? AND mp.created_at >= datetime('now', '-30 days')
  `).all(family_id) as { recipe_id: number }[];
  const recentRecipeHistory = recentRows.map((r) => r.recipe_id);

  const seed = deriveSeed(family.id, normalizedWeek, variant);

  const ctx: PlannerContext = {
    family,
    members,
    allRecipes,
    locks: locks || {},
    weekStart: normalizedWeek,
    seed,
    recentRecipeHistory,
  };

  try {
    const planSlots = generatePlan(ctx);

    // Save to DB in a transaction
    const settingsSnapshot = settings ? JSON.stringify(settings) : null;

    const savePlan = db.transaction(() => {
      const planResult = db.prepare(
        "INSERT INTO meal_plans (family_id, week_start, variant, settings_snapshot) VALUES (?, ?, ?, ?)",
      ).run(family_id, normalizedWeek, variant, settingsSnapshot);
      const planId = planResult.lastInsertRowid as number;

      const insertItem = db.prepare(`
        INSERT INTO meal_plan_items (meal_plan_id, day, recipe_id, locked, lunch_leftover_label,
          leftover_lunch_recipe_id, notes, reasons_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const slot of planSlots) {
        insertItem.run(
          planId,
          slot.day,
          slot.recipe.id,
          slot.locked ? 1 : 0,
          slot.lunch_leftover_label,
          slot.leftover_lunch_recipe_id,
          null,
          JSON.stringify(slot.reasons),
        );
      }

      return planId;
    });

    const planId = savePlan();

    // Return the full plan
    const items = db.prepare(ITEMS_QUERY).all(planId);
    const planRow = db.prepare("SELECT * FROM meal_plans WHERE id = ?").get(planId) as any;

    res.status(201).json({
      id: planId,
      family_id,
      week_start: normalizedWeek,
      variant,
      created_at: planRow.created_at,
      settings_snapshot: settingsSnapshot ? JSON.parse(settingsSnapshot) : null,
      items: items.map(buildItemResponse),
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/meal-plans/:id
router.get("/:id", (req: Request, res: Response) => {
  const plan = db.prepare("SELECT * FROM meal_plans WHERE id = ?").get(req.params.id) as any;
  if (!plan) return res.status(404).json({ error: "Meal plan not found" });

  const items = db.prepare(ITEMS_QUERY).all(req.params.id);

  res.json({
    id: plan.id,
    family_id: plan.family_id,
    week_start: plan.week_start,
    variant: plan.variant,
    created_at: plan.created_at,
    settings_snapshot: plan.settings_snapshot ? JSON.parse(plan.settings_snapshot) : null,
    items: items.map(buildItemResponse),
  });
});

// POST /api/meal-plans/:id/swap
router.post("/:id/swap", (req: Request, res: Response) => {
  const validation = validateSwapRequest(req.body);
  if (!validation.isValid) {
    return res.status(400).json({ error: "Validation failed", details: validation.errors });
  }

  const plan = db.prepare("SELECT * FROM meal_plans WHERE id = ?").get(req.params.id) as any;
  if (!plan) return res.status(404).json({ error: "Meal plan not found" });

  const { day } = req.body as { day: DayOfWeek };

  const familyRow = db.prepare("SELECT * FROM families WHERE id = ?").get(plan.family_id);
  if (!familyRow) return res.status(404).json({ error: "Family not found" });
  const family = rowToFamily(familyRow);

  const memberRows = db.prepare("SELECT * FROM family_members WHERE family_id = ?").all(plan.family_id);
  const members = memberRows.map(rowToMember);

  const recipeRows = db.prepare("SELECT * FROM recipes").all();
  const allRecipes = recipeRows.map(rowToRecipe);

  // Lock all other days from existing plan
  const existingItems = db.prepare(
    "SELECT * FROM meal_plan_items WHERE meal_plan_id = ?",
  ).all(req.params.id) as any[];

  const locks: Partial<Record<DayOfWeek, number>> = {};
  for (const item of existingItems) {
    if (item.day !== day) {
      locks[item.day as DayOfWeek] = item.recipe_id;
    }
  }

  // Get recent recipe history
  const recentRows = db.prepare(`
    SELECT mpi.recipe_id FROM meal_plan_items mpi
    JOIN meal_plans mp ON mp.id = mpi.meal_plan_id
    WHERE mp.family_id = ? AND mp.created_at >= datetime('now', '-30 days')
  `).all(plan.family_id) as { recipe_id: number }[];
  const recentRecipeHistory = recentRows.map((r) => r.recipe_id);

  // Modified seed for swap: base variant + 100 + day index
  const dayIndex = VALID_DAYS.indexOf(day);
  const baseVariant = plan.variant || 0;
  const swapSeed = deriveSeed(plan.family_id, plan.week_start || normalizeToMonday(new Date().toISOString().slice(0, 10)), baseVariant + 100 + dayIndex);

  const ctx: PlannerContext = {
    family,
    members,
    allRecipes,
    locks,
    weekStart: plan.week_start || normalizeToMonday(new Date().toISOString().slice(0, 10)),
    seed: swapSeed,
    recentRecipeHistory,
  };

  try {
    const planSlots = generatePlan(ctx);
    const swappedSlot = planSlots.find((s) => s.day === day);
    if (!swappedSlot) {
      return res.status(400).json({ error: "Could not generate replacement for this day" });
    }

    // Update the swapped item
    db.prepare(`
      UPDATE meal_plan_items SET recipe_id=?, locked=?, lunch_leftover_label=?,
        leftover_lunch_recipe_id=?, reasons_json=?
      WHERE meal_plan_id=? AND day=?
    `).run(
      swappedSlot.recipe.id,
      swappedSlot.locked ? 1 : 0,
      swappedSlot.lunch_leftover_label,
      swappedSlot.leftover_lunch_recipe_id,
      JSON.stringify(swappedSlot.reasons),
      req.params.id,
      day,
    );

    // Return the full updated plan
    const items = db.prepare(ITEMS_QUERY).all(req.params.id);
    res.json({
      id: plan.id,
      family_id: plan.family_id,
      week_start: plan.week_start,
      variant: plan.variant,
      created_at: plan.created_at,
      settings_snapshot: plan.settings_snapshot ? JSON.parse(plan.settings_snapshot) : null,
      items: items.map(buildItemResponse),
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/meal-plans/:id/grocery-list
router.get("/:id/grocery-list", (req: Request, res: Response) => {
  const plan = db.prepare("SELECT * FROM meal_plans WHERE id = ?").get(req.params.id);
  if (!plan) return res.status(404).json({ error: "Meal plan not found" });

  // Query recipe_ingredients via join through meal_plan_items
  const rows = db.prepare(`
    SELECT ri.item, ri.quantity, ri.unit, ri.category
    FROM meal_plan_items mpi
    JOIN recipe_ingredients ri ON ri.recipe_id = mpi.recipe_id
    WHERE mpi.meal_plan_id = ?
  `).all(req.params.id) as Array<{ item: string; quantity: number; unit: string; category: string }>;

  // Consolidate by item+unit with SUM
  const consolidated = new Map<string, { total_quantity: number; unit: string; category: GroceryCategory }>();

  for (const row of rows) {
    const key = `${row.item.toLowerCase()}|${row.unit}`;
    const existing = consolidated.get(key);
    if (existing) {
      existing.total_quantity += row.quantity;
    } else {
      consolidated.set(key, {
        total_quantity: row.quantity,
        unit: row.unit,
        category: row.category as GroceryCategory,
      });
    }
  }

  const groceryItems: GroceryItem[] = [];
  for (const [key, val] of consolidated) {
    const name = key.split("|")[0];
    groceryItems.push({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      total_quantity: Math.round(val.total_quantity * 100) / 100,
      unit: val.unit,
      category: val.category,
      checked: false,
    });
  }

  // Sort by category then name
  groceryItems.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.name.localeCompare(b.name);
  });

  res.json({ meal_plan_id: Number(req.params.id), items: groceryItems });
});

export default router;
