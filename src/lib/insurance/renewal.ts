/**
 * Renewal timing helpers (pure, no DB): reminder windows and detection of a
 * gap or overlap between an expiring policy and its successor.
 */

const DAY_MS = 86_400_000;

function startOfDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function wholeDaysBetween(from: Date, to: Date): number {
  return Math.round(
    (startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS,
  );
}

/** The date a renewal reminder should first fire, `leadDays` before expiry. */
export function reminderDate(policyEndDate: Date, leadDays: number): Date {
  const d = startOfDay(policyEndDate);
  d.setUTCDate(d.getUTCDate() - Math.max(0, Math.floor(leadDays)));
  return d;
}

/**
 * Whether a renewal is due to be started: the reminder window has opened and
 * the policy has not yet expired by more than a grace period.
 */
export function isRenewalDue(
  policyEndDate: Date,
  leadDays: number,
  now: Date = new Date(),
): boolean {
  const remind = reminderDate(policyEndDate, leadDays);
  return now.getTime() >= remind.getTime();
}

export type DateContinuity = "CONTIGUOUS" | "GAP" | "OVERLAP";

export interface ContinuityResult {
  type: DateContinuity;
  /** Number of days of gap or overlap (0 when contiguous). */
  days: number;
}

/**
 * Compare an expiring policy's end date with the successor's start date.
 * A successor that starts the day after expiry is CONTIGUOUS (no gap). A later
 * start is a GAP; an earlier or same start is an OVERLAP. Both are flagged for
 * review rather than silently accepted.
 */
export function detectContinuity(
  expiringEnd: Date,
  successorStart: Date,
): ContinuityResult {
  const dayAfterExpiry = startOfDay(expiringEnd);
  dayAfterExpiry.setUTCDate(dayAfterExpiry.getUTCDate() + 1);
  const diff = wholeDaysBetween(dayAfterExpiry, startOfDay(successorStart));
  if (diff === 0) return { type: "CONTIGUOUS", days: 0 };
  if (diff > 0) return { type: "GAP", days: diff };
  return { type: "OVERLAP", days: Math.abs(diff) };
}
