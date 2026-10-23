import { db } from "@/prisma/db";
import { and, or } from "@prisma/orm-postgres/orm-client";
import { createClient } from "@/lib/supabase/server";

/**
 * Get the currently authenticated user's profile.
 * Creates a profile record if one doesn't exist yet (first login).
 */
export async function getCurrentProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Try to find existing profile
  const existing = await db.orm.public.Profile
    .where((p) => p.authId.eq(user.id))
    .first();

  if (existing) return existing;

  // Auto-create on first login
  const profile = await db.orm.public.Profile.create({
    authId: user.id,
    email: user.email ?? "",
    firstName: "",
    lastName: "",
  });

  return profile;
}

/**
 * Get a profile by its primary key.
 */
export async function getProfileById(profileId: string) {
  return db.orm.public.Profile.first({ id: profileId });
}

/**
 * Escape LIKE/ILIKE pattern metacharacters so user input is treated
 * as a literal string rather than a pattern.
 */
function escapeLikePattern(raw: string): string {
  return raw.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

/**
 * Search profiles by email or name (for owner assignment).
 * Excludes profiles already assigned as OWNER on the given scheme.
 */
export async function searchProfiles(query: string, schemeId: string) {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length < 2) return [];

  const safe = escapeLikePattern(trimmed);

  // Fetch all profiles matching the search term
  const profiles = await db.orm.public.Profile
    .where((p) =>
      or(
        p.email.ilike(`%${safe}%`),
        p.firstName.ilike(`%${safe}%`),
        p.lastName.ilike(`%${safe}%`),
      ),
    )
    .limit(10)
    .all();

  // Fetch existing active owner memberships for this scheme
  const existingOwners = await db.orm.public.SchemeMembership
    .where((m) =>
      and(
        m.schemeId.eq(schemeId),
        m.role.eq("OWNER"),
        m.isActive.eq(true),
      ),
    )
    .all();

  const ownerProfileIds = new Set(existingOwners.map((m) => m.profileId));

  // Filter out profiles already assigned as owners
  return profiles.filter((p) => !ownerProfileIds.has(p.id));
}

/**
 * Update a profile.
 */
export async function updateProfile(
  profileId: string,
  data: Partial<{
    firstName: string;
    lastName: string;
    phone: string | null;
    avatarUrl: string | null;
  }>,
) {
  return db.orm.public.Profile.where({ id: profileId }).update(data);
}

/**
 * Get a profile with its scheme memberships (including scheme name).
 */
export async function getProfileWithMemberships(profileId: string) {
  const profile = await db.orm.public.Profile.first({ id: profileId });
  if (!profile) return null;

  // Single query with eager-loaded scheme relation (avoids N+1)
  const memberships = await db.orm.public.SchemeMembership
    .where((m) => and(m.profileId.eq(profileId), m.isActive.eq(true)))
    .include("scheme")
    .all();

  return {
    ...profile,
    memberships: memberships.map((m) => ({
      ...m,
      schemeName: m.scheme?.name ?? "Unknown Scheme",
    })),
  };
}

/**
 * Check whether a profile has at least one active COMMITTEE membership, on
 * ANY scheme. Only for navigation (whether to show committee menu items).
 * Never use it to authorise scheme-specific data (SEC-023): check the
 * committee role on the scheme in hand instead (requireSchemeAccess, or the
 * roles from getSelectedOwnerScheme).
 */
export async function hasCommitteeRole(profileId: string): Promise<boolean> {
  const membership = await db.orm.public.SchemeMembership
    .where((m) =>
      and(
        m.profileId.eq(profileId),
        m.role.eq("COMMITTEE"),
        m.isActive.eq(true),
      ),
    )
    .first();

  return membership !== null;
}

/**
 * Get the distinct portal keys available to a profile.
 * Committee members are folded into the owner portal (they see extra nav
 * items there), so this returns at most ["owner"], ["adviser"] and/or ["supplier"].
 */
export async function getAvailablePortals(profileId: string) {
  const memberships = await db.orm.public.SchemeMembership
    .where((m) => and(m.profileId.eq(profileId), m.isActive.eq(true)))
    .all();

  const roles = [...new Set(memberships.map((m) => m.role))];
  const portals: string[] = [];

  for (const role of roles) {
    const key = role.toLowerCase();
    // COMMITTEE members use the owner portal with extra features
    // Committee members and payment authorisers use the owner portal.
    if (key === "committee" || key === "owner" || key === "payment_authoriser") {
      if (!portals.includes("owner")) portals.push("owner");
    } else {
      if (!portals.includes(key)) portals.push(key);
    }
  }

  return portals;
}
