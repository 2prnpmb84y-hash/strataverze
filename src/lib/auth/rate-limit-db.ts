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
 * the rows for that key in the window number no more than the limit.
 *
 * Two ways to use it:
 *   - hitRateLimit: every attempt counts (authenticator codes, search).
 *   - rateLimitReached, then recordRateLimitHit only when the attempt
 *     failed or was used: for sign-in (failed passwords only) and password
 *     reset emails (only those sent). Counting refused or successful
 *     attempts there would let anyone who knows an email address lock its
 *     owner out (review of S7).
 *
 * The in-memory limiter still runs first, as a cheap first check and as the
 * fallback if the database cannot be reached (the request is then limited
 * per instance only, rather than refused).
 */

const MINUTE = 60 * 1000;

export const RATE_LIMITS = {
  /** Failed sign-ins from one address for one account. */
  signIn: { limit: 5, windowMs: 15 * MINUTE },
  /**
   * Failed sign-ins for one account from anywhere. Above what one address
   * can reach (20 an hour), so locking an account out needs many addresses.
   */
  signInAccount: { limit: 50, windowMs: 60 * MINUTE },
  /** Failed sign-ins from one address for any account (password spraying). */
  signInAddress: { limit: 100, windowMs: 60 * MINUTE },
  signUp: { limit: 5, windowMs: 15 * MINUTE },
  signUpAddress: { limit: 20, windowMs: 60 * MINUTE },
  /** Password reset emails sent for one account from one address. */
  passwordReset: { limit: 3, windowMs: 15 * MINUTE },
  /** Password reset emails sent for one account from anywhere. */
  passwordResetAccount: { limit: 10, windowMs: 60 * MINUTE },
  /** Password reset emails requested from one address. */
  passwordResetAddress: { limit: 20, windowMs: 60 * MINUTE },
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
        .aggregate((a) => ({ n: a.count() })).then((r) => r.n),
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

/** A limit's key, or null when there is no subject (the limit is then skipped). */
function keyFor(name: RateLimitName, subject: string | null | undefined): string | null {
  if (!subject) return null;
  return auditHash(`${name}|${subject}`);
}

/**
 * Whether the limit is already reached for this subject, without counting
 * an attempt. A missing subject (no IP address, say) never limits. If the
 * database cannot be reached the attempt is allowed (Supabase's own limits
 * still apply).
 */
export async function rateLimitReached(name: RateLimitName, subject: string | null | undefined, nowMs: number = Date.now()): Promise<boolean> {
  const { limit, windowMs } = RATE_LIMITS[name];
  const keyHash = keyFor(name, subject);
  if (!keyHash) return false;
  try {
    const count = Number(
      await db.orm.public.RateLimitHit
        .where((h) => and(h.keyHash.eq(keyHash), h.hitAt.gt(ts(nowMs - windowMs))))
        .aggregate((a) => ({ n: a.count() })).then((r) => r.n),
    );
    return count >= limit;
  } catch (err) {
    console.error("[rate-limit] database check failed:", err instanceof Error ? err.name : "error");
    return false;
  }
}

/** Whether any of these limits is reached. */
export async function anyRateLimitReached(checks: readonly [RateLimitName, string | null | undefined][]): Promise<boolean> {
  const results = await Promise.all(checks.map(([name, subject]) => rateLimitReached(name, subject)));
  return results.some(Boolean);
}

/** Count one attempt against each of these limits (failures are logged, never thrown). */
export async function recordRateLimitHits(checks: readonly [RateLimitName, string | null | undefined][], nowMs: number = Date.now()): Promise<void> {
  for (const [name, subject] of checks) {
    const keyHash = keyFor(name, subject);
    if (!keyHash) continue;
    try {
      await db.orm.public.RateLimitHit.create({ keyHash, hitAt: ts(nowMs) });
    } catch (err) {
      console.error("[rate-limit] could not record an attempt:", err instanceof Error ? err.name : "error");
    }
  }
}

/**
 * The client's IP address as Vercel reports it, or null. Vercel sets
 * x-forwarded-for itself (a value sent by the client is not passed on).
 */
export function clientIp(h: Headers): string | null {
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "";
  return ip ? ip.slice(0, 64) : null;
}
