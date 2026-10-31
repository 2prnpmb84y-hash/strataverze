/**
 * The signed-in person's email address, for matching an invitation
 * (security stage S2a, review finding L7).
 *
 * An invitation is for an address, so the address that counts is the one
 * the Auth server holds for the session's user (from supabase.auth.getUser
 * on the server, as getCurrentSession reads it), not the copy kept in
 * profiles.email. That copy is written when the profile is made and is not
 * kept in step if the Auth address changes later, so it can be stale.
 *
 * If the two differ, nobody can say which address the person really holds
 * now, so the answer is null and the caller refuses with a neutral message.
 * Keeping profiles.email in step with Auth is left to stage S2e.
 */
export function invitationAddressOf(
  session: { user: { email?: string | null }; profile: { email?: string | null } } | null | undefined,
): string | null {
  if (!session) return null;
  const auth = String(session.user?.email ?? "").trim().toLowerCase();
  const stored = String(session.profile?.email ?? "").trim().toLowerCase();
  if (!auth || auth !== stored) return null;
  return auth;
}

/** What to say when the session's Auth address and its profile disagree. */
export const ADDRESS_UNCONFIRMED =
  "This invitation cannot be accepted from this account just now. Sign out, sign in again with the address the invitation was sent to, and try again. If that does not help, contact StrataVerze support.";
