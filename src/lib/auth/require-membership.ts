import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import { getCurrentProfile } from "@/lib/queries/profiles";

export type PortalRole = "OWNER" | "COMMITTEE" | "ADVISER" | "SUPPLIER" | "ACCOUNTANT" | "PAYMENT_AUTHORISER";

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

  // A person can hold several roles on one scheme (owner and committee, say),
  // so look for any active membership with an allowed role.
  const memberships = await db.orm.public.SchemeMembership
    .where((m) =>
      and(
        m.schemeId.eq(schemeId),
        m.profileId.eq(profile.id),
        m.isActive.eq(true),
      ),
    )
    .limit(20)
    .all();
  const membership = memberships.find((m) => allowedRoles.includes(m.role as PortalRole));

  if (!membership) {
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
 * Verify the current user is a StrataVerze platform admin (staff). Used for
 * platform-wide work such as reviewing contractor applications.
 */
export async function requirePlatformAdmin() {
  const profile = await requireAuth();
  if (!profile.isPlatformAdmin) {
    throw new AuthorisationError("Only StrataVerze staff can do this.");
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
