/**
 * Statutory interest on an overdue levy notice (pure).
 *
 * Simple interest at the statutory rate on the unpaid levy (not on interest),
 * accrued day by day from the due date. Nothing is payable if the levy is
 * paid in full within the grace period. Accrual stops at write-off. A payment
 * plan does not stop it. Only a resolution of the owners corporation that the
 * contribution bears no interest removes it (SSMA 2015 s 85(3)); it cannot
 * raise or lower the rate.
 */
import { STATUTORY_INTEREST } from "@/config/statutory";

export interface InterestInput {
  /** The levy amount on the notice, in cents (excluding interest). */
  levyCents: number;
  /** YYYY-MM-DD. */
  dueDate: string;
  /** Payments in date order. Each is applied to the levy before interest. */
  payments: { date: string; amountCents: number }[];
  /** YYYY-MM-DD the calculation runs to (inclusive of that day's interest up to, not including, it). */
  asAt: string;
  /** YYYY-MM-DD accrual stops (write-off), if any. A payment plan is not a reason to stop. */
  stopAt?: string | null;
  /** A resolution that the contribution bears no interest. */
  noInterest?: boolean;
  annualRatePercent?: number;
  graceMonths?: number;
}

export interface InterestResult {
  interestCents: number;
  /** Days on which interest accrued. */
  daysAccrued: number;
  /** YYYY-MM-DD the grace period ends (interest is payable only if unpaid after this). */
  graceEnds: string;
  reason: "ACCRUED" | "PAID_IN_GRACE" | "NOT_YET_DUE" | "IN_GRACE" | "NO_INTEREST_RESOLUTION" | "NOTHING_OWING";
}

const DAY_MS = 86_400_000;
const toUtc = (day: string) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
const fromUtc = (t: number) => new Date(t).toISOString().slice(0, 10);

/** The same day `months` later, clamped to the month end (31 Jan plus one month is 28 or 29 Feb). */
export function addMonths(day: string, months: number): string {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7)) - 1 + months;
  const d = Number(day.slice(8, 10));
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return fromUtc(Date.UTC(y, m, Math.min(d, last)));
}

export function statutoryInterest(input: InterestInput): InterestResult {
  const rate = input.annualRatePercent ?? STATUTORY_INTEREST.annualRatePercent;
  const graceEnds = addMonths(input.dueDate, input.graceMonths ?? STATUTORY_INTEREST.graceMonths);
  const base = { graceEnds, daysAccrued: 0, interestCents: 0 };

  if (input.noInterest) return { ...base, reason: "NO_INTEREST_RESOLUTION" };
  if (input.levyCents <= 0) return { ...base, reason: "NOTHING_OWING" };
  if (input.asAt <= input.dueDate) return { ...base, reason: "NOT_YET_DUE" };

  const payments = [...input.payments].sort((a, b) => a.date.localeCompare(b.date));
  const paidBy = (day: string) => payments.filter((p) => p.date <= day).reduce((s, p) => s + p.amountCents, 0);

  // s 85(2): no interest if paid in full within the grace period.
  if (paidBy(graceEnds) >= input.levyCents) return { ...base, reason: "PAID_IN_GRACE" };
  if (input.asAt <= graceEnds) return { ...base, reason: "IN_GRACE" };

  // Accrue day by day from the due date on the unpaid levy, until paid, stopped or asAt.
  const end = input.stopAt && input.stopAt < input.asAt ? input.stopAt : input.asAt;
  let principalDays = 0; // sum of unpaid levy cents over each day
  let days = 0;
  for (let t = toUtc(input.dueDate); t < toUtc(end); t += DAY_MS) {
    const day = fromUtc(t);
    const unpaid = Math.max(0, input.levyCents - paidBy(day));
    if (unpaid === 0) break;
    principalDays += unpaid;
    days += 1;
  }
  // Simple interest: unpaid x rate x days / 365, rounded once to the cent.
  const interestCents = Math.round((principalDays * rate) / 100 / 365);
  return { interestCents, daysAccrued: days, graceEnds, reason: "ACCRUED" };
}

/**
 * Split a payment between the levy, interest and recovery costs, in that
 * order (2025 amendments). Returns what is applied to each and any excess.
 */
export function allocatePayment(
  paymentCents: number,
  owing: { levyCents: number; interestCents: number; recoveryCostsCents: number },
) {
  let left = paymentCents;
  const take = (owed: number) => {
    const t = Math.min(Math.max(owed, 0), left);
    left -= t;
    return t;
  };
  const levy = take(owing.levyCents);
  const interest = take(owing.interestCents);
  const recoveryCosts = take(owing.recoveryCostsCents);
  return { levyCents: levy, interestCents: interest, recoveryCostsCents: recoveryCosts, excessCents: left };
}

export type InterestSettingMode = "STATUTORY" | "NO_INTEREST";

/**
 * The interest setting a scheme may record. Only the statutory rate or no
 * interest (by recorded resolution) is allowed: the owners corporation cannot
 * set any other rate, higher or lower (s 85(1) and (3)).
 */
export function interestSettingProblem(input: {
  mode: string;
  ratePercent?: number | null;
  resolutionMeetingId?: string | null;
  resolutionMotionId?: string | null;
}): string | null {
  if (input.mode !== "STATUTORY" && input.mode !== "NO_INTEREST") return "Choose the statutory rate or no interest.";
  if (input.ratePercent != null && input.ratePercent !== STATUTORY_INTEREST.annualRatePercent) {
    return `The interest rate is fixed at ${STATUTORY_INTEREST.annualRatePercent}% a year by ${STATUTORY_INTEREST.source}. The owners corporation can only resolve to charge no interest.`;
  }
  if (input.mode === "NO_INTEREST" && (!input.resolutionMeetingId || !input.resolutionMotionId)) {
    return "Charging no interest needs the general meeting resolution that decided it. Choose the meeting and motion.";
  }
  return null;
}
