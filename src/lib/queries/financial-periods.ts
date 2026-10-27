import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString, Varchar } from "@prisma/orm-postgres/target/codec-types";

/** Cast an ISO string to the Prisma 8 TimestampString branded type. */
function toTimestamp(value: string): TimestampString<3> {
  return value as unknown as TimestampString<3>;
}

/** Cast a plain string to the Prisma 8 Varchar branded type. */
function toVarchar<N extends number>(value: string): Varchar<N> {
  return value as unknown as Varchar<N>;
}

/**
 * Fetch all financial periods for a scheme, newest first by start date.
 */
export async function getFinancialPeriodsForScheme(
  schemeId: string,
  limit = 50,
  /** A transaction's `tx.orm`, to read inside it. */
  orm: typeof db.orm = db.orm,
) {
  return orm.public.FinancialPeriod
    .where((fp) => fp.schemeId.eq(schemeId))
    .orderBy((fp) => fp.startDate.desc())
    .limit(limit)
    .all();
}

/**
 * Fetch a single financial period by ID.
 */
export async function getFinancialPeriodById(periodId: string) {
  try {
    return db.orm.public.FinancialPeriod
      .where((fp) => fp.id.eq(periodId))
      .first();
  } catch {
    // Table may not exist yet
    return null;
  }
}

/**
 * Fetch all OPEN periods for a scheme, ordered by start date ascending.
 */
export async function getOpenPeriods(schemeId: string, limit = 50) {
  try {
    return db.orm.public.FinancialPeriod
      .where((fp) => and(fp.schemeId.eq(schemeId), fp.status.eq("OPEN")))
      .orderBy((fp) => fp.startDate.asc())
      .limit(limit)
      .all();
  } catch {
    // Table may not exist yet
    return [];
  }
}

/**
 * Find the current open period for a scheme (where today falls between
 * startDate and endDate). Returns null if no matching period exists.
 */
export async function getCurrentPeriod(schemeId: string) {
  try {
    const openPeriods = await getOpenPeriods(schemeId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return (
      openPeriods.find((p) => {
        const start = new Date(p.startDate);
        const end = new Date(p.endDate);
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);
        return start <= today && end >= today;
      }) ?? null
    );
  } catch {
    // Table may not exist yet
    return [];
  }
}

/**
 * Create a new financial period.
 */
export async function createFinancialPeriod(data: {
  schemeId: string;
  name: string;
  startDate: string;
  endDate: string;
  periodType: string;
}) {
  return db.orm.public.FinancialPeriod.create({
    schemeId: data.schemeId,
    name: toVarchar<100>(data.name),
    startDate: toTimestamp(data.startDate),
    endDate: toTimestamp(data.endDate),
    periodType: data.periodType,
  });
}

/**
 * Close a financial period, recording who closed it and when.
 */
export async function closePeriod(schemeId: string, periodId: string, closedBy: string) {
  // Scheme-scoped and only from OPEN: returns null otherwise.
  return db.orm.public.FinancialPeriod
    .where((p) => and(p.id.eq(periodId), p.schemeId.eq(schemeId), p.status.eq("OPEN")))
    .update({
      status: "CLOSED",
      closedAt: toTimestamp(new Date().toISOString()),
      closedBy,
    });
}

/**
 * Lock a closed financial period (prevents any further changes).
 * Scheme-scoped and only from CLOSED: returns null otherwise.
 */
export async function lockPeriod(schemeId: string, periodId: string) {
  return db.orm.public.FinancialPeriod
    .where((p) => and(p.id.eq(periodId), p.schemeId.eq(schemeId), p.status.eq("CLOSED")))
    .update({ status: "LOCKED" });
}

/**
 * Reopen a closed period. A LOCKED period cannot be reopened here.
 * Scheme-scoped and only from CLOSED: returns null otherwise.
 */
export async function reopenPeriod(schemeId: string, periodId: string) {
  return db.orm.public.FinancialPeriod
    .where((p) => and(p.id.eq(periodId), p.schemeId.eq(schemeId), p.status.eq("CLOSED")))
    .update({
      status: "OPEN",
      closedAt: null,
      closedBy: null,
    });
}

/**
 * Generate 12 monthly financial periods for a financial year.
 *
 * @param schemeId - The scheme to create periods for
 * @param financialYearStart - ISO date string for the year start (e.g. "2026-07-01")
 * @param financialYearEnd - ISO date string for the year end (e.g. "2027-06-30")
 */
export async function generateMonthlyPeriods(
  schemeId: string,
  financialYearStart: string,
  financialYearEnd: string,
) {
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const start = new Date(financialYearStart);
  const end = new Date(financialYearEnd);
  const periods: Array<{
    name: string;
    startDate: string;
    endDate: string;
  }> = [];

  const current = new Date(start);
  while (current <= end) {
    const year = current.getFullYear();
    const month = current.getMonth();
    const periodName = `${monthNames[month]} ${year}`;

    // Last day of this month
    const lastDay = new Date(year, month + 1, 0);
    // Don't exceed financial year end
    const periodEnd = lastDay > end ? end : lastDay;

    const startStr = current.toISOString().split("T")[0];
    const endStr = periodEnd.toISOString().split("T")[0];

    periods.push({ name: periodName, startDate: startStr, endDate: endStr });

    // Move to first day of next month
    current.setMonth(current.getMonth() + 1);
    current.setDate(1);
  }

  return db.transaction(async (tx) => {
    const created = [];
    for (const period of periods) {
      const record = await tx.orm.public.FinancialPeriod.create({
        schemeId,
        name: toVarchar<100>(period.name),
        startDate: toTimestamp(period.startDate),
        endDate: toTimestamp(period.endDate),
        periodType: "MONTH",
      });
      created.push(record);
    }
    return created;
  });
}
