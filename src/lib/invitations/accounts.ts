import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Accounts for invited people (security stage S2a), with the Supabase Auth
 * admin API (service role). Callers authorise first: issuing an invitation
 * needs an authorised inviter, and setting a password needs a valid,
 * unused invitation link for this account.
 *
 * Methods used, as typed in the installed @supabase/auth-js
 * (dist/module/GoTrueAdminApi.d.ts):
 *   createUser(attributes: AdminUserAttributes): Promise<UserResponse>
 *   getUserById(uid: string): Promise<UserResponse>
 *   updateUserById(uid: string, attributes: AdminUserAttributes): Promise<UserResponse>
 *
 * An account created here is unconfirmed and has no password, so nobody can
 * sign in to it with a password until the invitee sets one from the link
 * (which also confirms the address: holding the emailed link shows they
 * control it). createUser sends no email of its own.
 */

export class InviteeAccountError extends Error {
  constructor(readonly code: string) {
    super("The invitee's account could not be prepared.");
    this.name = "InviteeAccountError";
  }
}

/** Whether the address already had an account, or the server made one for this invitation. */
export type InviteeAccount = { kind: "existing" } | { kind: "new"; authId: string };

/** Auth's answer when an account with the address already exists. */
const EXISTS = new Set(["email_exists", "user_already_exists"]);

/**
 * The invitee's account, creating it if the address has none. Never says
 * more than "existing" or "new" to the caller, which must not pass the
 * difference on to the inviter (account enumeration).
 */
export async function provisionInviteeAccount(email: string): Promise<InviteeAccount> {
  const address = email.trim().toLowerCase();

  // Someone who has signed in has a profile.
  const profile = await db.orm.public.Profile.where((p) => p.email.eq(address)).first();
  if (profile) return { kind: "existing" };

  const admin = createAdminClient();

  // An account made for an earlier invitation and not yet set up: reuse it.
  const earlier = await db.orm.public.Invitation
    .where((i) => and(i.email.eq(address), i.accountAuthId.isNotNull()))
    .orderBy((i) => i.createdAt.desc())
    .first();
  if (earlier?.accountAuthId) {
    const { data, error } = await admin.auth.admin.getUserById(earlier.accountAuthId);
    if (!error && data?.user && (data.user.email ?? "").toLowerCase() === address) {
      return isUnclaimed(data.user) ? { kind: "new", authId: data.user.id } : { kind: "existing" };
    }
    // Gone (deleted in Auth): make a new one below.
  }

  const { data, error } = await admin.auth.admin.createUser({ email: address, email_confirm: false });
  if (error) {
    if (EXISTS.has(String(error.code))) return { kind: "existing" };
    throw new InviteeAccountError(String(error.code ?? error.name ?? "error"));
  }
  if (!data?.user?.id) throw new InviteeAccountError("no_user");
  return { kind: "new", authId: data.user.id };
}

/** An account nobody has set up: never confirmed, never signed in. */
function isUnclaimed(user: { email_confirmed_at?: string; confirmed_at?: string; last_sign_in_at?: string }): boolean {
  return !user.email_confirmed_at && !user.confirmed_at && !user.last_sign_in_at;
}

export type SetupState = "ready" | "already-set-up" | "unavailable";

/**
 * Whether the account made for an invitation can still have its first
 * password set from the link: it must exist, carry the invited address, and
 * never have been confirmed or signed in to.
 */
export async function inviteeSetupState(authId: string, invitedEmail: string): Promise<SetupState> {
  const { data, error } = await createAdminClient().auth.admin.getUserById(authId);
  if (error || !data?.user) return "unavailable";
  if ((data.user.email ?? "").toLowerCase() !== invitedEmail.trim().toLowerCase()) return "unavailable";
  return isUnclaimed(data.user) ? "ready" : "already-set-up";
}

/**
 * Set the invitee's first password and confirm their address. A first
 * password does not end other sessions (the S5 trigger on auth.users treats
 * an empty previous password as a first password).
 */
export async function setInviteePassword(
  authId: string,
  password: string,
): Promise<{ ok: true } | { ok: false; reason: "weak_password" | "failed" }> {
  const { error } = await createAdminClient().auth.admin.updateUserById(authId, { password, email_confirm: true });
  if (!error) return { ok: true };
  return { ok: false, reason: error.code === "weak_password" ? "weak_password" : "failed" };
}
