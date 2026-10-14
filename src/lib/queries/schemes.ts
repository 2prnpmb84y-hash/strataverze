import { db } from "@/prisma/db";

/**
 * Fetch all schemes managed by a given adviser (by profile ID).
 */
export async function getSchemesForAdviser(profileId: string) {
  return db.orm.public.Scheme
    .include("memberships", (m) =>
      m.where((sm) => sm.profileId.eq(profileId))
        .where((sm) => sm.role.eq("ADVISER"))
        .where((sm) => sm.isActive.eq(true)),
    )
    .orderBy((s) => s.name.asc())
    .all()
    .then((schemes) =>
      schemes.filter((s) => s.memberships.length > 0),
    );
}

/**
 * Fetch all schemes an owner belongs to (by profile ID).
 */
export async function getSchemesForOwner(profileId: string) {
  return db.orm.public.Scheme
    .include("memberships", (m) =>
      m.where((sm) => sm.profileId.eq(profileId))
        .where((sm) => sm.role.eq("OWNER"))
        .where((sm) => sm.isActive.eq(true))
        .include("lot"),
    )
    .orderBy((s) => s.name.asc())
    .all()
    .then((schemes) =>
      schemes.filter((s) => s.memberships.length > 0),
    );
}

/**
 * Fetch all schemes a committee member belongs to (by profile ID).
 */
export async function getSchemesForCommittee(profileId: string) {
  return db.orm.public.Scheme
    .include("memberships", (m) =>
      m.where((sm) => sm.profileId.eq(profileId))
        .where((sm) => sm.role.eq("COMMITTEE"))
        .where((sm) => sm.isActive.eq(true)),
    )
    .orderBy((s) => s.name.asc())
    .all()
    .then((schemes) =>
      schemes.filter((s) => s.memberships.length > 0),
    );
}

/**
 * Fetch a single scheme by ID with lot count and membership summary.
 */
export async function getSchemeById(schemeId: string) {
  return db.orm.public.Scheme
    .include("lots")
    .include("memberships", (m) =>
      m.where((sm) => sm.isActive.eq(true))
        .include("profile"),
    )
    .include("funds")
    .first({ id: schemeId });
}

/**
 * Create a new scheme and wire the creator as its adviser.
 */
export async function createScheme(
  data: {
    name: string;
    planNumber: string;
    address: string;
    suburb: string;
    state: string;
    postcode: string;
    totalLots: number;
    totalEntitlement: number;
    financialYearEnd?: string;
    abnNumber?: string;
  },
  adviserProfileId: string,
) {
  return db.transaction(async (tx) => {
    const scheme = await tx.orm.public.Scheme.create({
      name: data.name,
      planNumber: data.planNumber,
      address: data.address,
      suburb: data.suburb,
      state: data.state,
      postcode: data.postcode,
      totalLots: data.totalLots,
      totalEntitlement: data.totalEntitlement,
      financialYearEnd: data.financialYearEnd ?? "06-30",
      abnNumber: data.abnNumber ?? null,
    });

    // Link the creator as the adviser
    await tx.orm.public.SchemeMembership.create({
      schemeId: scheme.id,
      profileId: adviserProfileId,
      role: "ADVISER",
      isActive: true,
    });

    // Create default funds
    await tx.orm.public.Fund.create({
      schemeId: scheme.id,
      name: "Administrative Fund",
      fundType: "ADMIN",
    });
    await tx.orm.public.Fund.create({
      schemeId: scheme.id,
      name: "Capital Works Fund",
      fundType: "SINKING",
    });

    return scheme;
  });
}

/**
 * Update an existing scheme.
 */
export async function updateScheme(
  schemeId: string,
  data: Partial<{
    name: string;
    address: string;
    suburb: string;
    state: string;
    postcode: string;
    totalLots: number;
    totalEntitlement: number;
    financialYearEnd: string;
    abnNumber: string | null;
  }>,
) {
  return db.orm.public.Scheme.where({ id: schemeId }).update(data);
}

/**
 * Delete a scheme and all cascaded records.
 */
export async function deleteScheme(schemeId: string) {
  return db.orm.public.Scheme.where({ id: schemeId }).delete();
}

/**
 * Fetch the name of a scheme by ID.
 */
export async function getSchemeNameById(schemeId: string) {
  const scheme = await db.orm.public.Scheme.first({ id: schemeId });
  return scheme?.name ?? "Unknown Scheme";
}

/**
 * Fetch email addresses for all active members of a scheme,
 * optionally filtered by role (e.g. "OWNER", "COMMITTEE", "ADVISER").
 */
export async function getMemberEmailsForScheme(
  schemeId: string,
  role?: "OWNER" | "COMMITTEE" | "ADVISER",
) {
  const memberships = role
    ? await db.orm.public.SchemeMembership
        .where((m) => m.schemeId.eq(schemeId))
        .where((m) => m.role.eq(role))
        .where((m) => m.isActive.eq(true))
        .include("profile")
        .all()
    : await db.orm.public.SchemeMembership
        .where((m) => m.schemeId.eq(schemeId))
        .where((m) => m.isActive.eq(true))
        .include("profile")
        .all();

  return memberships
    .map((m) => m.profile.email)
    .filter((email) => email.length > 0);
}
