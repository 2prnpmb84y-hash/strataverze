import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSelectedSchemeId } from "@/lib/actions/scheme-selection";
import type { PortalRole } from "@/lib/auth/require-membership";

/**
 * The owner portal's selected scheme, verified (security findings F1, SEC-023).
 *
 * The `sv_selected_scheme` cookie is only a preference: anyone can set it to
 * any scheme id. Every owner page reads the selection through these helpers,
 * which return it only when the signed-in user holds an active membership
 * with an owner-portal role on that scheme, together with the roles they hold
 * there. Never authorise scheme-specific data with the raw cookie or with
 * "is a committee member somewhere" (hasCommitteeRole).
 */

/** Roles that use the owner portal for a scheme by default. */
export const OWNER_PORTAL_ROLES: readonly PortalRole[] = ["OWNER", "COMMITTEE"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MembershipForSelection = {
  schemeId: string;
  role: string;
  isActive: boolean;
};

export type ResolvedScheme = { schemeId: string; roles: PortalRole[] };

/**
 * The selected scheme and the caller's roles on it, or null when nothing is
 * selected, the id is malformed, or none of the caller's ACTIVE memberships on
 * that scheme has one of the allowed roles. Pure.
 */
export function resolveSelectedScheme(
  selectedSchemeId: string | null | undefined,
  memberships: readonly MembershipForSelection[],
  allowedRoles: readonly PortalRole[] = OWNER_PORTAL_ROLES,
): ResolvedScheme | null {
  if (!selectedSchemeId || !UUID.test(selectedSchemeId)) return null;
  const onScheme = memberships.filter((m) => m.isActive && m.schemeId === selectedSchemeId);
  if (!onScheme.some((m) => (allowedRoles as readonly string[]).includes(m.role))) return null;
  return {
    schemeId: selectedSchemeId,
    roles: [...new Set(onScheme.map((m) => m.role as PortalRole))],
  };
}

/**
 * The verified selected scheme for the signed-in user: { profile, schemeId,
 * roles, memberships } or null. `roles` lists every active role the user
 * holds on that scheme (so `roles.includes("COMMITTEE")` means committee of
 * THIS scheme); `memberships` are their active memberships on it (lotId on
 * the OWNER one).
 */
export async function getSelectedOwnerScheme(
  allowedRoles: readonly PortalRole[] = OWNER_PORTAL_ROLES,
) {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const selected = await getSelectedSchemeId();
  if (!selected || !UUID.test(selected)) return null;

  const memberships = await db.orm.public.SchemeMembership
    .where((m) =>
      and(m.schemeId.eq(selected), m.profileId.eq(profile.id), m.isActive.eq(true)),
    )
    .limit(20)
    .all();

  const resolved = resolveSelectedScheme(selected, memberships, allowedRoles);
  if (!resolved) return null;
  return { profile, schemeId: resolved.schemeId, roles: resolved.roles, memberships };
}

/**
 * The selected scheme id when it is verified, else null. For list pages that
 * show "the selected scheme, or every scheme of mine when none is selected":
 * they intersect this with the user's own schemes.
 */
export async function getVerifiedSelectedSchemeId(
  allowedRoles: readonly PortalRole[] = OWNER_PORTAL_ROLES,
): Promise<string | null> {
  return (await getSelectedOwnerScheme(allowedRoles))?.schemeId ?? null;
}
