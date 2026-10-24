import { cache } from "react";
import { redirect } from "next/navigation";
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import { getCurrentSession } from "./current-session";
import { AuthorisationError } from "./errors";
import { mfaGate, mfaMandatory, recentlyVerified } from "./mfa-policy";

type CurrentSession = NonNullable<Awaited<ReturnType<typeof getCurrentSession>>>;

/**
 * MFA status for a session already loaded. Memoised per request for the
 * same session object, so the membership lookup runs once.
 */
export const mfaStatusFor = cache(async (session: CurrentSession) => {
  let mandatory = !!session.profile.isPlatformAdmin;
  if (!mandatory) {
    const memberships = await db.orm.public.SchemeMembership
      .where((m) => and(m.profileId.eq(session.profile.id), m.isActive.eq(true)))
      .limit(200)
      .all();
    mandatory = mfaMandatory(false, memberships);
  }
  const gate = mfaGate({
    mandatory,
    verifiedFactorCount: session.verifiedFactors.length,
    aal: session.assurance.aal,
  });
  return { ...session, mandatory, gate };
});

/**
 * MFA status of the signed-in user for this request, or null when signed out.
 */
export const getMfaStatus = cache(async () => {
  const session = await getCurrentSession();
  if (!session) return null;
  return mfaStatusFor(session);
});

/**
 * Send the user to enrol or verify when this session does not meet the MFA
 * policy. getCurrentProfile calls it with the session it is about to return,
 * so the check is always made on that same session and cannot pass because a
 * second lookup came back empty (security review of S4).
 */
export async function enforceMfaFor(session: CurrentSession): Promise<void> {
  const status = await mfaStatusFor(session);
  if (status.gate === "ok") return;
  redirect(status.gate === "enrol" ? "/mfa/setup" : "/mfa");
}

/** enforceMfaFor for the current session. Nothing to enforce when signed out. */
export async function enforceMfa(): Promise<void> {
  const session = await getCurrentSession();
  if (!session) return;
  await enforceMfaFor(session);
}

/** Thrown when a sensitive operation needs a fresh authenticator check. */
export class StepUpRequiredError extends AuthorisationError {
  constructor() {
    super(
      "For your security, confirm it is you first. Open Security in your settings (or go to /mfa), enter a code from your authenticator app, then try again.",
    );
    this.name = "StepUpRequiredError";
  }
}

/**
 * Require an authenticator check within the last 15 minutes. Used by the
 * sensitive operations listed in the security plan: payments and payment
 * approvals, bank details, memberships and roles, MFA changes, period
 * reopening, data migration cut-over, scheme deletion and exports.
 *
 * A user with no authenticator for whom MFA is not mandatory passes (they
 * hold none of the roles these operations need).
 */
export async function requireRecentMfa(): Promise<void> {
  const status = await getMfaStatus();
  if (!status) throw new AuthorisationError("You must be signed in.");
  if (status.verifiedFactors.length === 0 && !status.mandatory) return;
  if (!recentlyVerified(status.assurance)) throw new StepUpRequiredError();
}
