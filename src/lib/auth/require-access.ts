import { notFound } from "next/navigation";
import { rolesFor, type Capability } from "@/config/permissions";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { AuthorisationError, requireSchemeMembership } from "./require-membership";

/**
 * Server action check: the signed-in user holds the capability on this
 * scheme. Throws AuthorisationError otherwise. Returns the profile, the
 * matching membership and every role the user holds on the scheme.
 */
export async function requireSchemeAccess(schemeId: string, capability: Capability) {
  if (!schemeId) throw new AuthorisationError("You do not have permission to perform this action.");
  return requireSchemeMembership(schemeId, rolesFor(capability));
}

/**
 * Page check: as requireSchemeAccess, but 404s instead of throwing, so a page
 * for a scheme the user cannot see looks the same as one that does not exist.
 * Returns null when nobody is signed in (the portal proxy redirects them).
 *
 * Call this in every page that loads scheme data. Do not rely on a layout:
 * layouts can be skipped during client navigation.
 */
export async function requirePageAccess(schemeId: string, capability: Capability) {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  try {
    return await requireSchemeAccess(schemeId, capability);
  } catch (err) {
    if (err instanceof AuthorisationError) notFound();
    throw err;
  }
}

/** Page check for platform-admin-only pages: 404 for everyone else. */
export async function requirePlatformAdminPage() {
  const profile = await getCurrentProfile();
  if (!profile?.isPlatformAdmin) notFound();
  return profile;
}
