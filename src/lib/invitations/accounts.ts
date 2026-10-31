import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import { createAdminClient } from "@/lib/supabase/admin";
import { findAuthUsersByEmail } from "./auth-users";

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
 *   deleteUser(id: string, shouldSoftDelete?: boolean): Promise<UserResponse>
 *
 * Every call here gives up after AUTH_TIMEOUT_MS (the client's fetch has an
 * AbortSignal.timeout), because the /join set-up makes these calls while it
 * holds database locks (review finding M-2).
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

/**
 * Whether the address already had an account, or the invitation brings a
 * new one: made by the server, or `adopted` (an Auth user that already
 * carried the address but was never confirmed or signed in to).
 */
export type InviteeAccount = { kind: "existing" } | { kind: "new"; authId: string; adopted?: true };

/** How long one Auth admin request may take. */
export const AUTH_TIMEOUT_MS = 8_000;

const admin = () => createAdminClient({ timeoutMs: AUTH_TIMEOUT_MS });

/** An admin call's answer, with a thrown error (a timeout, say) turned into an error result. */
async function settle<T extends { error: unknown }>(call: () => Promise<T>): Promise<T | { data: null; error: { code: string; name: string } }> {
  try {
    return await call();
  } catch (err) {
    return { data: null, error: { code: "request_failed", name: err instanceof Error ? err.name : "Error" } };
  }
}

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

  // An account made for an earlier invitation and not yet set up: reuse it.
  const earlier = await db.orm.public.Invitation
    .where((i) => and(i.email.eq(address), i.accountAuthId.isNotNull()))
    .orderBy((i) => i.createdAt.desc())
    .first();
  if (earlier?.accountAuthId) {
    const { data, error } = await settle(() => admin().auth.admin.getUserById(earlier.accountAuthId!));
    if (!error && data?.user && (data.user.email ?? "").toLowerCase() === address) {
      return isUnclaimed(data.user) ? { kind: "new", authId: data.user.id } : { kind: "existing" };
    }
    // Gone (deleted in Auth): make a new one below.
  }

  const { data, error } = await settle(() => admin().auth.admin.createUser({ email: address, email_confirm: false }));
  if (error) {
    if (EXISTS.has(String(error.code))) return adoptOrExisting(address);
    throw new InviteeAccountError(String(error.code ?? error.name ?? "error"));
  }
  if (!data?.user?.id) throw new InviteeAccountError("no_user");
  return { kind: "new", authId: data.user.id };
}

/**
 * The address already has an Auth user but no profile (review finding M1).
 * Open sign-up lets anyone make an unconfirmed Auth user for someone else's
 * address, with a password and user_metadata of their choosing. Treated as
 * "existing", the invitee could never set a password from the link, and
 * would be told to sign in to an account they never made.
 *
 * So an Auth user that was never confirmed (by email or phone) and never
 * signed in to, is not banned, SSO or anonymous, and has no profile, is
 * replaced (review finding M-1): it is deleted and made again exactly as
 * for an address with no account (unconfirmed, no password, no metadata).
 * Deleting rather than overwriting is the safer choice: it removes
 * everything the sign-up set, not only the fields we know to overwrite. The
 * planted password and user_metadata go, and so do the pending sign-up
 * confirmation token (so Supabase's own "confirm your sign-up" email no
 * longer confirms an account with the planted password), any recovery or
 * email-change token, identities and unverified factors. Overwriting the
 * password and nulling the metadata keys would leave the confirmation token
 * and the rest in place.
 *
 * This relies on Supabase's "Confirm email" being ON (checked ON in
 * production on 31 Oct 2026): with it off, a sign-up is confirmed at once,
 * so it is "existing" here and its password works.
 *
 * Confirmed, signed-in, banned, SSO or anonymous users, an address with more
 * than one Auth user, or one with a profile under another address stay
 * "existing". If the address is taken again between the delete and the
 * create (someone signing up in that moment), the answer is "existing".
 */
async function adoptOrExisting(address: string): Promise<InviteeAccount> {
  const found = await findAuthUsersByEmail(address);
  if (found.length !== 1) return { kind: "existing" };
  const [candidate] = found;
  if (!candidate.adoptable) return { kind: "existing" };

  // Checked again through the admin API, with every field isUnclaimed reads.
  const { data, error } = await settle(() => admin().auth.admin.getUserById(candidate.id));
  const user = data?.user;
  if (
    error ||
    !user ||
    (user.email ?? "").toLowerCase() !== address ||
    !isUnclaimed(user) ||
    user.is_sso_user ||
    user.is_anonymous ||
    user.deleted_at ||
    (user.banned_until && !(new Date(user.banned_until).getTime() <= Date.now()))
  ) {
    return { kind: "existing" };
  }
  const profile = await db.orm.public.Profile.where((p) => p.authId.eq(candidate.id)).first();
  if (profile) return { kind: "existing" };

  // Replace it: a hard delete (the address is then free), then a fresh user.
  const removed = await settle(() => admin().auth.admin.deleteUser(candidate.id, false));
  if (removed.error && String(removed.error.code) !== "user_not_found") {
    throw new InviteeAccountError(String(removed.error.code ?? removed.error.name ?? "error"));
  }
  const made = await settle(() => admin().auth.admin.createUser({ email: address, email_confirm: false }));
  if (made.error) {
    if (EXISTS.has(String(made.error.code))) return { kind: "existing" };
    throw new InviteeAccountError(String(made.error.code ?? made.error.name ?? "error"));
  }
  if (!made.data?.user?.id) throw new InviteeAccountError("no_user");
  return { kind: "new", authId: made.data.user.id, adopted: true };
}

/** An account nobody has set up: never confirmed (by email or phone), never signed in. */
export function isUnclaimed(user: {
  email_confirmed_at?: string;
  phone_confirmed_at?: string;
  confirmed_at?: string;
  last_sign_in_at?: string;
}): boolean {
  return !user.email_confirmed_at && !user.phone_confirmed_at && !user.confirmed_at && !user.last_sign_in_at;
}

/**
 * "unknown": Auth could not be asked (a timeout, say), so nothing can be
 * concluded; the caller changes nothing and asks the person to try again.
 */
export type SetupState = "ready" | "already-set-up" | "unavailable" | "unknown";

/**
 * Whether the account made for an invitation can still have its first
 * password set from the link: it must exist, carry the invited address, and
 * never have been confirmed or signed in to.
 */
export async function inviteeSetupState(authId: string, invitedEmail: string): Promise<SetupState> {
  const { data, error } = await settle(() => admin().auth.admin.getUserById(authId));
  if (error) return String(error.code) === "user_not_found" ? "unavailable" : "unknown";
  if (!data?.user) return "unavailable";
  if ((data.user.email ?? "").toLowerCase() !== invitedEmail.trim().toLowerCase()) return "unavailable";
  return isUnclaimed(data.user) ? "ready" : "already-set-up";
}

/**
 * Set the invitee's first password and confirm their address. A first
 * password does not end other sessions (the S5 trigger on auth.users treats
 * an empty previous password as a first password).
 *
 * "failed" is ambiguous: the request may have reached Auth and taken effect
 * before it timed out. The caller reads the account again before saying
 * anything (inviteeSetupState).
 */
export async function setInviteePassword(
  authId: string,
  password: string,
): Promise<{ ok: true } | { ok: false; reason: "weak_password" | "failed" }> {
  const { error } = await settle(() => admin().auth.admin.updateUserById(authId, { password, email_confirm: true }));
  if (!error) return { ok: true };
  return { ok: false, reason: error.code === "weak_password" ? "weak_password" : "failed" };
}
