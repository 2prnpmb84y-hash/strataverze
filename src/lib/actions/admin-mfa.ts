"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin, AuthorisationError } from "@/lib/auth/require-membership";
import { requireRecentMfa } from "@/lib/auth/mfa-enforcement";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfileById } from "@/lib/queries/profiles";

/**
 * Administrator-assisted authenticator reset (security stage S4), for a user
 * who has lost every authenticator.
 *
 * Process (see the security runbook): the administrator verifies the person's
 * identity out of band first, by calling them back on the phone number held
 * on record and confirming by email. They then reset here, giving the reason.
 * Deleting a verified factor also signs the user out of every session
 * (Supabase Auth admin API). They set up a new authenticator at their next
 * sign-in.
 *
 * Needs a platform admin with a fresh authenticator check, and an admin
 * cannot reset their own (another admin must).
 */
export async function resetUserMfaAction(
  profileId: string,
  reason: string,
): Promise<{ error?: string; removed?: number }> {
  try {
    const admin = await requirePlatformAdmin();
    await requireRecentMfa();
    const why = (reason ?? "").trim();
    if (why.length < 10) return { error: "Record how you verified the person's identity (at least 10 characters)." };
    if (why.length > 1000) return { error: "Keep the reason under 1,000 characters." };
    if (profileId === admin.id) return { error: "Another administrator must reset your authenticator." };

    const target = await getProfileById(profileId);
    if (!target) return { error: "User not found." };

    const supabase = createAdminClient();
    const { data, error } = await supabase.auth.admin.mfa.listFactors({ userId: target.authId });
    if (error) {
      console.error("[admin-mfa] listFactors failed:", error.code ?? error.name);
      return { error: "Could not read that user's authenticators." };
    }
    let removed = 0;
    for (const factor of data?.factors ?? []) {
      const { error: delError } = await supabase.auth.admin.mfa.deleteFactor({ id: factor.id, userId: target.authId });
      if (delError) {
        console.error("[admin-mfa] deleteFactor failed:", delError.code ?? delError.name);
        return { error: "Could not remove every authenticator. Try again.", removed };
      }
      removed += 1;
    }

    // Recorded in the server log until the security audit log (stage S6)
    // exists. No secrets or codes are logged.
    console.info(
      `[admin-mfa] reset by=${admin.id} target=${target.id} removed=${removed} reason=${JSON.stringify(why.slice(0, 200))}`,
    );
    revalidatePath("/admin/security");
    return { removed };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    throw err;
  }
}
