import { requireAuth, requirePlatformAdmin, requireSchemeMembership } from "./require-membership";
import { requireSchemeAccess } from "./require-access";
import type { Capability } from "@/config/permissions";

/**
 * The building record lock (decided 24 Oct 2026).
 *
 * Only StrataVerze administrators create a building and enter its unit
 * entitlements and strata roll. Once created, the building's core record is
 * locked:
 *   - plan number, address, total lots and total unit entitlement: admins only;
 *   - adding, removing or renumbering lots, and any lot's unit entitlement:
 *     admins only;
 *   - deleting the building: admins only, with a recent authenticator check.
 * The Adviser may still change the display name, ABN and financial year end,
 * and the Adviser and committee keep the strata roll's owner details up to
 * date (change of owner, contact details).
 */

export const LOCKED_SCHEME_FIELDS = ["planNumber", "address", "suburb", "state", "postcode", "totalLots", "totalEntitlement"] as const;
// A Queensland lot's interest schedule lot entitlement is locked as its unit
// (contribution schedule) entitlement is (stage 2, step 10), and so is a
// Victorian lot's lot entitlement (stage 2, PR 4). An NSW lot form sends
// neither, so nothing changes for NSW.
export const LOCKED_LOT_FIELDS = ["lotNumber", "entitlement", "interestScheduleEntitlement", "lotEntitlement"] as const;

export const LOCKED_MESSAGE = "This is part of the locked building record. Only StrataVerze can change it.";

/** The locked fields whose value would change. */
export function changedLockedFields<T extends string>(
  fields: readonly T[],
  current: Partial<Record<T, unknown>>,
  next: Partial<Record<T, unknown>>,
): T[] {
  const norm = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim().toLowerCase());
  return fields.filter((f) => next[f] !== undefined && norm(current[f]) !== norm(next[f]));
}

/**
 * A capability on the building, or a StrataVerze administrator (who may not
 * hold a role on it). Returns the profile and whether they are an admin.
 */
export async function requireSchemeAccessOrAdmin(schemeId: string, capability: Capability) {
  const profile = await requireAuth();
  if (profile.isPlatformAdmin) {
    await requirePlatformAdmin();
    return { profile, isAdmin: true as const };
  }
  const access = await requireSchemeAccess(schemeId, capability);
  return { profile: access.profile, isAdmin: false as const };
}

/** As requireSchemeAccessOrAdmin, for a list of roles. */
export async function requireRolesOrAdmin(schemeId: string, roles: Parameters<typeof requireSchemeMembership>[1]) {
  const profile = await requireAuth();
  if (profile.isPlatformAdmin) {
    await requirePlatformAdmin();
    return { profile, isAdmin: true as const };
  }
  const access = await requireSchemeMembership(schemeId, roles);
  return { profile: access.profile, isAdmin: false as const };
}
