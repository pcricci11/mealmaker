import { Router, Request, Response } from "express";
import db from "../db";
import { validateFamily } from "../validation";
import type { Family, FamilyInput } from "../../../shared/types";

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
    serving_multiplier: row.serving_multiplier ?? 1.0,
    created_at: row.created_at,
  };
}

// GET /api/families
router.get("/", (_req: Request, res: Response) => {
  const rows = db.prepare("SELECT * FROM families ORDER BY id DESC").all();
  res.json(rows.map(rowToFamily));
});

// GET /api/families/:id
router.get("/:id", (req: Request, res: Response) => {
  const row = db.prepare("SELECT * FROM families WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Family not found" });
  res.json(rowToFamily(row));
});

// POST /api/families
router.post("/", (req: Request, res: Response) => {
  const validation = validateFamily(req.body);
  if (!validation.isValid) {
    return res.status(400).json({ error: "Validation failed", details: validation.errors });
  }

  const f: FamilyInput = req.body;
  const result = db.prepare(`
    INSERT INTO families (name, allergies, vegetarian_ratio, gluten_free, dairy_free, nut_free,
      max_cook_minutes_weekday, max_cook_minutes_weekend, leftovers_nights_per_week, picky_kid_mode, planning_mode)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    f.name,
    JSON.stringify(f.allergies || []),
    f.vegetarian_ratio || 0,
    f.gluten_free ? 1 : 0,
    f.dairy_free ? 1 : 0,
    f.nut_free ? 1 : 0,
    f.max_cook_minutes_weekday || 45,
    f.max_cook_minutes_weekend || 90,
    f.leftovers_nights_per_week || 1,
    f.picky_kid_mode ? 1 : 0,
    f.planning_mode || "strictest_household",
  );
  const created = db.prepare("SELECT * FROM families WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(rowToFamily(created));
});

// PUT /api/families/:id
router.put("/:id", (req: Request, res: Response) => {
  const existing = db.prepare("SELECT * FROM families WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Family not found" });

  const updates = req.body;

  // If this is just a serving_multiplier update, skip full validation
  if (updates.serving_multiplier !== undefined && Object.keys(updates).length === 1) {
    const multiplier = Number(updates.serving_multiplier);
    if (isNaN(multiplier) || multiplier <= 0) {
      return res.status(400).json({ error: "serving_multiplier must be a positive number" });
    }
    db.prepare("UPDATE families SET serving_multiplier = ? WHERE id = ?")
      .run(multiplier, req.params.id);
    const updated = db.prepare("SELECT * FROM families WHERE id = ?").get(req.params.id);
    return res.json(rowToFamily(updated));
  }

  // If this is just a name update, skip full validation
  if (updates.name !== undefined && Object.keys(updates).length === 1) {
    db.prepare("UPDATE families SET name = ? WHERE id = ?")
      .run(updates.name, req.params.id);
    const updated = db.prepare("SELECT * FROM families WHERE id = ?").get(req.params.id);
    return res.json(rowToFamily(updated));
  }

  const validation = validateFamily(updates);
  if (!validation.isValid) {
    return res.status(400).json({ error: "Validation failed", details: validation.errors });
  }

  const f: FamilyInput = updates;
  db.prepare(`
    UPDATE families SET name=?, allergies=?, vegetarian_ratio=?, gluten_free=?, dairy_free=?, nut_free=?,
      max_cook_minutes_weekday=?, max_cook_minutes_weekend=?, leftovers_nights_per_week=?, picky_kid_mode=?, planning_mode=?,
      serving_multiplier=?
    WHERE id=?
  `).run(
    f.name,
    JSON.stringify(f.allergies || []),
    f.vegetarian_ratio || 0,
    f.gluten_free ? 1 : 0,
    f.dairy_free ? 1 : 0,
    f.nut_free ? 1 : 0,
    f.max_cook_minutes_weekday || 45,
    f.max_cook_minutes_weekend || 90,
    f.leftovers_nights_per_week || 1,
    f.picky_kid_mode ? 1 : 0,
    f.planning_mode || "strictest_household",
    f.serving_multiplier ?? 1.0,
    req.params.id,
  );
  const updated = db.prepare("SELECT * FROM families WHERE id = ?").get(req.params.id);
  res.json(rowToFamily(updated));
});

export default router;
