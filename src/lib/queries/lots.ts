import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";

import { effectiveStatus, noticeLabel } from "@/lib/levies/levy-ledger";
import { toIsoDay } from "@/lib/levies/notice-plan";

type LotNotice = {
  amountDue: unknown;
  amountPaid: unknown;
  interestCharged?: unknown;
  levySchedule?: { levyType?: unknown } | null;
};

function isSpecialNotice(n: LotNotice): boolean {
  return String(n.levySchedule?.levyType ?? "") === "SPECIAL";
}

/** Budget, special, paid and interest totals for a lot's issued notices. */
function levyTotalsForLot(notices: LotNotice[]) {
  const r = (x: number) => Math.round(x * 100) / 100;
  let annual = 0;
  let special = 0;
  let paid = 0;
  let interest = 0;
  for (const n of notices) {
    const due = Number(n.amountDue ?? 0);
    if (isSpecialNotice(n)) special += due;
    else annual += due;
    paid += Number(n.amountPaid ?? 0);
    interest += Number(n.interestCharged ?? 0);
  }
  return { annual: r(annual), special: r(special), paid: r(paid), interest: r(interest) };
}

/**
 * Fetch all lots for a given scheme, ordered by lot number.
 */
export async function getLotsForScheme(schemeId: string, limit = 200) {
  return db.orm.public.Lot
    .where((l) => l.schemeId.eq(schemeId))
    .include("memberships", (m) =>
      m.where((sm) => sm.isActive.eq(true)).include("profile"),
    )
    .orderBy((l) => l.lotNumber.asc())
    .limit(limit)
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
  let lot;
  try {
    lot = await db.orm.public.Lot
      .include("memberships", (m) =>
        m.where((sm) => sm.isActive.eq(true)).include("profile"),
      )
      .include("journalLines")
      .include("levyNotices", (ln) => ln.include("levySchedule").include("fund"))
      .first({ id: lotId });
  } catch {
    // Fallback if journal_lines or levy_notices tables do not exist yet
    lot = await db.orm.public.Lot
      .include("memberships", (m) =>
        m.where((sm) => sm.isActive.eq(true)).include("profile"),
      )
      .include("levyNotices", (ln) => ln.include("levySchedule").include("fund"))
      .first({ id: lotId });
  }

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

  // Financials from issued levy notices (budget and special levies)
  const notices = (lot.levyNotices ?? []).filter((n) => String(n.status) !== "DRAFT");
  const totals = levyTotalsForLot(notices);

  const levyHistory = [...notices]
    .sort((a, b) => toIsoDay(b.dueDate).localeCompare(toIsoDay(a.dueDate)))
    .map((n) => ({
      id: n.id,
      levyTitle: `${noticeLabel(n)} (${String(n.noticeNumber)})`,
      levyType: isSpecialNotice(n) ? "SPECIAL" : "ORDINARY",
      dueDate: n.dueDate,
      amount: Number(n.amountDue ?? 0) + Number(n.interestCharged ?? 0),
      paidAmount: Number(n.amountPaid ?? 0),
      status: effectiveStatus(n, new Date().toISOString().slice(0, 10)),
      paidAt: n.paidInFullAt,
    }));

  // Opening balance from journal lines tagged to this lot (debit minus credit)
  const lotJournalLines = (lot as { journalLines?: Array<{ debit?: unknown; credit?: unknown }> }).journalLines ?? [];
  const opening = lotJournalLines.reduce(
    (sum, jl) => sum + Number(jl.debit ?? 0) - Number(jl.credit ?? 0),
    0,
  );
  const annualTotal = totals.annual;
  const specialTotal = totals.special;
  const paidTotal = totals.paid;
  const interestPaid = totals.interest;
  const closing = opening + annualTotal + specialTotal + interestPaid - paidTotal;

  return {
    id: lot.id,
    schemeId: lot.schemeId,
    lotNumber: lot.lotNumber,
    unitNumber: lot.unitNumber,
    entitlement: lot.entitlement,
    floorArea: lot.floorArea,
    lotType: lot.lotType,
    streetNo: (lot as Record<string, unknown>).streetNo as string | null ?? null,
    streetName: (lot as Record<string, unknown>).streetName as string | null ?? null,
    suburb: (lot as Record<string, unknown>).suburb as string | null ?? null,
    accessoryUnit: (lot as Record<string, unknown>).accessoryUnit as string | null ?? null,
    uof: (lot as Record<string, unknown>).uof as string | null ?? null,
    crn: (lot as Record<string, unknown>).crn as string | null ?? null,
    owners,
    isCommitteeMember: owners.some((o) => committeeMembers.includes(o.profileId)),
    financials: {
      opening,
      annual: annualTotal,
      special: specialTotal,
      paid: paidTotal,
      closing,
      interestPaid,
    },
    levyHistory,
  };
}

/**
 * Fetch strata roll data for a scheme: lots with owners and levy financials.
 */
export async function getStrataRollData(schemeId: string, limit = 500) {
  let lots;
  try {
    lots = await db.orm.public.Lot
      .where((l) => l.schemeId.eq(schemeId))
      .include("memberships", (m) =>
        m.where((sm) => and(sm.isActive.eq(true), sm.role.eq("OWNER")))
          .include("profile"),
      )
      .include("journalLines")
      .include("levyNotices", (ln) => ln.include("levySchedule"))
      .orderBy((l) => l.lotNumber.asc())
      .limit(limit)
      .all();
  } catch {
    // Fallback if journal_lines or levy_notices tables do not exist yet
    lots = await db.orm.public.Lot
      .where((l) => l.schemeId.eq(schemeId))
      .include("memberships", (m) =>
        m.where((sm) => and(sm.isActive.eq(true), sm.role.eq("OWNER")))
          .include("profile"),
      )
      .include("levyNotices", (ln) => ln.include("levySchedule"))
      .orderBy((l) => l.lotNumber.asc())
      .limit(limit)
      .all();
  }

  return lots.map((lot) => {
    const owners = lot.memberships.map((m) => {
      const name =
        `${m.profile.firstName} ${m.profile.lastName}`.trim() ||
        m.profile.email;
      return name;
    });

    // Financials from issued levy notices (budget and special levies)
    const notices = (lot.levyNotices ?? []).filter((n) => String(n.status) !== "DRAFT");
    const totals = levyTotalsForLot(notices);
    const lotJournalLines = (lot as { journalLines?: Array<{ debit?: unknown; credit?: unknown }> }).journalLines ?? [];
    // Opening = net debit balance from journal lines tagged to this lot
    const opening = lotJournalLines.reduce(
      (sum, jl) => sum + Number(jl.debit ?? 0) - Number(jl.credit ?? 0),
      0,
    );
    const annualTotal = totals.annual;
    const specialTotal = totals.special;
    const paidTotal = totals.paid;
    const interestPaid = totals.interest;
    // Closing = Opening + Annual + Special + Interest - Paid
    const closing = opening + annualTotal + specialTotal + interestPaid - paidTotal;

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
