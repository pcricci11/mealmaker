import { Router, Request, Response } from "express";
import { query, queryOne, transaction } from "../db";
import { requireAuth } from "../middleware/auth";

const router = Router();

// Characters for invite code (no 0/O/1/I/L to avoid ambiguity)
const INVITE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateInviteCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += INVITE_CHARS[Math.floor(Math.random() * INVITE_CHARS.length)];
  }
  return `CHEF-${code}`;
}

// POST /api/households — create a new household
router.post("/households", requireAuth, async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }

  const userId = req.user!.id;

  const result = await transaction(async (client) => {
    // Generate a unique invite code
    let inviteCode = generateInviteCode();
    let attempts = 0;
    while (attempts < 10) {
      const existing = await client.query(
        "SELECT id FROM households WHERE invite_code = $1",
        [inviteCode],
      );
      if (existing.rows.length === 0) break;
      inviteCode = generateInviteCode();
      attempts++;
    }

    // Create household
    const householdResult = await client.query(
      `INSERT INTO households (name, invite_code, created_by)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name.trim(), inviteCode, userId],
    );
    const household = householdResult.rows[0];

    // Add creator as owner
    await client.query(
      `INSERT INTO household_members (household_id, user_id, role)
       VALUES ($1, $2, 'owner')`,
      [household.id, userId],
    );

    // Auto-create a family for the household
    const familyResult = await client.query(
      `INSERT INTO families (name, allergies, vegetarian_ratio, gluten_free, dairy_free, nut_free, household_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [`${name.trim()}'s Family`, "[]", 40, false, false, false, household.id],
    );

    return { household, family: familyResult.rows[0] };
  });

  res.status(201).json({
    household: result.household,
    family: result.family,
  });
});

// POST /api/households/join — join an existing household by invite code
router.post("/households/join", requireAuth, async (req: Request, res: Response) => {
  const { invite_code } = req.body;
  if (!invite_code || typeof invite_code !== "string" || !invite_code.trim()) {
    return res.status(400).json({ error: "invite_code is required" });
  }

  const userId = req.user!.id;

  const household = await queryOne(
    "SELECT * FROM households WHERE invite_code = $1",
    [invite_code.trim().toUpperCase()],
  );

  if (!household) {
    return res.status(404).json({ error: "Invalid invite code" });
  }

  // Check if already a member
  const existing = await queryOne(
    "SELECT id FROM household_members WHERE household_id = $1 AND user_id = $2",
    [household.id, userId],
  );

  if (existing) {
    return res.status(200).json({ household, alreadyMember: true });
  }

  await query(
    `INSERT INTO household_members (household_id, user_id, role)
     VALUES ($1, $2, 'member')`,
    [household.id, userId],
  );

  res.status(200).json({ household, alreadyMember: false });
});

// GET /api/households/mine — get current user's household + members
router.get("/households/mine", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.id;

  const membership = await queryOne(
    "SELECT household_id, role FROM household_members WHERE user_id = $1 LIMIT 1",
    [userId],
  );

  if (!membership) {
    return res.json({ household: null, members: [] });
  }

  const household = await queryOne(
    "SELECT * FROM households WHERE id = $1",
    [membership.household_id],
  );

  const members = await query(
    `SELECT hm.id, hm.role, hm.joined_at,
            u.id as user_id, u.clerk_id, u.email, u.display_name
     FROM household_members hm
     JOIN users u ON u.id = hm.user_id
     WHERE hm.household_id = $1
     ORDER BY hm.joined_at ASC`,
    [membership.household_id],
  );

  res.json({ household, members, myRole: membership.role });
});

// POST /api/auth/sync — sync Clerk user to local DB
router.post("/auth/sync", requireAuth, async (req: Request, res: Response) => {
  const { email, display_name } = req.body;
  const clerkId = req.user!.clerk_id;

  const user = await queryOne(
    `UPDATE users SET
       email = COALESCE($1, email),
       display_name = COALESCE($2, display_name),
       updated_at = NOW()
     WHERE clerk_id = $3
     RETURNING *`,
    [email || null, display_name || null, clerkId],
  );

  // Get household info
  const membership = await queryOne(
    "SELECT household_id FROM household_members WHERE user_id = $1 LIMIT 1",
    [user!.id],
  );

  let household = null;
  if (membership) {
    household = await queryOne(
      "SELECT * FROM households WHERE id = $1",
      [membership.household_id],
    );
  }

  res.json({ user, household });
});

// POST /api/auth/welcome-seen — mark the welcome carousel as seen
router.post("/auth/welcome-seen", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.id;
  await queryOne(
    "UPDATE users SET has_seen_welcome = TRUE, updated_at = NOW() WHERE id = $1 RETURNING id",
    [userId],
  );
  res.json({ ok: true });
});

export default router;
