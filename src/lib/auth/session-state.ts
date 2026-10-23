import type { User } from "@supabase/supabase-js";
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import { assuranceFromClaims, decodeJwtPayload, mfaMandatory } from "./mfa-policy";
import { authenticatedAtFromClaims, type SessionEndReason } from "./session-policy";
import { checkAndTouchSession } from "./session-register";

/**
 * Everything the app needs to know about the signed-in user for one request,
 * and whether their session may continue (security stages S4 and S5).
 * Shared by getCurrentSession (pages, actions, route handlers) and the proxy
 * (page navigations), so both apply exactly the same rules.
 *
 * `user` must come from supabase.auth.getUser(), which validates the session
 * with the Auth server, and `accessToken` from the same client's session.
 */
export async function loadSessionState(
  user: User,
  accessToken: string | null | undefined,
  options: { createProfile: boolean },
) {
  // getUser has just validated this session's access token with the Auth
  // server, so its claims can be read without verifying it again. They are
  // used only when they belong to the same user.
  const decoded = decodeJwtPayload(accessToken);
  const claims = decoded && decoded.sub === user.id ? decoded : null;
  const assurance = assuranceFromClaims(claims);
  const verifiedFactors = (user.factors ?? []).filter(
    (f) => f.status === "verified" && f.factor_type === "totp",
  );

  let profile = await db.orm.public.Profile.where((p) => p.authId.eq(user.id)).first();
  if (!profile) {
    if (!options.createProfile) return { kind: "no-profile" as const };
    // First sign-in.
    profile = await db.orm.public.Profile.create({
      authId: user.id,
      email: user.email ?? "",
      firstName: "",
      lastName: "",
    });
  }

  let mandatory = !!profile.isPlatformAdmin;
  if (!mandatory) {
    const memberships = await db.orm.public.SchemeMembership
      .where((m) => and(m.profileId.eq(profile.id), m.isActive.eq(true)))
      .limit(200)
      .all();
    mandatory = mfaMandatory(false, memberships);
  }

  // Without a session id and a sign-in time the session cannot be checked
  // against its limits, so it is not accepted (fail closed).
  const authenticatedAtMs = authenticatedAtFromClaims(claims);
  if (!assurance.sessionId || authenticatedAtMs == null) {
    return { kind: "ended" as const, reason: "revoked" as SessionEndReason };
  }

  const verdict = await checkAndTouchSession({
    sessionId: assurance.sessionId,
    profileId: profile.id,
    authenticatedAtMs,
    revokedBefore: profile.sessionsRevokedAt,
    // The people MFA is mandatory for get the shorter limits.
    privileged: mandatory,
  });
  if (!verdict.ok) return { kind: "ended" as const, reason: verdict.reason };

  return {
    kind: "active" as const,
    session: { user, profile, assurance, verifiedFactors, mfaMandatory: mandatory },
  };
}
