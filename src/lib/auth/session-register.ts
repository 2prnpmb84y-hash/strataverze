import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";
import { db } from "@/prisma/db";
import { sessionVerdict, toMs, type SessionVerdict } from "./session-policy";
import { recordSecurityEvent } from "@/lib/audit/security-audit";

/**
 * The session register (security stage S5). Every request that loads the
 * signed-in user checks its session here: getCurrentSession for pages,
 * server actions and route handlers, and the proxy for page navigations
 * (where the cookies can also be cleared).
 *
 * Ending a session sets revoked_at. A database trigger then deletes the
 * session from auth.sessions, so it cannot be refreshed either.
 * See prisma/migrations/20261023_session_register.sql.
 */

function ts(ms: number): TimestampString<3> {
  return new Date(ms).toISOString() as unknown as TimestampString<3>;
}

/**
 * Check, and record, one request on a session. Creates the register row the
 * first time a session is seen. Ends the session when it has timed out.
 */
export async function checkAndTouchSession(input: {
  sessionId: string;
  profileId: string;
  /** When the user signed in, from the amr claims. */
  authenticatedAtMs: number;
  /** The profile's sessions_revoked_at. */
  revokedBefore: string | Date | null | undefined;
  privileged: boolean;
  nowMs?: number;
}): Promise<SessionVerdict> {
  const nowMs = input.nowMs ?? Date.now();
  let row = await db.orm.public.AppSession.where((s) => s.id.eq(input.sessionId)).first();

  // A session id belongs to one user. Never let another profile's session
  // row be reused (it would mean a forged or confused token).
  if (row && row.profileId !== input.profileId) return { ok: false, reason: "revoked" };

  if (!row) {
    try {
      row = await db.orm.public.AppSession.create({
        id: input.sessionId,
        profileId: input.profileId,
        authenticatedAt: ts(input.authenticatedAtMs),
        firstSeenAt: ts(nowMs),
        lastSeenAt: ts(nowMs),
      });
    } catch (err) {
      // Two first requests at once: the other one created it.
      row = await db.orm.public.AppSession.where((s) => s.id.eq(input.sessionId)).first();
      if (!row) throw err;
      if (row.profileId !== input.profileId) return { ok: false, reason: "revoked" };
    }
  }

  const verdict = sessionVerdict({
    nowMs,
    privileged: input.privileged,
    // The register keeps the first sign-in time it saw, so a later token
    // cannot push the absolute limit back.
    authenticatedAtMs: Math.min(toMs(row.authenticatedAt) ?? input.authenticatedAtMs, input.authenticatedAtMs),
    lastSeenAtMs: toMs(row.lastSeenAt) ?? nowMs,
    revokedAtMs: toMs(row.revokedAt),
    revokedBeforeMs: toMs(input.revokedBefore ?? null),
  });

  if (!verdict.ok) {
    if (!row.revokedAt) {
      await endSession(input.sessionId, verdict.reason, nowMs);
      await recordSecurityEvent({
        action: "session.ended",
        outcome: "allowed",
        actorProfileId: input.profileId,
        resourceType: "session",
        resourceId: input.sessionId,
        reason: verdict.reason === "idle" ? "idle timeout" : verdict.reason === "absolute" ? "absolute timeout" : "revoked",
        metadata: { privileged: input.privileged },
      });
    }
    return verdict;
  }
  if (verdict.touch) {
    await db.orm.public.AppSession
      .where((s) => and(s.id.eq(input.sessionId), s.profileId.eq(input.profileId)))
      .update({ lastSeenAt: ts(nowMs) });
  }
  return verdict;
}

/** End one session (it stops working in the app and in Supabase Auth). */
export async function endSession(sessionId: string, reason: string, nowMs: number = Date.now()): Promise<void> {
  await db.orm.public.AppSession
    .where((s) => s.id.eq(sessionId))
    .update({ revokedAt: ts(nowMs), revokedReason: reason });
}

/**
 * End every session of a profile ("sign out everywhere"). Used by the user
 * themselves, by a platform admin, after an MFA reset, and when a role is
 * removed. A database trigger ends the matching Supabase Auth sessions.
 */
export async function revokeAllSessions(
  profileId: string,
  options: { actorProfileId?: string | null; reason: string; nowMs?: number },
): Promise<void> {
  const nowMs = options.nowMs ?? Date.now();
  await db.orm.public.Profile.where((p) => p.id.eq(profileId)).update({ sessionsRevokedAt: ts(nowMs) });
  await recordSecurityEvent({
    action: "session.revoked_all",
    outcome: "allowed",
    actorProfileId: options.actorProfileId ?? profileId,
    resourceType: "profile",
    resourceId: profileId,
    reason: options.reason,
  });
}
