// routes/members.ts
// Family members CRUD operations

import { Router } from "express";
import Database from "better-sqlite3";
import db from "../db";
import { validateFamilyMember } from "../validation-v3";
import type { FamilyMember, FamilyMemberInput } from "@shared/types";

const router = Router();

// Get all family members for a family
router.get("/", (req, res) => {
  const familyId = parseInt(req.query.family_id as string);
  
  if (!familyId) {
    return res.status(400).json({ error: "family_id is required" });
  }

  const members = db
    .prepare(
      `SELECT 
        id, family_id, name, dietary_style, 
        allergies, dislikes, favorites, no_spicy, 
        created_at
      FROM family_members 
      WHERE family_id = ?
      ORDER BY created_at ASC`
    )
    .all(familyId)
    .map((row: any) => ({
      ...row,
      allergies: JSON.parse(row.allergies || "[]"),
      dislikes: JSON.parse(row.dislikes || "[]"),
      favorites: JSON.parse(row.favorites || "[]"),
      no_spicy: Boolean(row.no_spicy),
    }));

  res.json(members);
});

// Get single family member
router.get("/:id", (req, res) => {
  const id = parseInt(req.params.id);
  
  const row = db
    .prepare(
      `SELECT 
        id, family_id, name, dietary_style, 
        allergies, dislikes, favorites, no_spicy, 
        created_at
      FROM family_members 
      WHERE id = ?`
    )
    .get(id);

  if (!row) {
    return res.status(404).json({ error: "Family member not found" });
  }

  const member = {
    ...(row as any),
    allergies: JSON.parse((row as any).allergies || "[]"),
    dislikes: JSON.parse((row as any).dislikes || "[]"),
    favorites: JSON.parse((row as any).favorites || "[]"),
    no_spicy: Boolean((row as any).no_spicy),
  };

  res.json(member);
});

// Create family member
router.post("/", (req, res) => {
  try {
    const input = validateFamilyMember(req.body);

    const result = db
      .prepare(
        `INSERT INTO family_members 
        (family_id, name, dietary_style, allergies, dislikes, favorites, no_spicy)
        VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.family_id,
        input.name,
        input.dietary_style,
        JSON.stringify(input.allergies || []),
        JSON.stringify(input.dislikes || []),
        JSON.stringify(input.favorites || []),
        input.no_spicy ? 1 : 0
      );

    const member = db
      .prepare("SELECT * FROM family_members WHERE id = ?")
      .get(result.lastInsertRowid);

    res.status(201).json({
      ...(member as any),
      allergies: JSON.parse((member as any).allergies || "[]"),
      dislikes: JSON.parse((member as any).dislikes || "[]"),
      favorites: JSON.parse((member as any).favorites || "[]"),
      no_spicy: Boolean((member as any).no_spicy),
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Update family member
router.put("/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updates = req.body;

    // Build dynamic update query
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push("name = ?");
      values.push(updates.name);
    }
    if (updates.dietary_style !== undefined) {
      fields.push("dietary_style = ?");
      values.push(updates.dietary_style);
    }
    if (updates.allergies !== undefined) {
      fields.push("allergies = ?");
      values.push(JSON.stringify(updates.allergies));
    }
    if (updates.dislikes !== undefined) {
      fields.push("dislikes = ?");
      values.push(JSON.stringify(updates.dislikes));
    }
    if (updates.favorites !== undefined) {
      fields.push("favorites = ?");
      values.push(JSON.stringify(updates.favorites));
    }
    if (updates.no_spicy !== undefined) {
      fields.push("no_spicy = ?");
      values.push(updates.no_spicy ? 1 : 0);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    values.push(id);

    db.prepare(
      `UPDATE family_members SET ${fields.join(", ")} WHERE id = ?`
    ).run(...values);

    const member = db
      .prepare("SELECT * FROM family_members WHERE id = ?")
      .get(id);

    if (!member) {
      return res.status(404).json({ error: "Family member not found" });
    }

    res.json({
      ...(member as any),
      allergies: JSON.parse((member as any).allergies || "[]"),
      dislikes: JSON.parse((member as any).dislikes || "[]"),
      favorites: JSON.parse((member as any).favorites || "[]"),
      no_spicy: Boolean((member as any).no_spicy),
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Delete family member
router.delete("/:id", (req, res) => {
  const id = parseInt(req.params.id);

  const result = db
    .prepare("DELETE FROM family_members WHERE id = ?")
    .run(id);

  if (result.changes === 0) {
    return res.status(404).json({ error: "Family member not found" });
  }

  res.status(204).send();
});

export default router;
