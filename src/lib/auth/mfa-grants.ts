import { db } from "@/prisma/db";

/**
 * One-time permissions for authenticator changes (security stage S4).
 *
 * A database trigger on auth.mfa_factors refuses to add a second
 * authenticator, or remove a verified one, unless the app has written a
 * matching grant in the last 10 minutes. Write a grant only AFTER the app's
 * own checks have passed (a recent authenticator check, or a platform
 * admin's identity check for a reset), immediately before calling Supabase.
 * See prisma/migrations/20261023_mfa_factor_guard.sql.
 */

/** Allow the user to add another authenticator. */
export async function grantFactorEnrolment(authUserId: string, grantedBy: string): Promise<void> {
  await db.orm.public.MfaFactorGrant.create({ authUserId, action: "enrol", factorId: null, grantedBy });
}

/** Allow one verified authenticator to be removed. */
export async function grantFactorRemoval(authUserId: string, factorId: string, grantedBy: string): Promise<void> {
  await db.orm.public.MfaFactorGrant.create({ authUserId, action: "remove", factorId, grantedBy });
}
