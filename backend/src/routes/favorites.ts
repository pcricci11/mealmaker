// routes/favorites.ts
// Family favorites CRUD (chefs, meals, sides)

import { Router } from "express";
import { query, queryOne, queryRaw } from "../db";
import { requireAuth, verifyFamilyAccess } from "../middleware/auth";

const router = Router();

// All favorite routes require auth
router.use(requireAuth);

// ===== FAVORITE CHEFS =====

router.get("/chefs", async (req, res) => {
  const familyId = parseInt(req.query.family_id as string);

  if (!familyId) {
    return res.status(400).json({ error: "family_id is required" });
  }

  const family = await verifyFamilyAccess(familyId, req.householdId);
  if (!family) return res.status(404).json({ error: "Family not found" });

  const chefs = await query(
    `SELECT id, family_id, name, cuisines, created_at
    FROM family_favorite_chefs
    WHERE family_id = $1
    ORDER BY name ASC`,
    [familyId],
  );

  res.json(chefs.map((c: any) => ({ ...c, cuisines: c.cuisines ? JSON.parse(c.cuisines) : null })));
});

router.post("/chefs", async (req, res) => {
  const { family_id, name, cuisines } = req.body;

  if (!family_id || !name) {
    return res.status(400).json({ error: "family_id and name are required" });
  }

  const family = await verifyFamilyAccess(family_id, req.householdId);
  if (!family) return res.status(404).json({ error: "Family not found" });

  const chef = await queryOne(
    `INSERT INTO family_favorite_chefs (family_id, name, cuisines)
    VALUES ($1, $2, $3)
    RETURNING *`,
    [family_id, name.trim(), cuisines?.length ? JSON.stringify(cuisines) : null],
  );

  res.status(201).json({ ...chef, cuisines: chef.cuisines ? JSON.parse(chef.cuisines) : null });
});

router.delete("/chefs/:id", async (req, res) => {
  const id = parseInt(req.params.id);

  const result = await queryRaw(
    "DELETE FROM family_favorite_chefs WHERE id = $1",
    [id],
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: "Chef not found" });
  }

  res.status(204).send();
});

// ===== FAVORITE WEBSITES =====

router.get("/websites", async (req, res) => {
  const familyId = parseInt(req.query.family_id as string);

  if (!familyId) {
    return res.status(400).json({ error: "family_id is required" });
  }

  const family = await verifyFamilyAccess(familyId, req.householdId);
  if (!family) return res.status(404).json({ error: "Family not found" });

  const websites = await query(
    `SELECT id, family_id, name, created_at
    FROM family_favorite_websites
    WHERE family_id = $1
    ORDER BY name ASC`,
    [familyId],
  );

  res.json(websites);
});

router.post("/websites", async (req, res) => {
  const { family_id, name } = req.body;

  if (!family_id || !name) {
    return res.status(400).json({ error: "family_id and name are required" });
  }

  const family = await verifyFamilyAccess(family_id, req.householdId);
  if (!family) return res.status(404).json({ error: "Family not found" });

  const website = await queryOne(
    `INSERT INTO family_favorite_websites (family_id, name)
    VALUES ($1, $2)
    RETURNING *`,
    [family_id, name],
  );

  res.status(201).json(website);
});

router.delete("/websites/:id", async (req, res) => {
  const id = parseInt(req.params.id);

  const result = await queryRaw(
    "DELETE FROM family_favorite_websites WHERE id = $1",
    [id],
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: "Website not found" });
  }

  res.status(204).send();
});

// ===== FAVORITE MEALS =====

router.get("/meals", async (req, res) => {
  const familyId = parseInt(req.query.family_id as string);

  if (!familyId) {
    return res.status(400).json({ error: "family_id is required" });
  }

  const family = await verifyFamilyAccess(familyId, req.householdId);
  if (!family) return res.status(404).json({ error: "Family not found" });

  const meals = await query(
    `SELECT
      id, family_id, name, recipe_url, difficulty,
      total_time_minutes, frequency_preference, notes, created_at
    FROM family_favorite_meals
    WHERE family_id = $1
    ORDER BY name ASC`,
    [familyId],
  );

  res.json(meals);
});

router.post("/meals", async (req, res) => {
  const {
    family_id,
    name,
    recipe_url,
    difficulty,
    total_time_minutes,
    frequency_preference,
    notes,
  } = req.body;

  if (!family_id || !name) {
    return res.status(400).json({ error: "family_id and name are required" });
  }

  const family = await verifyFamilyAccess(family_id, req.householdId);
  if (!family) return res.status(404).json({ error: "Family not found" });

  const meal = await queryOne(
    `INSERT INTO family_favorite_meals
    (family_id, name, recipe_url, difficulty, total_time_minutes, frequency_preference, notes)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *`,
    [
      family_id,
      name,
      recipe_url || null,
      difficulty || null,
      total_time_minutes || null,
      frequency_preference || null,
      notes || null,
    ],
  );

  res.status(201).json(meal);
});

router.put("/meals/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const updates = req.body;

  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (updates.name !== undefined) {
    fields.push(`name = $${paramIndex++}`);
    values.push(updates.name);
  }
  if (updates.recipe_url !== undefined) {
    fields.push(`recipe_url = $${paramIndex++}`);
    values.push(updates.recipe_url || null);
  }
  if (updates.difficulty !== undefined) {
    fields.push(`difficulty = $${paramIndex++}`);
    values.push(updates.difficulty || null);
  }
  if (updates.total_time_minutes !== undefined) {
    fields.push(`total_time_minutes = $${paramIndex++}`);
    values.push(updates.total_time_minutes || null);
  }
  if (updates.frequency_preference !== undefined) {
    fields.push(`frequency_preference = $${paramIndex++}`);
    values.push(updates.frequency_preference || null);
  }
  if (updates.notes !== undefined) {
    fields.push(`notes = $${paramIndex++}`);
    values.push(updates.notes || null);
  }

  if (fields.length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  values.push(id);

  const meal = await queryOne(
    `UPDATE family_favorite_meals SET ${fields.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
    values,
  );

  if (!meal) {
    return res.status(404).json({ error: "Meal not found" });
  }

  res.json(meal);
});

router.delete("/meals/:id", async (req, res) => {
  const id = parseInt(req.params.id);

  const result = await queryRaw(
    "DELETE FROM family_favorite_meals WHERE id = $1",
    [id],
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: "Meal not found" });
  }

  res.status(204).send();
});

// ===== FAVORITE SIDES =====

router.get("/sides", async (req, res) => {
  const familyId = parseInt(req.query.family_id as string);

  if (!familyId) {
    return res.status(400).json({ error: "family_id is required" });
  }

  const family = await verifyFamilyAccess(familyId, req.householdId);
  if (!family) return res.status(404).json({ error: "Family not found" });

  const sides = (await query(
    `SELECT
      id, family_id, name, recipe_url, category,
      pairs_well_with, notes, created_at
    FROM family_favorite_sides
    WHERE family_id = $1
    ORDER BY name ASC`,
    [familyId],
  )).map((row: any) => ({
    ...row,
    pairs_well_with: row.pairs_well_with ? JSON.parse(row.pairs_well_with) : null,
  }));

  res.json(sides);
});

router.post("/sides", async (req, res) => {
  const {
    family_id,
    name,
    recipe_url,
    category,
    pairs_well_with,
    notes,
  } = req.body;

  if (!family_id || !name) {
    return res.status(400).json({ error: "family_id and name are required" });
  }

  const family = await verifyFamilyAccess(family_id, req.householdId);
  if (!family) return res.status(404).json({ error: "Family not found" });

  const side = await queryOne(
    `INSERT INTO family_favorite_sides
    (family_id, name, recipe_url, category, pairs_well_with, notes)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *`,
    [
      family_id,
      name,
      recipe_url || null,
      category || null,
      pairs_well_with ? JSON.stringify(pairs_well_with) : null,
      notes || null,
    ],
  );

  res.status(201).json({
    ...side,
    pairs_well_with: side.pairs_well_with
      ? JSON.parse(side.pairs_well_with)
      : null,
  });
});

router.put("/sides/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const updates = req.body;

  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (updates.name !== undefined) {
    fields.push(`name = $${paramIndex++}`);
    values.push(updates.name);
  }
  if (updates.recipe_url !== undefined) {
    fields.push(`recipe_url = $${paramIndex++}`);
    values.push(updates.recipe_url || null);
  }
  if (updates.category !== undefined) {
    fields.push(`category = $${paramIndex++}`);
    values.push(updates.category || null);
  }
  if (updates.pairs_well_with !== undefined) {
    fields.push(`pairs_well_with = $${paramIndex++}`);
    values.push(updates.pairs_well_with ? JSON.stringify(updates.pairs_well_with) : null);
  }
  if (updates.notes !== undefined) {
    fields.push(`notes = $${paramIndex++}`);
    values.push(updates.notes || null);
  }

  if (fields.length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  values.push(id);

  const side = await queryOne(
    `UPDATE family_favorite_sides SET ${fields.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
    values,
  );

  if (!side) {
    return res.status(404).json({ error: "Side not found" });
  }

  res.json({
    ...side,
    pairs_well_with: side.pairs_well_with
      ? JSON.parse(side.pairs_well_with)
      : null,
  });
});

router.delete("/sides/:id", async (req, res) => {
  const id = parseInt(req.params.id);

  const result = await queryRaw(
    "DELETE FROM family_favorite_sides WHERE id = $1",
    [id],
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: "Side not found" });
  }

  res.status(204).send();
});

export default router;
