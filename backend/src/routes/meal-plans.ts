import { Router, Request, Response } from "express";
import { query, queryOne, transaction } from "../db";
import { rowToRecipe } from "../helpers";
import { generatePlan, normalizeToMonday, deriveSeed } from "../planner/index";
import type { PlannerContext } from "../planner/types";
import { validateGeneratePlanRequest, validateSwapRequest } from "../validation";
import { estimateSideIngredients, extractIngredientsFromUrl } from "../services/ingredientExtractor";
import { requireAuth, verifyFamilyAccess } from "../middleware/auth";
import type { Family, FamilyMember, DayOfWeek, ReasonCodeValue, GroceryItem, GroceryCategory } from "../../../shared/types";
import { VALID_DAYS } from "../../../shared/types";

const router = Router();

// All meal plan routes require auth
router.use(requireAuth);

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
  WHERE mpi.meal_plan_id = $1
  ORDER BY CASE mpi.day
    WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2 WHEN 'wednesday' THEN 3
    WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5 WHEN 'saturday' THEN 6 WHEN 'sunday' THEN 7
  END, mpi.meal_type, mpi.main_number
`;

// POST /api/meal-plans/generate
router.post("/generate", async (req: Request, res: Response) => {
  const validation = validateGeneratePlanRequest(req.body);
  if (!validation.isValid) {
    return res.status(400).json({ error: "Validation failed", details: validation.errors });
  }

  const { family_id, locks, week_start, variant: reqVariant, settings } = req.body;
  const variant = reqVariant ?? 0;

  const familyRow = await verifyFamilyAccess(family_id, req.householdId);
  if (!familyRow) return res.status(404).json({ error: "Family not found" });
  const family = rowToFamily(familyRow);

  const memberRows = await query("SELECT * FROM family_members WHERE family_id = $1", [family_id]);
  const members = memberRows.map(rowToMember);

  // Normalize week_start to Monday
  const normalizedWeek = week_start ? normalizeToMonday(week_start) : normalizeToMonday(new Date().toISOString().slice(0, 10));

  // Check for existing plan with same (family_id, week_start, variant)
  const existingPlan = await queryOne(
    "SELECT * FROM meal_plans WHERE family_id = $1 AND week_start = $2 AND variant = $3",
    [family_id, normalizedWeek, variant],
  );

  if (existingPlan) {
    const items = await query(ITEMS_QUERY, [existingPlan.id]);
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

  const recipeRows = await query("SELECT * FROM recipes");
  const allRecipes = recipeRows.map(rowToRecipe);

  // Get recent recipe history (trailing 30 days)
  const recentRows = await query<{ recipe_id: number }>(`
    SELECT mpi.recipe_id FROM meal_plan_items mpi
    JOIN meal_plans mp ON mp.id = mpi.meal_plan_id
    WHERE mp.family_id = $1 AND mp.created_at >= NOW() - INTERVAL '30 days'
  `, [family_id]);
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

    const planId = await transaction(async (client) => {
      const planResult = await client.query(
        "INSERT INTO meal_plans (family_id, week_start, variant, settings_snapshot, household_id, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
        [family_id, normalizedWeek, variant, settingsSnapshot, req.householdId || null, req.user!.id],
      );
      const id = planResult.rows[0].id;

      for (const slot of planSlots) {
        await client.query(`
          INSERT INTO meal_plan_items (meal_plan_id, day, recipe_id, locked, lunch_leftover_label,
            leftover_lunch_recipe_id, notes, reasons_json)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          id,
          slot.day,
          slot.recipe.id,
          slot.locked ?? false,
          slot.lunch_leftover_label,
          slot.leftover_lunch_recipe_id,
          null,
          JSON.stringify(slot.reasons),
        ]);
      }

      return id;
    });

    // Return the full plan
    const items = await query(ITEMS_QUERY, [planId]);
    const planRow = await queryOne("SELECT * FROM meal_plans WHERE id = $1", [planId]);

    res.status(201).json({
      id: planId,
      family_id,
      week_start: normalizedWeek,
      variant,
      created_at: planRow!.created_at,
      settings_snapshot: settingsSnapshot ? JSON.parse(settingsSnapshot) : null,
      items: items.map(buildItemResponse),
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/meal-plans/:id
router.get("/:id", async (req: Request, res: Response) => {
  const plan = await queryOne(
    "SELECT * FROM meal_plans WHERE id = $1 AND (household_id = $2 OR household_id IS NULL)",
    [req.params.id, req.householdId],
  );
  if (!plan) return res.status(404).json({ error: "Meal plan not found" });

  const items = await query(ITEMS_QUERY, [req.params.id]);

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
router.post("/:id/swap", async (req: Request, res: Response) => {
  const validation = validateSwapRequest(req.body);
  if (!validation.isValid) {
    return res.status(400).json({ error: "Validation failed", details: validation.errors });
  }

  const plan = await queryOne(
    "SELECT * FROM meal_plans WHERE id = $1 AND (household_id = $2 OR household_id IS NULL)",
    [req.params.id, req.householdId],
  );
  if (!plan) return res.status(404).json({ error: "Meal plan not found" });

  const { day } = req.body as { day: DayOfWeek };

  const familyRow = await queryOne("SELECT * FROM families WHERE id = $1", [plan.family_id]);
  if (!familyRow) return res.status(404).json({ error: "Family not found" });
  const family = rowToFamily(familyRow);

  const memberRows = await query("SELECT * FROM family_members WHERE family_id = $1", [plan.family_id]);
  const members = memberRows.map(rowToMember);

  const recipeRows = await query("SELECT * FROM recipes");
  const allRecipes = recipeRows.map(rowToRecipe);

  // Lock all other days from existing plan
  const existingItems = await query("SELECT * FROM meal_plan_items WHERE meal_plan_id = $1", [req.params.id]);

  const locks: Partial<Record<DayOfWeek, number>> = {};
  for (const item of existingItems) {
    if (item.day !== day) {
      locks[item.day as DayOfWeek] = item.recipe_id;
    }
  }

  // Get recent recipe history
  const recentRows = await query<{ recipe_id: number }>(`
    SELECT mpi.recipe_id FROM meal_plan_items mpi
    JOIN meal_plans mp ON mp.id = mpi.meal_plan_id
    WHERE mp.family_id = $1 AND mp.created_at >= NOW() - INTERVAL '30 days'
  `, [plan.family_id]);
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
    await query(`
      UPDATE meal_plan_items SET recipe_id=$1, locked=$2, lunch_leftover_label=$3,
        leftover_lunch_recipe_id=$4, reasons_json=$5
      WHERE meal_plan_id=$6 AND day=$7
    `, [
      swappedSlot.recipe.id,
      swappedSlot.locked ?? false,
      swappedSlot.lunch_leftover_label,
      swappedSlot.leftover_lunch_recipe_id,
      JSON.stringify(swappedSlot.reasons),
      req.params.id,
      day,
    ]);

    // Return the full updated plan
    const items = await query(ITEMS_QUERY, [req.params.id]);
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

// POST /api/meal-plans/items/:itemId/swap-recipe
router.post("/items/:itemId/swap-recipe", async (req: Request, res: Response) => {
  const { recipe_id } = req.body;
  if (!recipe_id) {
    return res.status(400).json({ error: "recipe_id is required" });
  }

  const item = await queryOne("SELECT * FROM meal_plan_items WHERE id = $1", [req.params.itemId]);
  if (!item) return res.status(404).json({ error: "Meal plan item not found" });

  const recipe = await queryOne("SELECT * FROM recipes WHERE id = $1", [recipe_id]);
  if (!recipe) return res.status(404).json({ error: "Recipe not found" });

  await query("UPDATE meal_plan_items SET recipe_id = $1 WHERE id = $2", [recipe_id, req.params.itemId]);

  // Return the full updated plan
  const plan = await queryOne("SELECT * FROM meal_plans WHERE id = $1", [item.meal_plan_id]);
  const items = await query(ITEMS_QUERY, [item.meal_plan_id]);
  res.json({
    id: plan!.id,
    family_id: plan!.family_id,
    week_start: plan!.week_start,
    variant: plan!.variant,
    created_at: plan!.created_at,
    settings_snapshot: plan!.settings_snapshot ? JSON.parse(plan!.settings_snapshot) : null,
    items: items.map(buildItemResponse),
  });
});

// GET /api/meal-plans/:id/grocery-list
router.get("/:id/grocery-list", async (req: Request, res: Response) => {
  try {
    const plan = await queryOne(
      "SELECT * FROM meal_plans WHERE id = $1 AND (household_id = $2 OR household_id IS NULL)",
      [req.params.id, req.householdId],
    );
    if (!plan) return res.status(404).json({ error: "Meal plan not found" });

    // Query recipe_ingredients via join through meal_plan_items (mains)
    const rows = await query<{ item: string; quantity: number; unit: string; category: string }>(`
      SELECT ri.item, ri.quantity, ri.unit, ri.category
      FROM meal_plan_items mpi
      JOIN recipe_ingredients ri ON ri.recipe_id = mpi.recipe_id
      WHERE mpi.meal_plan_id = $1
    `, [req.params.id]);

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

    // Apply serving multiplier to recipe ingredients
    const familyRow = await queryOne<{ serving_multiplier: number }>(
      "SELECT serving_multiplier FROM families WHERE id = $1",
      [plan.family_id],
    );
    const multiplier = familyRow?.serving_multiplier ?? 1.0;

    if (multiplier !== 1.0) {
      for (const entry of consolidated.values()) {
        entry.total_quantity *= multiplier;
      }
    }

    // Side ingredient handling
    const sideItems = await query<{ id: number; notes: string | null }>(`
      SELECT mpi.id, mpi.notes
      FROM meal_plan_items mpi
      WHERE mpi.meal_plan_id = $1 AND mpi.meal_type = 'side' AND mpi.recipe_id IS NULL
    `, [req.params.id]);

    if (sideItems.length > 0) {
      const memberCountRow = await queryOne<{ c: string }>(
        "SELECT COUNT(*) as c FROM family_members WHERE family_id = $1",
        [plan.family_id],
      );
      const memberCount = parseInt(memberCountRow?.c ?? "0");
      const servings = Math.max(Math.round(memberCount * multiplier), 2);

      for (const side of sideItems) {
        let sideLibraryId: number | null = null;
        let sideName: string | null = null;

        if (side.notes) {
          try {
            const notes = JSON.parse(side.notes);
            sideLibraryId = notes.side_library_id || null;
            sideName = notes.side_name || notes.name || null;
          } catch {
            continue;
          }
        }

        if (!sideLibraryId && !sideName) continue;

        // Check cache in side_ingredients table
        let cached: Array<{ item: string; quantity: number; unit: string; category: string }>;
        if (sideLibraryId) {
          cached = await query(
            "SELECT item, quantity, unit, category FROM side_ingredients WHERE side_library_id = $1",
            [sideLibraryId],
          );
        } else {
          cached = await query(
            "SELECT item, quantity, unit, category FROM side_ingredients WHERE side_name = $1",
            [sideName!],
          );
        }

        let sideIngredients: Array<{ item: string; quantity: number; unit: string; category: string }>;

        if (cached.length > 0) {
          sideIngredients = cached;
        } else {
          // Resolve the display name for Claude
          let displayName = sideName;
          if (sideLibraryId && !displayName) {
            const libRow = await queryOne<{ name: string }>(
              "SELECT name FROM sides_library WHERE id = $1",
              [sideLibraryId],
            );
            displayName = libRow?.name || null;
          }
          if (!displayName) continue;

          // Call Claude to estimate ingredients
          const estimated = await estimateSideIngredients(displayName, servings);
          if (estimated.length === 0) continue;

          // Cache results
          for (const ing of estimated) {
            await query(
              `INSERT INTO side_ingredients (side_library_id, side_name, item, quantity, unit, category, servings)
              VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [sideLibraryId, sideName || displayName, ing.name, ing.quantity, ing.unit, ing.category, servings],
            );
          }

          sideIngredients = estimated.map((ing) => ({
            item: ing.name,
            quantity: ing.quantity,
            unit: ing.unit,
            category: ing.category,
          }));
        }

        // Consolidate side ingredients into the main map
        for (const ing of sideIngredients) {
          const key = `${ing.item.toLowerCase()}|${ing.unit}`;
          const existing = consolidated.get(key);
          if (existing) {
            existing.total_quantity += ing.quantity;
          } else {
            consolidated.set(key, {
              total_quantity: ing.quantity,
              unit: ing.unit,
              category: ing.category as GroceryCategory,
            });
          }
        }
      }
    }

    // Build final grocery list
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

    // Safety net: actively fill ingredient gaps for any recipes still missing them
    const recipesWithNoIngredients = await query<{ id: number; name: string; source_url: string | null }>(`
      SELECT DISTINCT r.id, r.name, r.source_url
      FROM meal_plan_items mpi
      JOIN recipes r ON r.id = mpi.recipe_id
      LEFT JOIN recipe_ingredients ri ON ri.recipe_id = mpi.recipe_id
      WHERE mpi.meal_plan_id = $1 AND ri.id IS NULL AND mpi.recipe_id IS NOT NULL
    `, [req.params.id]);

    if (recipesWithNoIngredients.length > 0) {
      const servings = Math.round(multiplier * 4);
      console.log(`[grocery-list] Safety net: ${recipesWithNoIngredients.length} recipes missing ingredients, extracting (${servings} servings)`);

      for (const recipe of recipesWithNoIngredients) {
        console.log(`[grocery-list] Extracting ingredients for #${recipe.id} "${recipe.name}"...`);
        const extracted = recipe.source_url
          ? await extractIngredientsFromUrl(recipe.name, recipe.source_url, servings)
          : await extractIngredientsFromUrl(recipe.name, "", servings);

        if (extracted.length > 0) {
          await query("UPDATE recipes SET ingredients = $1 WHERE id = $2", [
            JSON.stringify(extracted),
            recipe.id,
          ]);
          await query("DELETE FROM recipe_ingredients WHERE recipe_id = $1", [recipe.id]);
          for (const ing of extracted) {
            await query(
              "INSERT INTO recipe_ingredients (recipe_id, item, quantity, unit, category) VALUES ($1, $2, $3, $4, $5)",
              [recipe.id, ing.name, ing.quantity, ing.unit, ing.category],
            );
          }
          console.log(`[grocery-list] Extracted ${extracted.length} ingredients for #${recipe.id}`);

          // Add these ingredients to the consolidated grocery list
          for (const ing of extracted) {
            const scaledQty = ing.quantity * multiplier;
            const key = `${ing.name.toLowerCase()}|${ing.unit}`;
            const existing = consolidated.get(key);
            if (existing) {
              existing.total_quantity += scaledQty;
            } else {
              consolidated.set(key, {
                total_quantity: scaledQty,
                unit: ing.unit,
                category: ing.category as GroceryCategory,
              });
            }
          }
        } else {
          console.warn(`[grocery-list] Could not extract ingredients for #${recipe.id} "${recipe.name}"`);
        }
      }

      // Rebuild grocery list after extraction
      groceryItems.length = 0;
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
      groceryItems.sort((a, b) => {
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        return a.name.localeCompare(b.name);
      });
    }

    // Find recipes that STILL have no ingredients after extraction attempts
    const missingRecipes = await query<{ recipe_id: number; name: string }>(`
      SELECT DISTINCT mpi.recipe_id, r.name
      FROM meal_plan_items mpi
      JOIN recipes r ON r.id = mpi.recipe_id
      LEFT JOIN recipe_ingredients ri ON ri.recipe_id = mpi.recipe_id
      WHERE mpi.meal_plan_id = $1 AND ri.id IS NULL AND mpi.recipe_id IS NOT NULL
    `, [req.params.id]);

    res.json({
      meal_plan_id: Number(req.params.id),
      items: groceryItems,
      missing_recipes: missingRecipes,
    });
  } catch (error: any) {
    console.error("[grocery-list] Error:", error);
    res.status(500).json({ error: "Failed to generate grocery list" });
  }
});

export default router;
