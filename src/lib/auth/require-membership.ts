import { db } from "@/prisma/db";
import { AuthorisationError } from "./errors";
import { and } from "@prisma/orm-postgres/orm-client";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { recordActionInvocation, recordSecurityEventLater } from "@/lib/audit/security-audit";

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
    // Every refusal is a security event (S6).
    await recordSecurityEventLater({
      action: "access.denied",
      outcome: "denied",
      actorProfileId: profile.id,
      actorRole: memberships.map((m) => m.role).join(",") || "none",
      schemeId,
      resourceType: "scheme",
      resourceId: schemeId,
      reason: "role not held on this scheme",
      metadata: { required: allowedRoles.join(",") },
    });
    throw new AuthorisationError(
      "You do not have permission to perform this action.",
    );
  }

  // Every active role this person holds on this scheme (they can hold several).
  const roles = memberships.map((m) => m.role as PortalRole);
  // A server action on this scheme is recorded in the security audit log (S6).
  await recordActionInvocation({ actorProfileId: profile.id, actorRole: [...new Set(roles)].join(","), schemeId });

  return { profile, membership, roles };
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
    await recordSecurityEventLater({
      action: "access.denied",
      outcome: "denied",
      actorProfileId: profile.id,
      reason: "platform admin only",
    });
    throw new AuthorisationError("Only StrataVerze staff can do this.");
  }
  await recordActionInvocation({ actorProfileId: profile.id, actorRole: "platform_admin" });
  return profile;
}

export { AuthorisationError };
