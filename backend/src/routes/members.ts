// routes/members.ts
// Family members CRUD operations

import { Router } from "express";
import { query, queryOne, queryRaw } from "../db";
import { validateFamilyMember } from "../validation-v3";
import { requireAuth, verifyFamilyAccess } from "../middleware/auth";

const router = Router();

// All member routes require auth
router.use(requireAuth);

// Get all family members for a family
router.get("/", async (req, res) => {
  const familyId = parseInt(req.query.family_id as string);

  if (!familyId) {
    return res.status(400).json({ error: "family_id is required" });
  }

  // Verify family belongs to household
  const family = await verifyFamilyAccess(familyId, req.householdId);
  if (!family) {
    return res.status(404).json({ error: "Family not found" });
  }

  const members = (await query(
    `SELECT
      id, family_id, name, dietary_style,
      allergies, dislikes, favorites, no_spicy,
      created_at
    FROM family_members
    WHERE family_id = $1
    ORDER BY created_at ASC`,
    [familyId],
  )).map((row: any) => ({
    ...row,
    allergies: JSON.parse(row.allergies || "[]"),
    dislikes: JSON.parse(row.dislikes || "[]"),
    favorites: JSON.parse(row.favorites || "[]"),
    no_spicy: !!row.no_spicy,
  }));

  res.json(members);
});

// Get single family member
router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);

  const row = await queryOne(
    `SELECT
      id, family_id, name, dietary_style,
      allergies, dislikes, favorites, no_spicy,
      created_at
    FROM family_members
    WHERE id = $1`,
    [id],
  );

  if (!row) {
    return res.status(404).json({ error: "Family member not found" });
  }

  const member = {
    ...row,
    allergies: JSON.parse(row.allergies || "[]"),
    dislikes: JSON.parse(row.dislikes || "[]"),
    favorites: JSON.parse(row.favorites || "[]"),
    no_spicy: !!row.no_spicy,
  };

  res.json(member);
});

// Create family member
router.post("/", async (req, res) => {
  try {
    const input = validateFamilyMember(req.body);

    // Verify family belongs to household
    const family = await verifyFamilyAccess(input.family_id, req.householdId);
    if (!family) {
      return res.status(404).json({ error: "Family not found" });
    }

    const member = await queryOne(
      `INSERT INTO family_members
      (family_id, name, dietary_style, allergies, dislikes, favorites, no_spicy)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        input.family_id,
        input.name,
        input.dietary_style,
        JSON.stringify(input.allergies || []),
        JSON.stringify(input.dislikes || []),
        JSON.stringify(input.favorites || []),
        input.no_spicy ?? false,
      ],
    );

    res.status(201).json({
      ...member,
      allergies: JSON.parse(member.allergies || "[]"),
      dislikes: JSON.parse(member.dislikes || "[]"),
      favorites: JSON.parse(member.favorites || "[]"),
      no_spicy: !!member.no_spicy,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Update family member
router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updates = req.body;

    // Build dynamic update query
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.dietary_style !== undefined) {
      fields.push(`dietary_style = $${paramIndex++}`);
      values.push(updates.dietary_style);
    }
    if (updates.allergies !== undefined) {
      fields.push(`allergies = $${paramIndex++}`);
      values.push(JSON.stringify(updates.allergies));
    }
    if (updates.dislikes !== undefined) {
      fields.push(`dislikes = $${paramIndex++}`);
      values.push(JSON.stringify(updates.dislikes));
    }
    if (updates.favorites !== undefined) {
      fields.push(`favorites = $${paramIndex++}`);
      values.push(JSON.stringify(updates.favorites));
    }
    if (updates.no_spicy !== undefined) {
      fields.push(`no_spicy = $${paramIndex++}`);
      values.push(updates.no_spicy ?? false);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    values.push(id);

    const member = await queryOne(
      `UPDATE family_members SET ${fields.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      values,
    );

    if (!member) {
      return res.status(404).json({ error: "Family member not found" });
    }

    res.json({
      ...member,
      allergies: JSON.parse(member.allergies || "[]"),
      dislikes: JSON.parse(member.dislikes || "[]"),
      favorites: JSON.parse(member.favorites || "[]"),
      no_spicy: !!member.no_spicy,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Delete family member
router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);

  const result = await queryRaw(
    "DELETE FROM family_members WHERE id = $1",
    [id],
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: "Family member not found" });
  }

  res.status(204).send();
});

export default router;
