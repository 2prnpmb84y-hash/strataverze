/**
 * Levy notice planning (pure, no I/O).
 *
 * Works out the notices a levy schedule raises: one per lot per instalment,
 * in proportion to unit entitlement. Amounts are allocated in whole cents so
 * that every lot's instalments add up to its share exactly and all shares add
 * up to the levy total exactly.
 */

export type LevyFrequency = "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "ANNUALLY" | "ONE_OFF";

export const INSTALMENTS_PER_YEAR: Record<LevyFrequency, number> = {
  MONTHLY: 12,
  QUARTERLY: 4,
  HALF_YEARLY: 2,
  ANNUALLY: 1,
  ONE_OFF: 1,
};

export const FREQUENCY_LABELS: Record<string, string> = {
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  HALF_YEARLY: "Half-yearly",
  ANNUALLY: "Annually",
  ONE_OFF: "One-off",
};

export interface PlanLot {
  lotId: string;
  lotNumber: string;
  entitlement: number;
  ownerId: string | null;
}

export interface PlannedNotice {
  lotId: string;
  lotNumber: string;
  ownerId: string | null;
  instalment: number;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;
  dueDate: string;
  amountCents: number;
}

/** Format a UTC date as YYYY-MM-DD. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** A database date or timestamp (string or Date) as YYYY-MM-DD. */
export function toIsoDay(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return isNaN(value.getTime()) ? "" : isoDate(value);
  const str = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const d = new Date(str);
  return isNaN(d.getTime()) ? "" : isoDate(d);
}

function parseIso(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Add whole months, clamping to the last day of the target month. */
export function addMonths(date: string, months: number): string {
  const d = parseIso(date);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return isoDate(target);
}

export function addDays(date: string, days: number): string {
  const d = parseIso(date);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

/**
 * First day of the financial year that starts in calendar year `year`, given
 * the scheme's year-end as "MM-DD" (e.g. "06-30" gives 1 July of `year`).
 */
export function financialYearStart(year: number, financialYearEnd: string): string {
  const [mm, dd] = (financialYearEnd || "06-30").split("-").map(Number);
  const dayAfterEnd = addDays(isoDate(new Date(Date.UTC(year, mm - 1, dd))), 1);
  // Keep the start inside `year` (a 31 December year-end starts on 1 January).
  return dayAfterEnd.startsWith(String(year)) ? dayAfterEnd : addDays(isoDate(new Date(Date.UTC(year - 1, mm - 1, dd))), 1);
}

/**
 * Split `totalCents` across weights using the largest remainder method, so the
 * parts are whole cents, proportional to the weights, and sum to the total.
 */
export function allocateCents(totalCents: number, weights: number[]): number[] {
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum <= 0) throw new Error("Weights must sum to more than zero.");
  const exact = weights.map((w) => (totalCents * w) / weightSum);
  const floors = exact.map((x) => Math.floor(x));
  let remainder = totalCents - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floors[i] += 1;
    remainder -= 1;
  }
  return floors;
}

export interface PlanIssue {
  kind: "ENTITLEMENT_MISMATCH" | "NO_LOTS" | "ZERO_AMOUNT";
  message: string;
}

/** Checks that must pass before notices can be issued. */
export function checkPlan(input: {
  lots: PlanLot[];
  totalEntitlement: number;
  totalCents: number;
}): PlanIssue[] {
  const issues: PlanIssue[] = [];
  if (input.lots.length === 0) {
    issues.push({ kind: "NO_LOTS", message: "No lots are registered for this scheme." });
  }
  if (input.totalCents <= 0) {
    issues.push({ kind: "ZERO_AMOUNT", message: "The levy amount must be greater than zero." });
  }
  const registered = input.lots.reduce((a, l) => a + l.entitlement, 0);
  if (input.lots.length > 0 && registered !== input.totalEntitlement) {
    issues.push({
      kind: "ENTITLEMENT_MISMATCH",
      message: `Registered lots hold ${registered} unit entitlement, but the schedule's total is ${input.totalEntitlement}. Register every lot (or correct the total) so each lot is levied its proper share.`,
    });
  }
  return issues;
}

/**
 * Plan the notices for a schedule. `firstDueDate` is the due date of the first
 * instalment; later instalments fall due at the same interval as the periods.
 */
export function planNotices(input: {
  lots: PlanLot[];
  totalCents: number;
  frequency: LevyFrequency;
  periodStart: string;
  firstDueDate: string;
}): PlannedNotice[] {
  const count = INSTALMENTS_PER_YEAR[input.frequency] ?? 1;
  const months = input.frequency === "ONE_OFF" ? 0 : 12 / count;
  const lotShares = allocateCents(
    input.totalCents,
    input.lots.map((l) => l.entitlement),
  );

  const notices: PlannedNotice[] = [];
  input.lots.forEach((lot, li) => {
    const instalments = allocateCents(lotShares[li], Array(count).fill(1));
    for (let k = 0; k < count; k++) {
      const start = input.frequency === "ONE_OFF" ? input.periodStart : addMonths(input.periodStart, k * months);
      const end =
        input.frequency === "ONE_OFF"
          ? input.firstDueDate
          : addDays(addMonths(input.periodStart, (k + 1) * months), -1);
      notices.push({
        lotId: lot.lotId,
        lotNumber: lot.lotNumber,
        ownerId: lot.ownerId,
        instalment: k + 1,
        periodStart: start,
        periodEnd: end,
        dueDate: addMonths(input.firstDueDate, k * months),
        amountCents: instalments[k],
      });
    }
  });
  return notices;
}

export const toCents = (amount: number | string) => Math.round(Number(amount) * 100);
export const fromCents = (cents: number) => cents / 100;
