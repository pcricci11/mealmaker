// routes/favorites.ts
// Family favorites CRUD (chefs, meals, sides)

import { Router } from "express";
import db from "../db";

const router = Router();

// ===== FAVORITE CHEFS =====

router.get("/chefs", (req, res) => {
  const familyId = parseInt(req.query.family_id as string);
  
  if (!familyId) {
    return res.status(400).json({ error: "family_id is required" });
  }

  const chefs = db
    .prepare(
      `SELECT id, family_id, name, created_at 
      FROM family_favorite_chefs 
      WHERE family_id = ?
      ORDER BY name ASC`
    )
    .all(familyId);

  res.json(chefs);
});

router.post("/chefs", (req, res) => {
  const { family_id, name } = req.body;

  if (!family_id || !name) {
    return res.status(400).json({ error: "family_id and name are required" });
  }

  const result = db
    .prepare(
      `INSERT INTO family_favorite_chefs (family_id, name) 
      VALUES (?, ?)`
    )
    .run(family_id, name);

  const chef = db
    .prepare("SELECT * FROM family_favorite_chefs WHERE id = ?")
    .get(result.lastInsertRowid);

  res.status(201).json(chef);
});

router.delete("/chefs/:id", (req, res) => {
  const id = parseInt(req.params.id);

  const result = db
    .prepare("DELETE FROM family_favorite_chefs WHERE id = ?")
    .run(id);

  if (result.changes === 0) {
    return res.status(404).json({ error: "Chef not found" });
  }

  res.status(204).send();
});

// ===== FAVORITE MEALS =====

router.get("/meals", (req, res) => {
  const familyId = parseInt(req.query.family_id as string);
  
  if (!familyId) {
    return res.status(400).json({ error: "family_id is required" });
  }

  const meals = db
    .prepare(
      `SELECT 
        id, family_id, name, recipe_url, difficulty, 
        total_time_minutes, frequency_preference, notes, created_at
      FROM family_favorite_meals 
      WHERE family_id = ?
      ORDER BY name ASC`
    )
    .all(familyId);

  res.json(meals);
});

router.post("/meals", (req, res) => {
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

  const result = db
    .prepare(
      `INSERT INTO family_favorite_meals 
      (family_id, name, recipe_url, difficulty, total_time_minutes, frequency_preference, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      family_id,
      name,
      recipe_url || null,
      difficulty || null,
      total_time_minutes || null,
      frequency_preference || null,
      notes || null
    );

  const meal = db
    .prepare("SELECT * FROM family_favorite_meals WHERE id = ?")
    .get(result.lastInsertRowid);

  res.status(201).json(meal);
});

router.put("/meals/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const updates = req.body;

  const fields: string[] = [];
  const values: any[] = [];

  if (updates.name !== undefined) {
    fields.push("name = ?");
    values.push(updates.name);
  }
  if (updates.recipe_url !== undefined) {
    fields.push("recipe_url = ?");
    values.push(updates.recipe_url || null);
  }
  if (updates.difficulty !== undefined) {
    fields.push("difficulty = ?");
    values.push(updates.difficulty || null);
  }
  if (updates.total_time_minutes !== undefined) {
    fields.push("total_time_minutes = ?");
    values.push(updates.total_time_minutes || null);
  }
  if (updates.frequency_preference !== undefined) {
    fields.push("frequency_preference = ?");
    values.push(updates.frequency_preference || null);
  }
  if (updates.notes !== undefined) {
    fields.push("notes = ?");
    values.push(updates.notes || null);
  }

  if (fields.length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  values.push(id);

  db.prepare(
    `UPDATE family_favorite_meals SET ${fields.join(", ")} WHERE id = ?`
  ).run(...values);

  const meal = db
    .prepare("SELECT * FROM family_favorite_meals WHERE id = ?")
    .get(id);

  if (!meal) {
    return res.status(404).json({ error: "Meal not found" });
  }

  res.json(meal);
});

router.delete("/meals/:id", (req, res) => {
  const id = parseInt(req.params.id);

  const result = db
    .prepare("DELETE FROM family_favorite_meals WHERE id = ?")
    .run(id);

  if (result.changes === 0) {
    return res.status(404).json({ error: "Meal not found" });
  }

  res.status(204).send();
});

// ===== FAVORITE SIDES =====

router.get("/sides", (req, res) => {
  const familyId = parseInt(req.query.family_id as string);
  
  if (!familyId) {
    return res.status(400).json({ error: "family_id is required" });
  }

  const sides = db
    .prepare(
      `SELECT 
        id, family_id, name, recipe_url, category, 
        pairs_well_with, notes, created_at
      FROM family_favorite_sides 
      WHERE family_id = ?
      ORDER BY name ASC`
    )
    .all(familyId)
    .map((row: any) => ({
      ...row,
      pairs_well_with: row.pairs_well_with ? JSON.parse(row.pairs_well_with) : null,
    }));

  res.json(sides);
});

router.post("/sides", (req, res) => {
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

  const result = db
    .prepare(
      `INSERT INTO family_favorite_sides 
      (family_id, name, recipe_url, category, pairs_well_with, notes)
      VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      family_id,
      name,
      recipe_url || null,
      category || null,
      pairs_well_with ? JSON.stringify(pairs_well_with) : null,
      notes || null
    );

  const side = db
    .prepare("SELECT * FROM family_favorite_sides WHERE id = ?")
    .get(result.lastInsertRowid);

  res.status(201).json({
    ...(side as any),
    pairs_well_with: (side as any).pairs_well_with
      ? JSON.parse((side as any).pairs_well_with)
      : null,
  });
});

router.put("/sides/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const updates = req.body;

  const fields: string[] = [];
  const values: any[] = [];

  if (updates.name !== undefined) {
    fields.push("name = ?");
    values.push(updates.name);
  }
  if (updates.recipe_url !== undefined) {
    fields.push("recipe_url = ?");
    values.push(updates.recipe_url || null);
  }
  if (updates.category !== undefined) {
    fields.push("category = ?");
    values.push(updates.category || null);
  }
  if (updates.pairs_well_with !== undefined) {
    fields.push("pairs_well_with = ?");
    values.push(updates.pairs_well_with ? JSON.stringify(updates.pairs_well_with) : null);
  }
  if (updates.notes !== undefined) {
    fields.push("notes = ?");
    values.push(updates.notes || null);
  }

  if (fields.length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  values.push(id);

  db.prepare(
    `UPDATE family_favorite_sides SET ${fields.join(", ")} WHERE id = ?`
  ).run(...values);

  const side = db
    .prepare("SELECT * FROM family_favorite_sides WHERE id = ?")
    .get(id);

  if (!side) {
    return res.status(404).json({ error: "Side not found" });
  }

  res.json({
    ...(side as any),
    pairs_well_with: (side as any).pairs_well_with
      ? JSON.parse((side as any).pairs_well_with)
      : null,
  });
});

router.delete("/sides/:id", (req, res) => {
  const id = parseInt(req.params.id);

  const result = db
    .prepare("DELETE FROM family_favorite_sides WHERE id = ?")
    .run(id);

  if (result.changes === 0) {
    return res.status(404).json({ error: "Side not found" });
  }

  res.status(204).send();
});

export default router;
