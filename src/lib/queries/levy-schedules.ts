import { db } from "@/prisma/db";
import { captureTransactionFee } from "@/lib/billing/capture";
import { toCents } from "@/lib/billing/money";
import { splitLevyPayment } from "@/lib/finance/owner-credit";
import { recordCreditMovement } from "@/lib/finance/owner-credits";
import { and, or } from "@prisma/orm-postgres/orm-client";
import type { Numeric, TimestampString, Varchar } from "@prisma/orm-postgres/target/codec-types";

/** Cast a number or string to the Prisma 8 Numeric branded type. */
function toNumeric<P extends number = 12, S extends number = 2>(value: number | string): Numeric<P, S> {
  return String(value) as unknown as Numeric<P, S>;
}

/** Cast an ISO string to the Prisma 8 TimestampString branded type. */
function toTimestamp(value: string): TimestampString<3> {
  return value as unknown as TimestampString<3>;
}

/** Cast a plain string to the Prisma 8 Varchar branded type. */
function toVarchar<N extends number>(value: string): Varchar<N> {
  return value as unknown as Varchar<N>;
}

// ─── Levy Schedule Queries ─────────────────────────────────────

/**
 * Fetch all levy schedules for a scheme, optionally filtered by financial year.
 * Includes the fund relation. Ordered by financial year desc, then createdAt desc.
 */
export async function getLevySchedulesForScheme(
  schemeId: string,
  financialYear?: number,
  limit = 200,
) {
  const baseQuery = db.orm.public.LevySchedule
    .where((ls) => {
      const conditions = [ls.schemeId.eq(schemeId)];
      if (financialYear !== undefined) {
        conditions.push(ls.financialYear.eq(financialYear));
      }
      return conditions.length === 1 ? conditions[0] : and(...conditions);
    })
    .include("fund")
    .include("levyNotices")
    .orderBy((ls) => ls.financialYear.desc())
    .limit(limit);

  return baseQuery.all();
}

/**
 * Fetch a single levy schedule by ID with fund and levy notices (including lot details).
 */
export async function getLevyScheduleById(scheduleId: string) {
  try {
    return db.orm.public.LevySchedule
      .where((ls) => ls.id.eq(scheduleId))
      .include("fund")
      .include("levyNotices", (ln) => ln.include("lot").include("fund"))
      .first();
  } catch {
    // Table may not exist yet
    return null;
  }
}

/**
 * Create a new levy schedule.
 */
export async function createLevySchedule(data: {
  schemeId: string;
  fundId: string;
  financialYear: number;
  budgetAmount: number;
  frequency: string;
  totalLots: number;
  totalEntitlement: number;
  levyType?: "ORDINARY" | "SPECIAL";
  title?: string | null;
  description?: string | null;
  dueDate?: string | null;
  /** Record approval at creation (special levies are raised by resolution). */
  approval?: { approvedBy: string; approvedAt: string };
  /** The adopted capital works fund plan the schedule comes from. */
  capitalWorksPlanId?: string | null;
}) {
  return db.orm.public.LevySchedule.create({
    capitalWorksPlanId: data.capitalWorksPlanId ?? null,
    schemeId: data.schemeId,
    fundId: data.fundId,
    financialYear: data.financialYear,
    budgetAmount: toNumeric(data.budgetAmount),
    frequency: data.frequency,
    totalLots: data.totalLots,
    totalEntitlement: toNumeric<10, 2>(data.totalEntitlement),
    levyType: data.levyType ?? "ORDINARY",
    title: data.title ?? null,
    description: data.description ?? null,
    dueDate: data.dueDate ? toTimestamp(data.dueDate) : null,
    status: data.approval ? "APPROVED" : "DRAFT",
    approvedAt: data.approval ? toTimestamp(data.approval.approvedAt) : null,
    approvedBy: data.approval?.approvedBy ?? null,
  });
}

/**
 * Record approval of a levy schedule (the owners corporation's resolution).
 * `approvedAt` is the resolution date; defaults to now.
 */
export async function approveLevySchedule(
  scheduleId: string,
  approvedBy: string,
  approvedAt: string = new Date().toISOString(),
) {
  return db.orm.public.LevySchedule
    .where({ id: scheduleId })
    .update({
      status: "APPROVED",
      approvedAt: toTimestamp(approvedAt),
      approvedBy,
    });
}

/**
 * Activate a levy schedule — sets status to ACTIVE.
 */
export async function activateLevySchedule(scheduleId: string) {
  return db.orm.public.LevySchedule
    .where({ id: scheduleId })
    .update({ status: "ACTIVE" });
}

/**
 * Supersede a levy schedule — sets status to SUPERSEDED.
 */
export async function supersedeLevySchedule(scheduleId: string) {
  try {
    return db.orm.public.LevySchedule
      .where({ id: scheduleId })
      .update({ status: "SUPERSEDED" });
  } catch {
    // Table may not exist yet
    return [];
  }
}

// ─── Levy Payment Calculation (exported for unit testing) ─────

export interface LevyPaymentResult {
  newPaid: number;
  newBalance: number;
  isPaidInFull: boolean;
  status: "PAID" | "PARTIALLY_PAID";
}

/**
 * Calculate the result of applying a payment to a levy notice.
 * Pure function, no DB access.
 */
export function calculateLevyPayment(
  currentPaid: number,
  totalDue: number,
  paymentAmount: number,
): LevyPaymentResult {
  const newPaid = currentPaid + paymentAmount;
  const newBalance = totalDue - newPaid;
  const isPaidInFull = newBalance <= 0;

  return {
    newPaid,
    newBalance: Math.max(0, newBalance),
    isPaidInFull,
    status: isPaidInFull ? "PAID" : "PARTIALLY_PAID",
  };
}

// ─── Levy Notice Queries ───────────────────────────────────────

/**
 * Fetch all levy notices for a schedule, with lot details. Ordered by noticeNumber.
 */
export async function getLevyNoticesForSchedule(scheduleId: string, limit = 500) {
  try {
    return db.orm.public.LevyNotice
      .where((ln) => ln.levyScheduleId.eq(scheduleId))
      .include("lot")
      .include("fund")
      .orderBy((ln) => ln.noticeNumber.asc())
      .limit(limit)
      .all();
  } catch {
    // Table may not exist yet
    return [];
  }
}

/**
 * Fetch levy notices for a specific lot, with optional filters.
 * Includes levySchedule and fund. Ordered by dueDate desc.
 */
export async function getLevyNoticesForLot(
  lotId: string,
  filters?: { status?: string; fundId?: string },
  limit = 200,
) {
  return db.orm.public.LevyNotice
    .where((ln) => {
      const conditions = [ln.lotId.eq(lotId)];
      if (filters?.status) {
        conditions.push(ln.status.eq(filters.status));
      }
      if (filters?.fundId) {
        conditions.push(ln.fundId.eq(filters.fundId));
      }
      return conditions.length === 1 ? conditions[0] : and(...conditions);
    })
    .include("levySchedule")
    .include("fund")
    .orderBy((ln) => ln.dueDate.desc())
    .limit(limit)
    .all();
}

/**
 * Fetch levy notices for an owner across all their lots.
 * Includes lot, fund, and levySchedule. Ordered by dueDate desc.
 */
export async function getLevyNoticesForOwner(
  ownerId: string,
  filters?: { status?: string; schemeId?: string },
  limit = 200,
) {
  return db.orm.public.LevyNotice
    .where((ln) => {
      const conditions = [ln.ownerId.eq(ownerId)];
      if (filters?.status) {
        conditions.push(ln.status.eq(filters.status));
      }
      if (filters?.schemeId) {
        conditions.push(ln.schemeId.eq(filters.schemeId));
      }
      return conditions.length === 1 ? conditions[0] : and(...conditions);
    })
    .include("lot")
    .include("fund")
    .include("levySchedule")
    .orderBy((ln) => ln.dueDate.desc())
    .limit(limit)
    .all();
}

/**
 * Create a single levy notice.
 */
export async function createLevyNotice(data: {
  schemeId: string;
  levyScheduleId: string;
  lotId: string;
  ownerId: string | null;
  fundId: string;
  noticeNumber: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amountDue: number;
}) {
  return db.orm.public.LevyNotice.create({
    schemeId: data.schemeId,
    levyScheduleId: data.levyScheduleId,
    lotId: data.lotId,
    ownerId: data.ownerId,
    fundId: data.fundId,
    noticeNumber: toVarchar<20>(data.noticeNumber),
    periodStart: toTimestamp(data.periodStart),
    periodEnd: toTimestamp(data.periodEnd),
    dueDate: toTimestamp(data.dueDate),
    amountDue: toNumeric(data.amountDue),
    amountPaid: toNumeric(0),
    balanceOutstanding: toNumeric(data.amountDue),
    interestCharged: toNumeric(0),
    status: "DRAFT",
  });
}

/**
 * Bulk-create levy notices in a single transaction.
 */
export async function createLevyNoticesBatch(
  notices: Array<{
    schemeId: string;
    levyScheduleId: string;
    lotId: string;
    ownerId: string | null;
    fundId: string;
    noticeNumber: string;
    periodStart: string;
    periodEnd: string;
    dueDate: string;
    amountDue: number;
  }>,
  /** Mark this schedule ACTIVE in the same transaction, so notices and schedule never disagree. */
  opts: { activateScheduleId?: string } = {},
) {
  if (notices.length === 0) return [];

  return db.transaction(async (tx) => {
    if (opts.activateScheduleId) {
      await tx.orm.public.LevySchedule.where((s) => s.id.eq(opts.activateScheduleId!)).update({ status: "ACTIVE" });
    }
    const created = [];
    for (const data of notices) {
      const notice = await tx.orm.public.LevyNotice.create({
        schemeId: data.schemeId,
        levyScheduleId: data.levyScheduleId,
        lotId: data.lotId,
        ownerId: data.ownerId,
        fundId: data.fundId,
        noticeNumber: toVarchar<20>(data.noticeNumber),
        periodStart: toTimestamp(data.periodStart),
        periodEnd: toTimestamp(data.periodEnd),
        dueDate: toTimestamp(data.dueDate),
        amountDue: toNumeric(data.amountDue),
        amountPaid: toNumeric(0),
        balanceOutstanding: toNumeric(data.amountDue),
        interestCharged: toNumeric(0),
        status: "DRAFT",
      });
      created.push(notice);
    }
    return created;
  });
}

/**
 * Issue a levy notice — sets status to ISSUED with timestamp.
 */
/**
 * Issue a planned notice: true when this call issued it. One UPDATE with the
 * whole filter (id and status DRAFT), so of two runs at once only one issues
 * it. (A single-row update() in Prisma 8 finds the row first and then updates
 * it by id alone, so it cannot be used to claim.) The notice goes to the
 * lot's current owner, with its final due date, and its levy is still to be
 * posted (levy_post_pending) until the caller posts it. `claimedAt` marks
 * the rows this run claimed, so only they are put back if posting fails.
 */
export async function issueLevyNotice(noticeId: string, opts: { ownerId?: string | null; dueDate?: string; claimedAt?: string } = {}): Promise<boolean> {
  const n = await db.orm.public.LevyNotice
    .where((ln) => and(ln.id.eq(noticeId), ln.status.eq("DRAFT")))
    .updateAndCount({
      status: "ISSUED",
      issuedAt: toTimestamp(opts.claimedAt ?? new Date().toISOString()),
      levyPostPending: true,
      ...(opts.ownerId !== undefined ? { ownerId: opts.ownerId } : {}),
      ...(opts.dueDate ? { dueDate: toTimestamp(opts.dueDate) } : {}),
    });
  return n === 1;
}

/**
 * Record a payment against a levy notice: writes a receipt row (levy_payments)
 * and updates the notice's running totals in one transaction.
 * The notice takes up to what it owes (levy plus any interest charged). Any
 * excess is held as the owner's credit for the lot in that fund, never lost.
 */
export async function recordLevyPayment(
  noticeId: string,
  paymentAmount: number,
  details: {
    paymentDate: string;
    reference?: string | null;
    recordedBy?: string | null;
    /** The StrataVerze fee (incl. GST, cents) the user confirmed, if any. */
    feeConfirmedCents?: number | null;
    /** False when the fee is captured once for a bank deposit split across notices. */
    captureFee?: boolean;
  } = {
    paymentDate: new Date().toISOString().slice(0, 10),
  },
): Promise<{ appliedCents: number; excessCents: number; creditTxId: string | null; receiptId: string | null }> {
  return db.transaction(async (tx) => {
    const notice = await tx.orm.public.LevyNotice.where({ id: noticeId })
      .include("levySchedule")
      .first();
    if (!notice) throw new Error(`Levy notice not found: ${noticeId}`);

    const paymentCents = Math.round(paymentAmount * 100);
    const owedCents = toCents(String(notice.amountDue)) + toCents(String(notice.interestCharged ?? 0));
    const paidCents = toCents(String(notice.amountPaid));
    const { appliedCents, excessCents } = splitLevyPayment(paymentCents, owedCents - paidCents);

    let receiptId: string | null = null;
    if (appliedCents > 0) {
      const receipt = await tx.orm.public.LevyPayment.create({
        schemeId: notice.schemeId,
        levyNoticeId: noticeId,
        lotId: notice.lotId,
        amount: toNumeric(appliedCents / 100),
        paymentDate: toTimestamp(details.paymentDate),
        reference: details.reference ?? null,
        recordedBy: details.recordedBy ?? null,
      });
      receiptId = receipt.id;
      const newPaid = paidCents + appliedCents;
      const newBalance = Math.max(0, owedCents - newPaid);
      const updateData: Record<string, unknown> = {
        amountPaid: toNumeric(newPaid / 100),
        balanceOutstanding: toNumeric(newBalance / 100),
        status: newBalance <= 0 ? "PAID" : "PARTIALLY_PAID",
      };
      if (newBalance <= 0) updateData.paidInFullAt = toTimestamp(new Date().toISOString());
      await tx.orm.public.LevyNotice.where({ id: noticeId }).update(updateData);
    }

    let creditTxId: string | null = null;
    if (excessCents > 0) {
      const credit = await recordCreditMovement(tx.orm, {
        schemeId: notice.schemeId,
        lotId: notice.lotId,
        fundId: notice.fundId,
        ownerId: notice.ownerId ?? null,
        type: "OVERPAYMENT",
        amountCents: excessCents,
        levyNoticeId: noticeId,
        levyPaymentId: receiptId,
        note: details.reference ?? null,
        createdBy: details.recordedBy ?? null,
        effectiveDate: details.paymentDate,
      });
      creditTxId = credit.id;
    }

    // StrataVerze transaction service fee, charged to the scheme (never added
    // to the owner's notice). Same transaction as the receipt.
    if (details.captureFee !== false) await captureTransactionFee(tx.orm, {
      schemeId: notice.schemeId,
      movement: notice.levySchedule?.levyType === "SPECIAL" ? "SPECIAL_LEVY_RECEIPT" : "LEVY_RECEIPT",
      paymentCents,
      sourceType: receiptId ? "LevyPayment" : "OwnerCreditTransaction",
      sourceId: (receiptId ?? creditTxId)!,
      actorId: details.recordedBy ?? null,
      confirmedCents: details.feeConfirmedCents ?? null,
      date: details.paymentDate,
    });

    return { appliedCents, excessCents, creditTxId, receiptId };
  });
}

/** Payments received against the given notices, oldest first. */
export async function getLevyPaymentsForNotices(noticeIds: string[]) {
  if (noticeIds.length === 0) return [];
  return db.orm.public.LevyPayment
    .where((p) => p.levyNoticeId.in(noticeIds))
    .orderBy((p) => p.paymentDate.asc())
    .all();
}

/**
 * Issued levy notices for a scheme (drafts excluded), with lot, fund and
 * schedule, for reports.
 */
export async function getIssuedLevyNoticesForScheme(schemeId: string, limit = 5000) {
  return db.orm.public.LevyNotice
    .where((ln) => and(ln.schemeId.eq(schemeId), ln.status.neq("DRAFT")))
    .include("lot")
    .include("fund")
    .include("levySchedule")
    .orderBy((ln) => ln.dueDate.asc())
    .limit(limit)
    .all();
}

/** Issued levy notices for a lot within a scheme, with fund and schedule. */
export async function getIssuedLevyNoticesForLot(schemeId: string, lotId: string, limit = 2000) {
  return db.orm.public.LevyNotice
    .where((ln) =>
      and(ln.schemeId.eq(schemeId), ln.lotId.eq(lotId), ln.status.neq("DRAFT")),
    )
    .include("fund")
    .include("levySchedule")
    .orderBy((ln) => ln.dueDate.asc())
    .limit(limit)
    .all();
}

/**
 * Fetch overdue levy notices for a scheme.
 * Returns notices with status ISSUED or PARTIALLY_PAID where dueDate is in the past.
 */
export async function getOverdueLevyNotices(schemeId: string, limit = 500) {
  try {
    const today = new Date().toISOString().split("T")[0];

    return db.orm.public.LevyNotice
      .where((ln) =>
        and(
          ln.schemeId.eq(schemeId),
          or(ln.status.eq("ISSUED"), ln.status.eq("PARTIALLY_PAID")),
          ln.dueDate.lt(toTimestamp(today)),
        ),
      )
      .include("lot")
      .include("fund")
      .orderBy((ln) => ln.dueDate.asc())
      .limit(limit)
      .all();
  } catch {
    // Table may not exist yet
    return [];
  }
}

/**
 * Fetch levy notices across multiple schemes for portfolio reporting.
 * Returns notices with fund relation for financial aggregation.
 */
export async function getLevyNoticesForSchemes(
  schemeIds: string[],
  limit = 1000,
) {
  if (schemeIds.length === 0) return [];

  // Issued notices only: planned ones (DRAFT) are not levied yet.
  return db.orm.public.LevyNotice
    .where((ln) => and(ln.schemeId.in(schemeIds), ln.status.neq("DRAFT")))
    .include("fund")
    .orderBy((ln) => ln.dueDate.desc())
    .limit(limit)
    .all();
}

/**
 * Get the next sequential levy notice number for a scheme.
 * Returns a formatted string like "LN-0001".
 */
export async function getNextNoticeNumber(schemeId: string): Promise<string> {
  try {
    const existing = await db.orm.public.LevyNotice
      .where((ln) => ln.schemeId.eq(schemeId))
      .orderBy((ln) => ln.noticeNumber.desc())
      .limit(1)
      .all();

    if (existing.length === 0) return "LN-0001";

    const last = String(existing[0].noticeNumber);
    const match = last.match(/(\d+)$/);
    const nextNum = match ? parseInt(match[1], 10) + 1 : 1;
    return `LN-${String(nextNum).padStart(4, "0")}`;
  } catch {
    // Table may not exist yet
    return "LN-0001";
  }
}
