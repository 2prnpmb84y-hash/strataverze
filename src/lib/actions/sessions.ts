"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AuthorisationError, requireAuth, requirePlatformAdmin } from "@/lib/auth/require-membership";
import { requireRecentMfa } from "@/lib/auth/mfa-enforcement";
import { endSession, revokeAllSessions } from "@/lib/auth/session-register";
import { getProfileById } from "@/lib/queries/profiles";
import { recordSecurityEvent } from "@/lib/audit/security-audit";
import { createClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/current-session";

/**
 * "Sign out everywhere" (security stage S5).
 *
 * Ends every session of the account, on every device, including this one.
 * A database trigger deletes them from Supabase Auth, so none can be
 * refreshed, and the app refuses them straight away.
 */

/**
 * Sign out (this device), recorded in the security audit log. Ends the
 * session in the app's register and in Supabase Auth.
 */
export async function signOutAction(): Promise<void> {
  const session = await getCurrentSession();
  if (session) {
    if (session.assurance.sessionId) await endSession(session.assurance.sessionId, "signed_out");
    await recordSecurityEvent({
      action: "auth.sign_out",
      outcome: "allowed",
      actorProfileId: session.profile.id,
      actorAuthId: session.user.id,
      resourceType: "session",
      resourceId: session.assurance.sessionId,
    });
  }
  const supabase = await createClient();
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Already gone.
  }
  redirect("/login");
}

/** The signed-in user signs out on every device. */
export async function signOutEverywhereAction(): Promise<{ error?: string }> {
  try {
    const profile = await requireAuth();
    await revokeAllSessions(profile.id, { actorProfileId: profile.id, reason: "signed out everywhere" });
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    throw err;
  }
  redirect("/login?reason=everywhere");
}

/**
 * A platform admin ends every session of another user, for example when a
 * device is lost or an account may be compromised. Needs a recent
 * authenticator check and a recorded reason.
 */
export async function adminSignOutUserAction(profileId: string, reason: string): Promise<{ error?: string }> {
  try {
    const admin = await requirePlatformAdmin();
    await requireRecentMfa();
    const why = (reason ?? "").trim();
    if (why.length < 10) return { error: "Record why (at least 10 characters)." };
    if (why.length > 1000) return { error: "Keep the reason under 1,000 characters." };
    if (profileId === admin.id) return { error: "Use Sign out everywhere in your own settings." };
    const target = await getProfileById(profileId);
    if (!target) return { error: "User not found." };

    // The admin's reason is kept in the security audit log (restricted to
    // platform admins), not in the server log.
    await revokeAllSessions(target.id, { actorProfileId: admin.id, reason: `admin sign-out: ${why}` });
    revalidatePath("/admin/security");
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    throw err;
  }
}
