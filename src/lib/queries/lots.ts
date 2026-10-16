import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";

/**
 * Fetch all lots for a given scheme, ordered by lot number.
 */
export async function getLotsForScheme(schemeId: string) {
  return db.orm.public.Lot
    .where((l) => l.schemeId.eq(schemeId))
    .include("memberships", (m) =>
      m.where((sm) => sm.isActive.eq(true)).include("profile"),
    )
    .orderBy((l) => l.lotNumber.asc())
    .all();
}

/**
 * Fetch a single lot by ID with its memberships.
 */
export async function getLotById(lotId: string) {
  return db.orm.public.Lot
    .include("memberships", (m) =>
      m.where((sm) => sm.isActive.eq(true)).include("profile"),
    )
    .first({ id: lotId });
}

/**
 * Create a lot within a scheme.
 */
export async function createLot(data: {
  schemeId: string;
  lotNumber: string;
  unitNumber?: string;
  entitlement: number;
  floorArea?: number;
  lotType?: string;
}) {
  return db.orm.public.Lot.create({
    schemeId: data.schemeId,
    lotNumber: data.lotNumber,
    unitNumber: data.unitNumber ?? null,
    entitlement: data.entitlement,
    floorArea: data.floorArea ?? null,
    lotType: data.lotType ?? "RESIDENTIAL",
  });
}

/**
 * Update an existing lot.
 */
export async function updateLot(
  lotId: string,
  data: Partial<{
    lotNumber: string;
    unitNumber: string | null;
    entitlement: number;
    floorArea: number | null;
    lotType: string;
  }>,
) {
  return db.orm.public.Lot.where({ id: lotId }).update(data);
}

/**
 * Delete a lot.
 */
export async function deleteLot(lotId: string) {
  return db.orm.public.Lot.where({ id: lotId }).delete();
}

/**
 * Assign an owner to a lot by creating a membership.
 */
export async function assignOwnerToLot(data: {
  schemeId: string;
  lotId: string;
  profileId: string;
}) {
  return db.orm.public.SchemeMembership.create({
    schemeId: data.schemeId,
    profileId: data.profileId,
    lotId: data.lotId,
    role: "OWNER",
    isActive: true,
  });
}

/**
 * Remove an owner from a lot by deactivating the membership.
 */
export async function removeOwnerFromLot(membershipId: string) {
  return db.orm.public.SchemeMembership
    .where({ id: membershipId })
    .update({
      isActive: false,
      endDate: new Date().toISOString() as unknown as TimestampString<3>,
    });
}

/**
 * Fetch full lot detail with owners, levy items, and computed financials.
 */
export async function getLotDetail(lotId: string) {
  const lot = await db.orm.public.Lot
    .include("memberships", (m) =>
      m.where((sm) => sm.isActive.eq(true)).include("profile"),
    )
    .include("levyItems", (li) => li.include("levy"))
    .first({ id: lotId });

  if (!lot) return null;

  const owners = lot.memberships
    .filter((m) => m.role === "OWNER")
    .map((m) => ({
      membershipId: m.id,
      profileId: m.profile.id,
      firstName: m.profile.firstName,
      lastName: m.profile.lastName,
      email: m.profile.email,
      phone: m.profile.phone,
      startDate: m.startDate,
    }));

  const committeeMembers = lot.memberships
    .filter((m) => m.role === "COMMITTEE")
    .map((m) => m.profile.id);

  // Compute financials from levy items
  let annualTotal = 0;
  let specialTotal = 0;
  let paidTotal = 0;

  // Sort levy items by due date descending (newest first)
  const sortedItems = [...lot.levyItems].sort((a, b) => {
    const dateA = new Date(a.levy.dueDate).getTime();
    const dateB = new Date(b.levy.dueDate).getTime();
    return dateB - dateA;
  });

  const levyHistory = sortedItems.map((item) => {
    const amount = Number(item.amount);
    const paid = Number(item.paidAmount);

    if (item.levy.levyType === "ORDINARY") {
      annualTotal += amount;
    } else if (item.levy.levyType === "SPECIAL") {
      specialTotal += amount;
    }
    paidTotal += paid;

    return {
      id: item.id,
      levyTitle: item.levy.title,
      levyType: item.levy.levyType,
      dueDate: item.levy.dueDate,
      amount,
      paidAmount: paid,
      status: item.status,
      paidAt: item.paidAt,
    };
  });

  const opening = 0;
  const closing = opening + annualTotal + specialTotal - paidTotal;

  return {
    id: lot.id,
    schemeId: lot.schemeId,
    lotNumber: lot.lotNumber,
    unitNumber: lot.unitNumber,
    entitlement: lot.entitlement,
    floorArea: lot.floorArea,
    lotType: lot.lotType,
    owners,
    isCommitteeMember: owners.some((o) => committeeMembers.includes(o.profileId)),
    financials: {
      opening,
      annual: annualTotal,
      special: specialTotal,
      paid: paidTotal,
      closing,
      interestPaid: 0,
    },
    levyHistory,
  };
}

/**
 * Fetch strata roll data for a scheme: lots with owners and levy financials.
 */
export async function getStrataRollData(schemeId: string) {
  const lots = await db.orm.public.Lot
    .where((l) => l.schemeId.eq(schemeId))
    .include("memberships", (m) =>
      m.where((sm) => and(sm.isActive.eq(true), sm.role.eq("OWNER")))
        .include("profile"),
    )
    .include("levyItems", (li) => li.include("levy"))
    .orderBy((l) => l.lotNumber.asc())
    .all();

  return lots.map((lot) => {
    const owners = lot.memberships.map((m) => {
      const name =
        `${m.profile.firstName} ${m.profile.lastName}`.trim() ||
        m.profile.email;
      return name;
    });

    // Compute financials from levy items
    let annualTotal = 0;
    let specialTotal = 0;
    let paidTotal = 0;

    for (const item of lot.levyItems) {
      const amount = Number(item.amount);
      const paid = Number(item.paidAmount);

      if (item.levy.levyType === "ORDINARY") {
        annualTotal += amount;
      } else if (item.levy.levyType === "SPECIAL") {
        specialTotal += amount;
      }
      paidTotal += paid;
    }

    // Opening balance: placeholder (no dedicated field yet)
    const opening = 0;
    // Closing = Opening + Annual + Special - Paid
    const closing = opening + annualTotal + specialTotal - paidTotal;
    // Interest: placeholder (no dedicated field yet)
    const interestPaid = 0;

    return {
      id: lot.id,
      lotNumber: lot.lotNumber,
      unitNumber: lot.unitNumber,
      entitlement: lot.entitlement,
      ownerNames: owners.join(" & "),
      opening,
      annual: annualTotal,
      special: specialTotal,
      paid: paidTotal,
      closing,
      interestPaid,
    };
  });
}
