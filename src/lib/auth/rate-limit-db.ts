import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";
import { db } from "@/prisma/db";
import { auditHash } from "@/lib/audit/security-audit";
import { rateLimit } from "./rate-limit";

/**
 * Rate limits that hold across every server instance (security stage S7,
 * finding SEC-020).
 *
 * Each attempt adds a row to rate_limit_hits under a keyed hash of the
 * limit's name and subject (an email address, an IP address or a profile
 * id), so no address is stored in the clear. The attempt is allowed while
 * the rows for that key in the window number no more than the limit. Denied
 * attempts count too, so hammering does not reset the window.
 *
 * The in-memory limiter still runs first, as a cheap first check and as the
 * fallback if the database cannot be reached (the request is then limited
 * per instance only, rather than refused).
 */

const MINUTE = 60 * 1000;

export const RATE_LIMITS = {
  /** Sign-in attempts from one address for one account. */
  signIn: { limit: 5, windowMs: 15 * MINUTE },
  /** Sign-in attempts for one account from anywhere. */
  signInAccount: { limit: 20, windowMs: 60 * MINUTE },
  /** Sign-in attempts from one address for any account. */
  signInAddress: { limit: 50, windowMs: 60 * MINUTE },
  signUp: { limit: 5, windowMs: 15 * MINUTE },
  signUpAddress: { limit: 20, windowMs: 60 * MINUTE },
  /** Password reset emails for one account. */
  passwordReset: { limit: 3, windowMs: 15 * MINUTE },
  passwordResetAddress: { limit: 10, windowMs: 60 * MINUTE },
  /** Authenticator code checks for one person. */
  mfaVerify: { limit: 5, windowMs: 15 * MINUTE },
  invitationAccept: { limit: 10, windowMs: 15 * MINUTE },
  search: { limit: 60, windowMs: MINUTE },
} as const satisfies Record<string, { limit: number; windowMs: number }>;

export type RateLimitName = keyof typeof RATE_LIMITS;

function ts(ms: number): TimestampString<3> {
  return new Date(ms).toISOString() as unknown as TimestampString<3>;
}

/**
 * Record one attempt and say whether it is within the limit. `subject` is
 * what is being limited (an email address, an IP address, a profile id).
 */
export async function hitRateLimit(name: RateLimitName, subject: string | null | undefined, nowMs: number = Date.now()): Promise<boolean> {
  const { limit, windowMs } = RATE_LIMITS[name];
  const raw = `${name}|${subject ?? "unknown"}`;
  if (!rateLimit(raw, limit, windowMs).success) return false;

  const keyHash = auditHash(raw);
  if (!keyHash) return true; // no hashing key: the in-memory check above is all there is
  try {
    await db.orm.public.RateLimitHit.create({ keyHash, hitAt: ts(nowMs) });
    const count = Number(
      await db.orm.public.RateLimitHit
        .where((h) => and(h.keyHash.eq(keyHash), h.hitAt.gt(ts(nowMs - windowMs))))
        .count(),
    );
    return count <= limit;
  } catch (err) {
    console.error("[rate-limit] database check failed:", err instanceof Error ? err.name : "error");
    return true;
  }
}

/** Every limit must allow the attempt. All are counted, even after one refuses. */
export async function hitRateLimits(checks: readonly [RateLimitName, string | null | undefined][]): Promise<boolean> {
  const results = await Promise.all(checks.map(([name, subject]) => hitRateLimit(name, subject)));
  return results.every(Boolean);
}
