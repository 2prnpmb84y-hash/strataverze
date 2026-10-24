"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AuthorisationError, requireAuth, requirePlatformAdmin } from "@/lib/auth/require-membership";
import { requireRecentMfa } from "@/lib/auth/mfa-enforcement";
import { revokeAllSessions } from "@/lib/auth/session-register";
import { getProfileById } from "@/lib/queries/profiles";

/**
 * "Sign out everywhere" (security stage S5).
 *
 * Ends every session of the account, on every device, including this one.
 * A database trigger deletes them from Supabase Auth, so none can be
 * refreshed, and the app refuses them straight away.
 */

/** The signed-in user signs out on every device. */
export async function signOutEverywhereAction(): Promise<{ error?: string }> {
  try {
    const profile = await requireAuth();
    await revokeAllSessions(profile.id);
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

    await revokeAllSessions(target.id);
    // Recorded in the server log until the security audit log (stage S6)
    // exists, which will also keep the reason.
    console.info(`[sessions] admin sign-out by=${admin.id} target=${target.id}`);
    revalidatePath("/admin/security");
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    throw err;
  }
}
