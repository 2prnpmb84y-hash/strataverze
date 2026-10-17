import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import { getCurrentProfile } from "@/lib/queries/profiles";

export type PortalRole = "OWNER" | "COMMITTEE" | "ADVISER" | "SUPPLIER";

/**
 * Verify the current user is authenticated and has an active membership
 * on the given scheme with at least one of the allowed roles.
 *
 * Returns the profile on success; throws an AuthorisationError on failure.
 */
export async function requireSchemeMembership(
  schemeId: string,
  allowedRoles: PortalRole[],
) {
  const profile = await getCurrentProfile();
  if (!profile) {
    throw new AuthorisationError("You must be signed in.");
  }

  const membership = await db.orm.public.SchemeMembership
    .where((m) =>
      and(
        m.schemeId.eq(schemeId),
        m.profileId.eq(profile.id),
        m.isActive.eq(true),
      ),
    )
    .first();

  if (!membership || !allowedRoles.includes(membership.role as PortalRole)) {
    throw new AuthorisationError(
      "You do not have permission to perform this action.",
    );
  }

  return { profile, membership };
}

/**
 * Verify the current user is authenticated. Returns the profile.
 */
export async function requireAuth() {
  const profile = await getCurrentProfile();
  if (!profile) {
    throw new AuthorisationError("You must be signed in.");
  }
  return profile;
}

/**
 * Custom error class so callers can distinguish auth failures from
 * unexpected errors without inspecting message strings.
 */
export class AuthorisationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorisationError";
  }
}
