import { Router, Request, Response } from "express";
import { query, queryOne } from "../db";
import { validateFamily } from "../validation";
import { requireAuth, verifyFamilyAccess } from "../middleware/auth";
import type { Family, FamilyInput } from "../../../shared/types";

const router = Router();

// All family routes require auth
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
    serving_multiplier: row.serving_multiplier ?? 1.0,
    created_at: row.created_at,
  };
}

// GET /api/families
router.get("/", async (req: Request, res: Response) => {
  if (!req.householdId) {
    return res.json([]);
  }
  const rows = await query(
    "SELECT * FROM families WHERE household_id = $1 ORDER BY id DESC",
    [req.householdId],
  );
  res.json(rows.map(rowToFamily));
});

// GET /api/families/:id
router.get("/:id", async (req: Request, res: Response) => {
  const row = await verifyFamilyAccess(parseInt(req.params.id), req.householdId);
  if (!row) return res.status(404).json({ error: "Family not found" });
  res.json(rowToFamily(row));
});

// POST /api/families
router.post("/", async (req: Request, res: Response) => {
  const validation = validateFamily(req.body);
  if (!validation.isValid) {
    return res.status(400).json({ error: "Validation failed", details: validation.errors });
  }

  const f: FamilyInput = req.body;
  const created = await queryOne(`
    INSERT INTO families (name, allergies, vegetarian_ratio, gluten_free, dairy_free, nut_free,
      max_cook_minutes_weekday, max_cook_minutes_weekend, leftovers_nights_per_week, picky_kid_mode, planning_mode, household_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *
  `, [
    f.name,
    JSON.stringify(f.allergies || []),
    f.vegetarian_ratio || 0,
    f.gluten_free ?? false,
    f.dairy_free ?? false,
    f.nut_free ?? false,
    f.max_cook_minutes_weekday || 45,
    f.max_cook_minutes_weekend || 90,
    f.leftovers_nights_per_week || 1,
    f.picky_kid_mode ?? false,
    f.planning_mode || "strictest_household",
    req.householdId || null,
  ]);
  res.status(201).json(rowToFamily(created));
});

// PUT /api/families/:id
router.put("/:id", async (req: Request, res: Response) => {
  const existing = await verifyFamilyAccess(parseInt(req.params.id), req.householdId);
  if (!existing) return res.status(404).json({ error: "Family not found" });

  const updates = req.body;

  // If this is just a serving_multiplier update, skip full validation
  if (updates.serving_multiplier !== undefined && Object.keys(updates).length === 1) {
    const multiplier = Number(updates.serving_multiplier);
    if (isNaN(multiplier) || multiplier <= 0) {
      return res.status(400).json({ error: "serving_multiplier must be a positive number" });
    }
    const updated = await queryOne(
      "UPDATE families SET serving_multiplier = $1 WHERE id = $2 RETURNING *",
      [multiplier, req.params.id],
    );
    return res.json(rowToFamily(updated));
  }

  // If this is just a name update, skip full validation
  if (updates.name !== undefined && Object.keys(updates).length === 1) {
    const updated = await queryOne(
      "UPDATE families SET name = $1 WHERE id = $2 RETURNING *",
      [updates.name, req.params.id],
    );
    return res.json(rowToFamily(updated));
  }

  const validation = validateFamily(updates);
  if (!validation.isValid) {
    return res.status(400).json({ error: "Validation failed", details: validation.errors });
  }

  const f: FamilyInput = updates;
  const updated = await queryOne(`
    UPDATE families SET name=$1, allergies=$2, vegetarian_ratio=$3, gluten_free=$4, dairy_free=$5, nut_free=$6,
      max_cook_minutes_weekday=$7, max_cook_minutes_weekend=$8, leftovers_nights_per_week=$9, picky_kid_mode=$10, planning_mode=$11,
      serving_multiplier=$12
    WHERE id=$13
    RETURNING *
  `, [
    f.name,
    JSON.stringify(f.allergies || []),
    f.vegetarian_ratio || 0,
    f.gluten_free ?? false,
    f.dairy_free ?? false,
    f.nut_free ?? false,
    f.max_cook_minutes_weekday || 45,
    f.max_cook_minutes_weekend || 90,
    f.leftovers_nights_per_week || 1,
    f.picky_kid_mode ?? false,
    f.planning_mode || "strictest_household",
    f.serving_multiplier ?? 1.0,
    req.params.id,
  ]);
  res.json(rowToFamily(updated));
});

export default router;
