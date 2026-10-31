import { db } from "@/prisma/db";

/**
 * Supabase Auth users by email address, read-only, for invitations (S2a).
 *
 * The Auth admin API has no lookup by address (only getUserById and a paged
 * listUsers), so this reads auth.users directly. The app connects as the
 * database owner, which can read the auth schema. Nothing here writes to it.
 *
 * Only what the invitation code needs is selected: the id, and whether the
 * account was ever confirmed or signed in to. The caller checks the account
 * again through the admin API before relying on it.
 */

export type AuthUserByEmail = { id: string; confirmed: boolean; signedIn: boolean };

/**
 * Every Auth user carrying this address (lower-cased match), at most two:
 * more than one means the caller must not pick between them.
 */
export async function findAuthUsersByEmail(email: string): Promise<AuthUserByEmail[]> {
  const address = email.trim().toLowerCase();
  if (!address) return [];
  const plan = db.raw.sql`
    SELECT id::text AS id,
           (email_confirmed_at IS NOT NULL) AS confirmed,
           (last_sign_in_at IS NOT NULL) AS signed_in
      FROM auth.users
     WHERE lower(email::text) = ${address}
     ORDER BY created_at
     LIMIT 2`
    .returnsRow({ id: "pg/text@1", confirmed: "pg/bool@1", signed_in: "pg/bool@1" })
    .build();
  const rows = await db.query(plan);
  return rows.map((r) => ({ id: String(r.id), confirmed: r.confirmed === true, signedIn: r.signed_in === true }));
}
