import { Router, Request, Response } from "express";
import db from "../db";
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
  const f: FamilyInput = req.body;
  const result = db.prepare(`
    INSERT INTO families (name, allergies, vegetarian_ratio, gluten_free, dairy_free, nut_free,
      max_cook_minutes_weekday, max_cook_minutes_weekend, leftovers_nights_per_week, picky_kid_mode)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
  );
  const created = db.prepare("SELECT * FROM families WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(rowToFamily(created));
});

// PUT /api/families/:id
router.put("/:id", (req: Request, res: Response) => {
  const f: FamilyInput = req.body;
  const existing = db.prepare("SELECT * FROM families WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Family not found" });

  db.prepare(`
    UPDATE families SET name=?, allergies=?, vegetarian_ratio=?, gluten_free=?, dairy_free=?, nut_free=?,
      max_cook_minutes_weekday=?, max_cook_minutes_weekend=?, leftovers_nights_per_week=?, picky_kid_mode=?
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
    req.params.id,
  );
  const updated = db.prepare("SELECT * FROM families WHERE id = ?").get(req.params.id);
  res.json(rowToFamily(updated));
});

export default router;
