import { Router, Request, Response } from "express";
import db from "../db";
import { validateFamilyMember } from "../validation";
import type { FamilyMember, FamilyMemberInput } from "../../../shared/types";

const router = Router({ mergeParams: true });

function rowToMember(row: any): FamilyMember {
  return {
    id: row.id,
    family_id: row.family_id,
    name: row.name,
    dietary_style: row.dietary_style || "omnivore",
    allergies: JSON.parse(row.allergies || "[]"),
    dislikes: JSON.parse(row.dislikes || "[]"),
    favorites: JSON.parse(row.favorites || "[]"),
    created_at: row.created_at,
  };
}

// GET /api/families/:familyId/members
router.get("/", (req: Request, res: Response) => {
  const { familyId } = req.params;
  const rows = db.prepare("SELECT * FROM family_members WHERE family_id = ? ORDER BY id").all(familyId);
  res.json(rows.map(rowToMember));
});

// POST /api/families/:familyId/members
router.post("/", (req: Request, res: Response) => {
  const { familyId } = req.params;

  // Check family exists
  const family = db.prepare("SELECT id FROM families WHERE id = ?").get(familyId);
  if (!family) return res.status(404).json({ error: "Family not found" });

  const validation = validateFamilyMember(req.body);
  if (!validation.isValid) {
    return res.status(400).json({ error: "Validation failed", details: validation.errors });
  }

  const m: FamilyMemberInput = req.body;
  const result = db.prepare(`
    INSERT INTO family_members (family_id, name, dietary_style, allergies, dislikes, favorites)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    familyId,
    m.name,
    m.dietary_style || "omnivore",
    JSON.stringify(m.allergies || []),
    JSON.stringify(m.dislikes || []),
    JSON.stringify(m.favorites || []),
  );

  const created = db.prepare("SELECT * FROM family_members WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(rowToMember(created));
});

// PUT /api/families/:familyId/members/:id
router.put("/:id", (req: Request, res: Response) => {
  const { familyId, id } = req.params;

  const existing = db.prepare("SELECT * FROM family_members WHERE id = ? AND family_id = ?").get(id, familyId);
  if (!existing) return res.status(404).json({ error: "Member not found" });

  const validation = validateFamilyMember(req.body);
  if (!validation.isValid) {
    return res.status(400).json({ error: "Validation failed", details: validation.errors });
  }

  const m: FamilyMemberInput = req.body;
  db.prepare(`
    UPDATE family_members SET name=?, dietary_style=?, allergies=?, dislikes=?, favorites=?
    WHERE id=? AND family_id=?
  `).run(
    m.name,
    m.dietary_style || "omnivore",
    JSON.stringify(m.allergies || []),
    JSON.stringify(m.dislikes || []),
    JSON.stringify(m.favorites || []),
    id,
    familyId,
  );

  const updated = db.prepare("SELECT * FROM family_members WHERE id = ?").get(id);
  res.json(rowToMember(updated));
});

// DELETE /api/families/:familyId/members/:id
router.delete("/:id", (req: Request, res: Response) => {
  const { familyId, id } = req.params;

  const existing = db.prepare("SELECT * FROM family_members WHERE id = ? AND family_id = ?").get(id, familyId);
  if (!existing) return res.status(404).json({ error: "Member not found" });

  db.prepare("DELETE FROM family_members WHERE id = ? AND family_id = ?").run(id, familyId);
  res.status(204).send();
});

export default router;
