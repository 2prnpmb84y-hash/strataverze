import { db } from "@/prisma/db";

/**
 * Supabase Auth users by email address, read-only, for invitations (S2a).
 *
 * The Auth admin API has no lookup by address (only getUserById and a paged
 * listUsers), so this reads auth.users directly. The app connects as the
 * database owner, which can read the auth schema. Nothing here writes to it.
 *
 * Only what the invitation code needs is selected: the id, and whether the
 * account was ever confirmed (by email or phone) or signed in to, and
 * whether it is banned now. SSO, anonymous and soft-deleted users are left
 * out. The caller checks the account again through the admin API before
 * relying on it.
 *
 * Columns read, all in Supabase Auth's auth.users (and in the installed
 * @supabase/auth-js User type): id, email, email_confirmed_at,
 * phone_confirmed_at, confirmed_at, last_sign_in_at, banned_until,
 * is_sso_user, is_anonymous, deleted_at, created_at. The rolled-back
 * rehearsal of migration 20261129 checks they exist.
 */

export type AuthUserByEmail = {
  id: string;
  confirmed: boolean;
  signedIn: boolean;
  banned: boolean;
  /** Never confirmed, never signed in, not banned: an invitation may replace it (accounts.ts). */
  adoptable: boolean;
};

/**
 * Every Auth user carrying this address (lower-cased match), at most two:
 * more than one means the caller must not pick between them.
 */
export async function findAuthUsersByEmail(email: string): Promise<AuthUserByEmail[]> {
  const address = email.trim().toLowerCase();
  if (!address) return [];
  const plan = db.raw.sql`
    SELECT id::text AS id,
           (email_confirmed_at IS NOT NULL OR confirmed_at IS NOT NULL OR phone_confirmed_at IS NOT NULL) AS confirmed,
           (last_sign_in_at IS NOT NULL) AS signed_in,
           (banned_until IS NOT NULL AND banned_until > now()) AS banned
      FROM auth.users
     WHERE lower(email::text) = ${address}
       AND NOT is_sso_user
       AND NOT coalesce(is_anonymous, false)
       AND deleted_at IS NULL
     ORDER BY created_at
     LIMIT 2`
    .returnsRow({ id: "pg/text@1", confirmed: "pg/bool@1", signed_in: "pg/bool@1", banned: "pg/bool@1" })
    .build();
  const rows = await db.query(plan);
  return rows.map((r) => {
    const confirmed = r.confirmed === true;
    const signedIn = r.signed_in === true;
    // Fails closed: anything but an explicit false counts as banned.
    const banned = r.banned !== false;
    return { id: String(r.id), confirmed, signedIn, banned, adoptable: !confirmed && !signedIn && !banned };
  });
}
