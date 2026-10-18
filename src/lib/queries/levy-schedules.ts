import { db } from "@/prisma/db";
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
  return db.orm.public.LevySchedule
    .where((ls) => ls.id.eq(scheduleId))
    .include("fund")
    .include("levyNotices", (ln) => ln.include("lot").include("fund"))
    .first();
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
}) {
  return db.orm.public.LevySchedule.create({
    schemeId: data.schemeId,
    fundId: data.fundId,
    financialYear: data.financialYear,
    budgetAmount: toNumeric(data.budgetAmount),
    frequency: data.frequency,
    totalLots: data.totalLots,
    totalEntitlement: toNumeric<10, 2>(data.totalEntitlement),
    status: "DRAFT",
  });
}

/**
 * Approve a levy schedule — sets status to APPROVED with timestamp and approver.
 */
export async function approveLevySchedule(scheduleId: string, approvedBy: string) {
  return db.orm.public.LevySchedule
    .where({ id: scheduleId })
    .update({
      status: "APPROVED",
      approvedAt: toTimestamp(new Date().toISOString()),
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
  return db.orm.public.LevySchedule
    .where({ id: scheduleId })
    .update({ status: "SUPERSEDED" });
}

// ─── Levy Notice Queries ───────────────────────────────────────

/**
 * Fetch all levy notices for a schedule, with lot details. Ordered by noticeNumber.
 */
export async function getLevyNoticesForSchedule(scheduleId: string, limit = 500) {
  return db.orm.public.LevyNotice
    .where((ln) => ln.levyScheduleId.eq(scheduleId))
    .include("lot")
    .include("fund")
    .orderBy((ln) => ln.noticeNumber.asc())
    .limit(limit)
    .all();
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
  ownerId: string;
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
    ownerId: string;
    fundId: string;
    noticeNumber: string;
    periodStart: string;
    periodEnd: string;
    dueDate: string;
    amountDue: number;
  }>,
) {
  if (notices.length === 0) return [];

  return db.transaction(async (tx) => {
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
export async function issueLevyNotice(noticeId: string) {
  return db.orm.public.LevyNotice
    .where({ id: noticeId })
    .update({
      status: "ISSUED",
      issuedAt: toTimestamp(new Date().toISOString()),
    });
}

/**
 * Record a payment against a levy notice.
 * Adds the payment amount to amountPaid, recalculates balanceOutstanding,
 * and updates status to PARTIALLY_PAID or PAID accordingly.
 */
export async function recordLevyPayment(noticeId: string, paymentAmount: number) {
  const notice = await db.orm.public.LevyNotice
    .where({ id: noticeId })
    .first();

  if (!notice) {
    throw new Error(`Levy notice not found: ${noticeId}`);
  }

  const currentPaid = Number(notice.amountPaid);
  const totalDue = Number(notice.amountDue);
  const newPaid = currentPaid + paymentAmount;
  const newBalance = totalDue - newPaid;
  const isPaidInFull = newBalance <= 0;

  const updateData: Record<string, unknown> = {
    amountPaid: toNumeric(newPaid),
    balanceOutstanding: toNumeric(Math.max(0, newBalance)),
    status: isPaidInFull ? "PAID" : "PARTIALLY_PAID",
  };

  if (isPaidInFull) {
    updateData.paidInFullAt = toTimestamp(new Date().toISOString());
  }

  return db.orm.public.LevyNotice
    .where({ id: noticeId })
    .update(updateData);
}

/**
 * Fetch overdue levy notices for a scheme.
 * Returns notices with status ISSUED or PARTIALLY_PAID where dueDate is in the past.
 */
export async function getOverdueLevyNotices(schemeId: string, limit = 500) {
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
}

/**
 * Get the next sequential levy notice number for a scheme.
 * Returns a formatted string like "LN-0001".
 */
export async function getNextNoticeNumber(schemeId: string): Promise<string> {
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
}
