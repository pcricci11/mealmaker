// routes/cooking-schedule.ts
// Weekly cooking schedule and lunch planning

import { Router } from "express";
import { query, queryOne, transaction } from "../db";
import { requireAuth, verifyFamilyAccess } from "../middleware/auth";

const router = Router();

// All cooking schedule routes require auth
router.use(requireAuth);

// ===== COOKING SCHEDULE =====

// Get cooking schedule for a week
router.get("/", async (req, res) => {
  const familyId = parseInt(req.query.family_id as string);
  const weekStart = req.query.week_start as string;

  if (!familyId || !weekStart) {
    return res.status(400).json({
      error: "family_id and week_start are required"
    });
  }

  const family = await verifyFamilyAccess(familyId, req.householdId);
  if (!family) return res.status(404).json({ error: "Family not found" });

  const schedule = (await query(
    `SELECT
      id, family_id, week_start, day, is_cooking,
      meal_mode, num_mains, created_at, updated_at
    FROM weekly_cooking_schedule
    WHERE family_id = $1 AND week_start = $2
    ORDER BY
      CASE day
        WHEN 'monday' THEN 1
        WHEN 'tuesday' THEN 2
        WHEN 'wednesday' THEN 3
        WHEN 'thursday' THEN 4
        WHEN 'friday' THEN 5
        WHEN 'saturday' THEN 6
        WHEN 'sunday' THEN 7
      END`,
    [familyId, weekStart],
  )).map((row: any) => ({
    ...row,
    is_cooking: !!row.is_cooking,
  }));

  // Get main assignments for each schedule item
  for (const item of schedule) {
    const assignments = (await query(
      `SELECT id, schedule_id, main_number, member_ids
      FROM cooking_day_main_assignments
      WHERE schedule_id = $1
      ORDER BY main_number ASC`,
      [item.id],
    )).map((a: any) => ({
      ...a,
      member_ids: JSON.parse(a.member_ids || "[]"),
    }));

    (item as any).main_assignments = assignments;
  }

  res.json(schedule);
});

// Save/update cooking schedule for a week
router.post("/", async (req, res) => {
  const { family_id, week_start, schedule } = req.body;

  if (!family_id || !week_start || !Array.isArray(schedule)) {
    return res.status(400).json({
      error: "family_id, week_start, and schedule array are required"
    });
  }

  const familyCheck = await verifyFamilyAccess(family_id, req.householdId);
  if (!familyCheck) return res.status(404).json({ error: "Family not found" });

  await transaction(async (client) => {
    // Delete existing schedule for this week
    await client.query(
      `DELETE FROM weekly_cooking_schedule
      WHERE family_id = $1 AND week_start = $2`,
      [family_id, week_start],
    );

    // Insert new schedule
    for (const item of schedule) {
      const result = await client.query(
        `INSERT INTO weekly_cooking_schedule
        (family_id, week_start, day, is_cooking, meal_mode, num_mains)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id`,
        [
          family_id,
          week_start,
          item.day,
          item.is_cooking ?? false,
          item.meal_mode || null,
          item.num_mains || null,
        ],
      );

      const scheduleId = result.rows[0].id;

      // Insert main assignments if provided
      if (item.main_assignments && Array.isArray(item.main_assignments)) {
        for (const assignment of item.main_assignments) {
          await client.query(
            `INSERT INTO cooking_day_main_assignments
            (schedule_id, main_number, member_ids)
            VALUES ($1, $2, $3)`,
            [
              scheduleId,
              assignment.main_number,
              JSON.stringify(assignment.member_ids || []),
            ],
          );
        }
      }
    }
  });

  res.status(201).json({ message: "Cooking schedule saved" });
});

// ===== LUNCH PLANNING =====

// Get lunch needs for a week
router.get("/lunch", async (req, res) => {
  const familyId = parseInt(req.query.family_id as string);
  const weekStart = req.query.week_start as string;

  if (!familyId || !weekStart) {
    return res.status(400).json({
      error: "family_id and week_start are required"
    });
  }

  const lunchFamily = await verifyFamilyAccess(familyId, req.householdId);
  if (!lunchFamily) return res.status(404).json({ error: "Family not found" });

  const lunchNeeds = (await query(
    `SELECT
      id, family_id, week_start, member_id, day,
      needs_lunch, leftovers_ok, created_at, updated_at
    FROM weekly_lunch_needs
    WHERE family_id = $1 AND week_start = $2
    ORDER BY member_id,
      CASE day
        WHEN 'monday' THEN 1
        WHEN 'tuesday' THEN 2
        WHEN 'wednesday' THEN 3
        WHEN 'thursday' THEN 4
        WHEN 'friday' THEN 5
      END`,
    [familyId, weekStart],
  )).map((row: any) => ({
    ...row,
    needs_lunch: !!row.needs_lunch,
    leftovers_ok: !!row.leftovers_ok,
  }));

  res.json(lunchNeeds);
});

// Save/update lunch needs for a week
router.post("/lunch", async (req, res) => {
  const { family_id, week_start, lunch_needs } = req.body;

  if (!family_id || !week_start || !Array.isArray(lunch_needs)) {
    return res.status(400).json({
      error: "family_id, week_start, and lunch_needs array are required"
    });
  }

  const lunchFamilyCheck = await verifyFamilyAccess(family_id, req.householdId);
  if (!lunchFamilyCheck) return res.status(404).json({ error: "Family not found" });

  await transaction(async (client) => {
    // Delete existing lunch needs for this week
    await client.query(
      `DELETE FROM weekly_lunch_needs
      WHERE family_id = $1 AND week_start = $2`,
      [family_id, week_start],
    );

    // Insert new lunch needs
    for (const item of lunch_needs) {
      await client.query(
        `INSERT INTO weekly_lunch_needs
        (family_id, week_start, member_id, day, needs_lunch, leftovers_ok)
        VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          family_id,
          week_start,
          item.member_id,
          item.day,
          item.needs_lunch ?? false,
          item.leftovers_ok ?? false,
        ],
      );
    }
  });

  res.status(201).json({ message: "Lunch needs saved" });
});

export default router;
