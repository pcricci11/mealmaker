// routes/cooking-schedule.ts
// Weekly cooking schedule and lunch planning

import { Router } from "express";
import db from "../db";

const router = Router();

// ===== COOKING SCHEDULE =====

// Get cooking schedule for a week
router.get("/", (req, res) => {
  const familyId = parseInt(req.query.family_id as string);
  const weekStart = req.query.week_start as string;

  if (!familyId || !weekStart) {
    return res.status(400).json({ 
      error: "family_id and week_start are required" 
    });
  }

  const schedule = db
    .prepare(
      `SELECT 
        id, family_id, week_start, day, is_cooking, 
        meal_mode, num_mains, created_at, updated_at
      FROM weekly_cooking_schedule 
      WHERE family_id = ? AND week_start = ?
      ORDER BY 
        CASE day
          WHEN 'monday' THEN 1
          WHEN 'tuesday' THEN 2
          WHEN 'wednesday' THEN 3
          WHEN 'thursday' THEN 4
          WHEN 'friday' THEN 5
          WHEN 'saturday' THEN 6
          WHEN 'sunday' THEN 7
        END`
    )
    .all(familyId, weekStart)
    .map((row: any) => ({
      ...row,
      is_cooking: Boolean(row.is_cooking),
    }));

  // Get main assignments for each schedule item
  for (const item of schedule) {
    const assignments = db
      .prepare(
        `SELECT id, schedule_id, main_number, member_ids
        FROM cooking_day_main_assignments
        WHERE schedule_id = ?
        ORDER BY main_number ASC`
      )
      .all(item.id)
      .map((a: any) => ({
        ...a,
        member_ids: JSON.parse(a.member_ids || "[]"),
      }));

    (item as any).main_assignments = assignments;
  }

  res.json(schedule);
});

// Save/update cooking schedule for a week
router.post("/", (req, res) => {
  const { family_id, week_start, schedule } = req.body;

  if (!family_id || !week_start || !Array.isArray(schedule)) {
    return res.status(400).json({ 
      error: "family_id, week_start, and schedule array are required" 
    });
  }

  // Use transaction
  db.transaction(() => {
    // Delete existing schedule for this week
    db.prepare(
      `DELETE FROM weekly_cooking_schedule 
      WHERE family_id = ? AND week_start = ?`
    ).run(family_id, week_start);

    // Insert new schedule
    for (const item of schedule) {
      const result = db
        .prepare(
          `INSERT INTO weekly_cooking_schedule 
          (family_id, week_start, day, is_cooking, meal_mode, num_mains)
          VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          family_id,
          week_start,
          item.day,
          item.is_cooking ? 1 : 0,
          item.meal_mode || null,
          item.num_mains || null
        );

      // Insert main assignments if provided
      if (item.main_assignments && Array.isArray(item.main_assignments)) {
        for (const assignment of item.main_assignments) {
          db.prepare(
            `INSERT INTO cooking_day_main_assignments 
            (schedule_id, main_number, member_ids)
            VALUES (?, ?, ?)`
          ).run(
            result.lastInsertRowid,
            assignment.main_number,
            JSON.stringify(assignment.member_ids || [])
          );
        }
      }
    }
  })();

  res.status(201).json({ message: "Cooking schedule saved" });
});

// ===== LUNCH PLANNING =====

// Get lunch needs for a week
router.get("/lunch", (req, res) => {
  const familyId = parseInt(req.query.family_id as string);
  const weekStart = req.query.week_start as string;

  if (!familyId || !weekStart) {
    return res.status(400).json({ 
      error: "family_id and week_start are required" 
    });
  }

  const lunchNeeds = db
    .prepare(
      `SELECT 
        id, family_id, week_start, member_id, day, 
        needs_lunch, leftovers_ok, created_at, updated_at
      FROM weekly_lunch_needs 
      WHERE family_id = ? AND week_start = ?
      ORDER BY member_id, 
        CASE day
          WHEN 'monday' THEN 1
          WHEN 'tuesday' THEN 2
          WHEN 'wednesday' THEN 3
          WHEN 'thursday' THEN 4
          WHEN 'friday' THEN 5
        END`
    )
    .all(familyId, weekStart)
    .map((row: any) => ({
      ...row,
      needs_lunch: Boolean(row.needs_lunch),
      leftovers_ok: Boolean(row.leftovers_ok),
    }));

  res.json(lunchNeeds);
});

// Save/update lunch needs for a week
router.post("/lunch", (req, res) => {
  const { family_id, week_start, lunch_needs } = req.body;

  if (!family_id || !week_start || !Array.isArray(lunch_needs)) {
    return res.status(400).json({ 
      error: "family_id, week_start, and lunch_needs array are required" 
    });
  }

  // Use transaction
  db.transaction(() => {
    // Delete existing lunch needs for this week
    db.prepare(
      `DELETE FROM weekly_lunch_needs 
      WHERE family_id = ? AND week_start = ?`
    ).run(family_id, week_start);

    // Insert new lunch needs
    for (const item of lunch_needs) {
      db.prepare(
        `INSERT INTO weekly_lunch_needs 
        (family_id, week_start, member_id, day, needs_lunch, leftovers_ok)
        VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        family_id,
        week_start,
        item.member_id,
        item.day,
        item.needs_lunch ? 1 : 0,
        item.leftovers_ok ? 1 : 0
      );
    }
  })();

  res.status(201).json({ message: "Lunch needs saved" });
});

export default router;
