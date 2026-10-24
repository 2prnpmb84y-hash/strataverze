/**
 * Session timeouts (security stage S5, finding SEC-011). Pure, so the rules
 * can be unit tested. The register and its enforcement are in
 * session-register.ts.
 *
 * Approved 23 October 2026 (security plan, "Proposed settings"):
 *   privileged (platform admins, Advisers, Accountants, Payment authorisers,
 *   treasurers: the same people MFA is mandatory for)
 *       idle 30 minutes, absolute 12 hours;
 *   everyone else (owners, committee, suppliers)
 *       idle 4 hours, absolute 14 days.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const SESSION_LIMITS = {
  privileged: { idleMs: 30 * MINUTE, absoluteMs: 12 * HOUR },
  standard: { idleMs: 4 * HOUR, absoluteMs: 14 * DAY },
} as const;

/** last_seen_at is written at most this often, to keep writes cheap. */
export const LAST_SEEN_WRITE_INTERVAL_MS = MINUTE;

export type SessionEndReason = "idle" | "absolute" | "revoked";

export type SessionVerdict =
  | { ok: true; touch: boolean }
  | { ok: false; reason: SessionEndReason };

/**
 * When the user signed in to this session, in milliseconds: the earliest
 * amr timestamp (amr keeps the sign-in method's time across token
 * refreshes). Null when the claims carry none.
 */
export function authenticatedAtFromClaims(claims: Record<string, unknown> | null | undefined): number | null {
  if (!claims || !Array.isArray(claims.amr)) return null;
  const times = (claims.amr as unknown[])
    .map((e) => (e && typeof e === "object" ? (e as { timestamp?: unknown }).timestamp : undefined))
    .filter((t): t is number => typeof t === "number" && Number.isFinite(t) && t > 0);
  return times.length ? Math.min(...times) * 1000 : null;
}

/** Parse a database timestamp (an ISO string) or Date to milliseconds. */
export function toMs(value: string | Date | null | undefined): number | null {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Whether a session may continue.
 *
 * revokedBeforeMs is the profile's sessions_revoked_at: a session that
 * signed in before it has been ended. amr timestamps are whole seconds, so
 * the comparison is made in whole seconds, and a session signed in during
 * the same second as the revocation is ended too (the database trigger
 * ends those as well).
 */
export function sessionVerdict(input: {
  nowMs: number;
  privileged: boolean;
  authenticatedAtMs: number;
  lastSeenAtMs: number;
  revokedAtMs: number | null;
  revokedBeforeMs: number | null;
}): SessionVerdict {
  if (input.revokedAtMs != null) return { ok: false, reason: "revoked" };
  if (
    input.revokedBeforeMs != null &&
    Math.floor(input.authenticatedAtMs / 1000) <= Math.floor(input.revokedBeforeMs / 1000)
  ) {
    return { ok: false, reason: "revoked" };
  }
  const limits = input.privileged ? SESSION_LIMITS.privileged : SESSION_LIMITS.standard;
  if (input.nowMs - input.authenticatedAtMs > limits.absoluteMs) return { ok: false, reason: "absolute" };
  if (input.nowMs - input.lastSeenAtMs > limits.idleMs) return { ok: false, reason: "idle" };
  return { ok: true, touch: input.nowMs - input.lastSeenAtMs >= LAST_SEEN_WRITE_INTERVAL_MS };
}

/** The message shown on the sign-in page after a session ends. */
export function sessionEndMessage(reason: string | null | undefined): string | null {
  switch (reason) {
    case "idle":
      return "You were signed out because you were inactive for a while. Please sign in again.";
    case "absolute":
      return "Your session reached its time limit. Please sign in again.";
    case "revoked":
      return "Your session was ended. Please sign in again.";
    case "everywhere":
      return "You have been signed out on every device.";
    default:
      return null;
  }
}
