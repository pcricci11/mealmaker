import { Request, Response, NextFunction } from "express";
import { verifyToken } from "@clerk/express";
import { queryOne } from "../db";

// Extend Express Request with user and household info
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        clerk_id: string;
        email: string | null;
        display_name: string | null;
      };
      householdId?: number | null;
    }
  }
}

async function resolveUser(clerkId: string): Promise<{
  user: { id: number; clerk_id: string; email: string | null; display_name: string | null };
  householdId: number | null;
}> {
  // Find or create local user
  let user = await queryOne<{
    id: number;
    clerk_id: string;
    email: string | null;
    display_name: string | null;
  }>("SELECT id, clerk_id, email, display_name FROM users WHERE clerk_id = $1", [clerkId]);

  if (!user) {
    user = await queryOne(
      "INSERT INTO users (clerk_id) VALUES ($1) RETURNING id, clerk_id, email, display_name",
      [clerkId],
    );
  }

  // Look up household membership
  const membership = await queryOne<{ household_id: number }>(
    "SELECT household_id FROM household_members WHERE user_id = $1 LIMIT 1",
    [user!.id],
  );

  return {
    user: user!,
    householdId: membership?.household_id ?? null,
  };
}

/**
 * Middleware that requires a valid Clerk JWT.
 * Returns 401 if no valid token is present.
 * Attaches req.user (local user row) and req.householdId.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const token = authHeader.slice(7);
    const verifiedToken = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });
    const clerkId = verifiedToken.sub;

    if (!clerkId) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const { user, householdId } = await resolveUser(clerkId);
    req.user = user;
    req.householdId = householdId;
    next();
  } catch (err: any) {
    console.error("Auth error:", err.message);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Middleware that optionally attaches user if a valid Clerk JWT is present.
 * Proceeds without auth if no token provided (for public/transitional endpoints).
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next();
    }

    const token = authHeader.slice(7);
    const verifiedToken = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });
    const clerkId = verifiedToken.sub;

    if (clerkId) {
      const { user, householdId } = await resolveUser(clerkId);
      req.user = user;
      req.householdId = householdId;
    }
    next();
  } catch {
    // Token invalid — proceed without auth
    next();
  }
}

/**
 * Helper: verify that a family belongs to the authenticated user's household.
 * Returns the family row or null.
 */
export async function verifyFamilyAccess(
  familyId: number,
  householdId: number | null | undefined,
): Promise<any | null> {
  if (!householdId) return null;
  const family = await queryOne(
    "SELECT * FROM families WHERE id = $1 AND household_id = $2",
    [familyId, householdId],
  );
  return family;
}
