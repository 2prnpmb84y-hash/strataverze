import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";

import { effectiveStatus, noticeLabel } from "@/lib/levies/levy-ledger";
import { toIsoDay } from "@/lib/levies/notice-plan";
import { lotFinancialStatus } from "@/lib/levies/financial-status";
import { sydneyToday } from "@/lib/finance/interest-setting";

type LotNotice = {
  amountDue: unknown;
  amountPaid: unknown;
  balanceOutstanding?: unknown;
  interestCharged?: unknown;
  migratedInterestCharged?: unknown;
  migratedInterestPaid?: unknown;
  migrationBatchId?: string | null;
  levySchedule?: { levyType?: unknown } | null;
};

function isSpecialNotice(n: LotNotice): boolean {
  return String(n.levySchedule?.levyType ?? "") === "SPECIAL";
}

/**
 * A lot's levy account, rolled forward from its issued notices (financials
 * review B7, 26 Oct 2026):
 *
 *   brought forward + levies + special levies + interest charged - paid = closing
 *
 * - Brought forward: what was owing on the notices brought across at
 *   takeover (levy and the old system's unpaid interest).
 * - Levies and special levies: notices raised here.
 * - Interest charged: interest charged here, not the old system's.
 * - Paid: payments received here.
 * - Closing: what is owing, the sum of the notices' balances.
 */
export function lotRollForward(notices: LotNotice[]) {
  const c = (v: unknown) => Math.round(Number(v ?? 0) * 100);
  let broughtForward = 0;
  let annual = 0;
  let special = 0;
  let interest = 0;
  let paid = 0;
  for (const n of notices) {
    const migIc = c(n.migratedInterestCharged);
    const migIp = c(n.migratedInterestPaid);
    if (n.migrationBatchId) broughtForward += c(n.amountDue) + migIc - migIp;
    else if (isSpecialNotice(n)) special += c(n.amountDue);
    else annual += c(n.amountDue);
    interest += c(n.interestCharged) - migIc;
    paid += c(n.amountPaid) - migIp;
  }
  const closing = broughtForward + annual + special + interest - paid;
  const d = (x: number) => x / 100;
  return { opening: d(broughtForward), annual: d(annual), special: d(special), interest: d(interest), paid: d(paid), closing: d(closing) };
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
 * Fetch a lot only if it belongs to the scheme (null otherwise).
 */
export async function getLotInScheme(schemeId: string, lotId: string) {
  return db.orm.public.Lot
    .where((l) => and(l.id.eq(lotId), l.schemeId.eq(schemeId)))
    .first();
}

/**
 * Update an existing lot. Scheme-scoped: a lot from another scheme matches nothing.
 */
export async function updateLot(
  schemeId: string,
  lotId: string,
  data: Partial<{
    lotNumber: string;
    unitNumber: string | null;
    entitlement: number;
    floorArea: number | null;
    lotType: string;
  }>,
) {
  return db.orm.public.Lot
    .where((l) => and(l.id.eq(lotId), l.schemeId.eq(schemeId)))
    .update(data);
}

/**
 * Delete a lot. Scheme-scoped: a lot from another scheme matches nothing.
 */
export async function deleteLot(schemeId: string, lotId: string) {
  return db.orm.public.Lot
    .where((l) => and(l.id.eq(lotId), l.schemeId.eq(schemeId)))
    .delete();
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
  const totals = lotRollForward(notices);

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
    financials: totals,
    levyHistory,
  };
}

/**
 * Fetch strata roll data for a scheme: lots with owners and levy financials.
 */
export async function getStrataRollData(schemeId: string, limit = 500) {
  const today = sydneyToday();
  let lots;
  try {
    lots = await db.orm.public.Lot
      .where((l) => l.schemeId.eq(schemeId))
      .include("memberships", (m) =>
        m.where((sm) => and(sm.isActive.eq(true), sm.role.eq("OWNER")))
          .include("profile"),
      )
      .include("lotDetail")
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
      .include("lotDetail")
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
    const totals = lotRollForward(notices);

    return {
      id: lot.id,
      lotNumber: lot.lotNumber,
      unitNumber: lot.unitNumber,
      entitlement: lot.entitlement,
      // The name as recorded on the strata roll, else the owners' accounts.
      ownerNames: (lot as { lotDetail?: { rollOwnerName?: string | null } | null }).lotDetail?.rollOwnerName || owners.join(" & "),
      ...totals,
      // Financial or unfinancial (overdue and unpaid), decided 25 Oct 2026.
      ...lotFinancialStatus(notices, today),
    };
  });
}
