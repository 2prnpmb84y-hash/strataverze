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
    .include("images", (i) => i.orderBy((img) => img.sortOrder.asc()))
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
 * Fetch all schemes an external accountant has read-only access to.
 */
export async function getSchemesForAccountant(profileId: string) {
  return db.orm.public.Scheme
    .include("memberships", (m) =>
      m.where((sm) => sm.profileId.eq(profileId))
        .where((sm) => sm.role.eq("ACCOUNTANT"))
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
    .include("images", (i) => i.orderBy((img) => img.sortOrder.asc()))
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
    buildingType?: string;
    buildingClass?: string;
    buildingSubType?: string;
    folio?: string;
    isActive?: boolean;
    allInclusiveFees?: boolean;
    paymentPlan?: string;
    debtCollection?: boolean;
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
      buildingType: data.buildingType ?? null,
      buildingClass: data.buildingClass ?? null,
      buildingSubType: data.buildingSubType ?? null,
      folio: data.folio ?? null,
      isActive: data.isActive ?? true,
      allInclusiveFees: data.allInclusiveFees ?? false,
      paymentPlan: data.paymentPlan ?? null,
      debtCollection: data.debtCollection ?? false,
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
    buildingSubType: string | null;
    folio: string | null;
    isActive: boolean;
    allInclusiveFees: boolean;
    paymentPlan: string | null;
    debtCollection: boolean;
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
 * Get notification summary counts per scheme for the selection grid.
 * Returns a map of schemeId -> { pendingLevies, activeWorkOrders, upcomingMeetings }.
 */
export async function getSchemeNotificationCounts(
  schemeIds: string[],
  ownerLotIds: Set<string>,
) {
  if (schemeIds.length === 0) return new Map<string, { pendingLevies: number; activeWorkOrders: number; upcomingMeetings: number }>();

  const [levies, workOrders, meetings] = await Promise.all([
    db.orm.public.Levy
      .where((l) => l.schemeId.in(schemeIds))
      .where((l) => l.status.eq("ISSUED"))
      .include("items")
      .limit(1000)
      .all(),
    db.orm.public.WorkOrder
      .where((wo) => wo.schemeId.in(schemeIds))
      .where((wo) => wo.status.in(["OPEN", "IN_PROGRESS"]))
      .limit(1000)
      .all(),
    db.orm.public.Meeting
      .where((m) => m.schemeId.in(schemeIds))
      .where((m) => m.status.eq("SCHEDULED"))
      .limit(500)
      .all(),
  ]);

  const counts = new Map<string, { pendingLevies: number; activeWorkOrders: number; upcomingMeetings: number }>();

  for (const id of schemeIds) {
    counts.set(id, { pendingLevies: 0, activeWorkOrders: 0, upcomingMeetings: 0 });
  }

  // Count levies with unpaid items belonging to the owner's lots
  for (const levy of levies) {
    const entry = counts.get(levy.schemeId);
    if (!entry) continue;
    const hasUnpaid = levy.items.some(
      (item) => ownerLotIds.has(item.lotId) && item.status !== "PAID",
    );
    if (hasUnpaid) entry.pendingLevies++;
  }

  // Count active work orders per scheme
  for (const wo of workOrders) {
    const entry = counts.get(wo.schemeId);
    if (entry) entry.activeWorkOrders++;
  }

  // Count upcoming meetings per scheme
  for (const meeting of meetings) {
    const entry = counts.get(meeting.schemeId);
    if (entry) entry.upcomingMeetings++;
  }

  return counts;
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
        .limit(500)
        .all()
    : await db.orm.public.SchemeMembership
        .where((m) => m.schemeId.eq(schemeId))
        .where((m) => m.isActive.eq(true))
        .include("profile")
        .limit(500)
        .all();

  return memberships
    .map((m) => m.profile.email)
    .filter((email) => email.length > 0);
}
