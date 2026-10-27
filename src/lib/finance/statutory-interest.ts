/**
 * The late charge on an overdue levy notice (pure): NSW interest and the
 * Queensland penalty, from the building's `rules.LATE_CHARGE`.
 *
 * NSW (DAILY_SIMPLE_ANNUAL, `statutoryInterest`): simple interest at the
 * statutory rate on the unpaid levy (not on interest), accrued day by day from
 * the due date. Nothing is payable if the levy is paid in full within the
 * grace period. Accrual stops at write-off. A payment plan does not stop it.
 * Only a resolution of the owners corporation that the contribution bears no
 * interest removes it (SSMA 2015 s 85(3)); it cannot raise or lower the rate.
 *
 * Queensland (MONTHLY_SIMPLE_WHOLE_MONTHS, `monthlyPenalty`): simple interest
 * at the monthly rate the body corporate resolved, for each whole month the
 * contribution is in arrears after the date for payment, with no grace
 * period (Standard Module s 165). Payments go first to the penalty, then to
 * the contribution (s 166(5)).
 *
 * `lateCharge` picks the method and the building's setting.
 */
import type { StatutoryRules } from "@/config/statutory";
import type { Terms } from "@/lib/jurisdiction/wording";

/** An annual-rate interest rule: NSW's `rules.STATUTORY_INTEREST`, or the same values from `rules.LATE_CHARGE`. */
export interface InterestRule {
  annualRatePercent: number;
  graceMonths: number;
  source: string;
}

/** The late charge rule of a building's rule pack (`rules.LATE_CHARGE`). */
export type LateChargeRule = StatutoryRules["LATE_CHARGE"];

/** A building's late charge setting (`schemes.interest_mode`). */
export type LateChargeMode = LateChargeRule["modes"][number];

/** The order a payment is applied in (`rules.PAYMENT_ALLOCATION_ORDER`). */
export type PaymentAllocationOrder = StatutoryRules["PAYMENT_ALLOCATION_ORDER"];

export interface InterestInput {
  /** The levy amount on the notice, in cents (excluding interest). */
  levyCents: number;
  /** YYYY-MM-DD. */
  dueDate: string;
  /**
   * Payments in date order. Each is applied to the levy before interest (NSW) or to the penalty first (Queensland).
   * `lateChargeCents` (Queensland): the part of the payment recorded as applied to the penalty when it was received,
   * which the monthly penalty uses as it is, so the engine and the books agree.
   */
  payments: { date: string; amountCents: number; lateChargeCents?: number }[];
  /** YYYY-MM-DD the calculation runs to (inclusive of that day's interest up to, not including, it). */
  asAt: string;
  /** YYYY-MM-DD accrual stops (write-off), if any. A payment plan is not a reason to stop. */
  stopAt?: string | null;
  /** A resolution that the contribution bears no interest (or, for Queensland, no penalty applies). */
  noInterest?: boolean;
}

export interface InterestResult {
  interestCents: number;
  /** Days on which interest accrued (for a monthly penalty, the days of the whole months charged). */
  daysAccrued: number;
  /** YYYY-MM-DD the grace period ends (interest is payable only if unpaid after this). The due date where there is no grace. */
  graceEnds: string;
  /**
   * NOT_A_MONTH_IN_ARREARS (a monthly penalty only): past the due date, but no
   * whole month in arrears has passed with the contribution unpaid (none yet,
   * or it was paid within the first month).
   */
  reason: "ACCRUED" | "PAID_IN_GRACE" | "NOT_YET_DUE" | "IN_GRACE" | "NO_INTEREST_RESOLUTION" | "NOTHING_OWING" | "NOT_A_MONTH_IN_ARREARS";
  /** A monthly penalty only: the whole months charged. */
  monthsAccrued?: number;
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

/** Interest on one notice under the building's interest rule (`rules.STATUTORY_INTEREST`). */
export function statutoryInterest(input: InterestInput, rule: InterestRule): InterestResult {
  const rate = rule.annualRatePercent;
  const graceEnds = addMonths(input.dueDate, rule.graceMonths);
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

/** The most months counted on one notice (100 years), so a bad date cannot loop for ever. */
const MAX_MONTHS = 1200;

/**
 * A monthly penalty on one notice (MONTHLY_SIMPLE_WHOLE_MONTHS): simple
 * interest at `monthlyRatePercent` for each whole month the contribution is in
 * arrears after the date for payment, with no grace period.
 *
 * How months are counted. The k-th month in arrears ends on the k-th month
 * mark, `addMonths(dueDate, k)`, worked out from the due date each time (so
 * 31 January gives 28 February, then 31 March, not 28 March), and clamped to
 * the month end like the NSW grace period. A month is charged when, at its
 * mark, some of the contribution is still unpaid. A payment made on or before
 * a mark counts at that mark (paid on the mark is paid within the month).
 * The Standard Module's example holds: due 31 March, paid in full on 27 June,
 * the marks 30 April and 31 May are unpaid and 30 June is paid, so 2 months.
 *
 * When a mark counts:
 * - against `asAt`, only once it has passed (mark before `asAt`). On the mark
 *   day itself the owner can still pay within the month, so a run that day
 *   charges nothing for it: due 31 March, a run on 30 April charges no month,
 *   one on 1 May charges one. A charge posted on the mark day could otherwise
 *   not be taken back when the owner pays that day.
 * - against `stopAt` (write-off), up to and including the stop day: the
 *   month ending on the write-off day was all in arrears before it, as NSW
 *   interest counts the days before the stop day, and a charge made by a run
 *   after the write-off cannot be overtaken by a payment. Stopping on the
 *   as-at day changes nothing.
 *
 * At each mark the payments made by then are applied in date order, each
 * first to the penalty already charged for earlier months and then to the
 * contribution (s 166(5)); the month's penalty is then the unpaid
 * contribution times the rate, rounded half up to the cent. The penalty is
 * never charged on penalty. A negative amount (a correction) is added in, as
 * NSW interest sums payments: it first takes back any amount paid above the
 * contribution, then adds to what is unpaid of the contribution.
 *
 * The rate is read to 2 decimal places, as it is stored.
 */
export function monthlyPenalty(input: InterestInput, opts: { monthlyRatePercent: number }): InterestResult {
  const graceEnds = input.dueDate;
  const base = { graceEnds, daysAccrued: 0, interestCents: 0 };
  if (input.noInterest) return { ...base, reason: "NO_INTEREST_RESOLUTION" };
  if (input.levyCents <= 0) return { ...base, reason: "NOTHING_OWING" };
  if (input.asAt <= input.dueDate) return { ...base, reason: "NOT_YET_DUE" };
  const run = runMonthlyPenalty(input, opts.monthlyRatePercent);
  return { interestCents: run.penaltyCents, daysAccrued: run.daysAccrued, graceEnds, reason: run.months ? "ACCRUED" : "NOT_A_MONTH_IN_ARREARS", monthsAccrued: run.months };
}

/** Where a notice stands as `monthlyPenalty` works it out, payment by payment. */
interface MonthlyPenaltyRun {
  penaltyCents: number;
  /** The penalty charged and not yet paid. */
  penaltyOwing: number;
  /** The contribution not yet paid. */
  unpaid: number;
  overpaid: number;
  months: number;
  daysAccrued: number;
  /** The payments in date order, and how many of them were applied. */
  payments: { date: string; amountCents: number; lateChargeCents?: number }[];
  next: number;
}

/**
 * Apply one payment: to the penalty charged so far first, then the
 * contribution (SM s 166(5)). A negative amount is a correction. A payment
 * with its penalty part recorded is applied as recorded.
 */
function applyPenaltyFirst(run: MonthlyPenaltyRun, payment: { amountCents: number; lateChargeCents?: number }) {
  let amount = payment.amountCents;
  if (amount < 0) {
    const takenBack = Math.min(run.overpaid, -amount);
    run.overpaid -= takenBack;
    run.unpaid += -amount - takenBack;
    return;
  }
  const toPenalty = payment.lateChargeCents !== undefined ? Math.min(amount, Math.max(0, payment.lateChargeCents)) : Math.min(run.penaltyOwing, amount);
  run.penaltyOwing = Math.max(0, run.penaltyOwing - toPenalty);
  amount -= toPenalty;
  const toContribution = Math.min(run.unpaid, amount);
  run.unpaid -= toContribution;
  run.overpaid += amount - toContribution;
}

/** The month by month working of `monthlyPenalty` (see there), at a monthly rate. */
function runMonthlyPenalty(input: InterestInput, monthlyRatePercent: number): MonthlyPenaltyRun {
  // The rate in hundredths of a percent, so the sums are whole numbers.
  const rateHundredths = Math.max(0, Math.round(monthlyRatePercent * 100));
  const stopAt = input.stopAt || null;
  const run: MonthlyPenaltyRun = {
    penaltyCents: 0,
    penaltyOwing: 0,
    unpaid: input.levyCents,
    // Paid above the contribution and the penalty, which a later correction takes back first.
    overpaid: 0,
    months: 0,
    daysAccrued: 0,
    payments: [...input.payments].sort((a, b) => a.date.localeCompare(b.date)),
    next: 0,
  };
  for (let k = 1; k <= MAX_MONTHS; k++) {
    const mark = addMonths(input.dueDate, k);
    // A month counts once its mark has passed, and up to and including the write-off day.
    if (mark >= input.asAt || (stopAt && mark > stopAt)) break;
    // The payments made by this mark: the penalty so far first, then the contribution.
    for (; run.next < run.payments.length && run.payments[run.next].date <= mark; run.next++) applyPenaltyFirst(run, run.payments[run.next]);
    // Paid by this mark: no penalty for the month. Later marks are still looked at, as a correction can make it unpaid again.
    if (run.unpaid <= 0) continue;
    // unpaid x rate / 100, rounded half up to the cent.
    const month = Math.floor((2 * run.unpaid * rateHundredths + 10_000) / 20_000);
    run.penaltyCents += month;
    run.penaltyOwing += month;
    run.months += 1;
    run.daysAccrued += Math.round((toUtc(mark) - toUtc(addMonths(input.dueDate, k - 1))) / DAY_MS);
  }
  return run;
}

/**
 * Whether a building's payment order (`rules.PAYMENT_ALLOCATION_ORDER`)
 * applies a payment to the late charge before the levy: Queensland's penalty
 * first (SM s 166(5)). NSW applies the levy first, and so does no order.
 */
export function lateChargeFirst(order: PaymentAllocationOrder | null | undefined): boolean {
  if (!order) return false;
  const charge = order.indexOf("INTEREST");
  const levy = order.indexOf("LEVY");
  return charge >= 0 && levy >= 0 && charge < levy;
}

/**
 * The late charge paid on a notice, with payments applied to it first: the
 * parts recorded on its receipts that are not reversed, plus any amount paid
 * with no receipt (brought across at takeover, with the old system's late
 * charge paid), which is taken as paid to it first. Never more than was
 * charged or paid. All in cents. Receipting, owner credit and lotArrears all
 * use this one figure.
 */
export function lateChargePaidOnNotice(n: { paidCents: number; chargedCents: number; receiptedCents: number; recordedChargeCents: number }): number {
  const unreceipted = Math.max(0, n.paidCents - n.receiptedCents);
  return Math.max(0, Math.min(n.chargedCents, n.paidCents, n.recordedChargeCents + unreceipted));
}

/**
 * The part of a payment applied to a notice that goes to the late charge,
 * when the late charge is paid first. Never more than the late charge
 * charged and not yet paid (`chargedCents - chargePaidCents`), and never more
 * than had accrued by the payment's date less what payments by that date paid
 * (`accruedByDateCents - chargePaidByDateCents`), so a payment entered late
 * with an earlier date does not pay a penalty for months after it.
 */
export function lateChargePart(
  appliedCents: number,
  n: { chargedCents: number; chargePaidCents: number; accruedByDateCents: number; chargePaidByDateCents: number },
): number {
  return Math.max(0, Math.min(appliedCents, n.chargedCents - n.chargePaidCents, n.accruedByDateCents - n.chargePaidByDateCents));
}

/** A building's late charge setting: its mode and, for RESOLVED_RATE, the monthly rate. */
export interface LateChargeSetting {
  mode: string;
  monthlyRatePercent?: number | null;
}

/** The mode the building's setting gives under its pack. A mode the pack does not allow is read as the pack's default. */
export function effectiveLateChargeMode(rule: LateChargeRule, mode: string): LateChargeMode {
  return (rule.modes as readonly string[]).includes(mode) ? (mode as LateChargeMode) : rule.defaultMode;
}

/** The annual-rate rule within a DAILY_SIMPLE_ANNUAL late charge rule. */
function annualRule(rule: LateChargeRule): InterestRule | null {
  return rule.method === "DAILY_SIMPLE_ANNUAL" && rule.annualRatePercent != null
    ? { annualRatePercent: rule.annualRatePercent, graceMonths: rule.graceMonths, source: rule.source }
    : null;
}

/**
 * Whether the building's setting charges anything on overdue levies
 * (STATUTORY, or RESOLVED_RATE with a rate). A resolved rate that is not
 * above 0, or is above the pack's maximum, charges nothing (it fails closed:
 * such a rate cannot be saved, so one found stored is not relied on).
 */
export function lateChargeApplies(rule: LateChargeRule, setting: LateChargeSetting): boolean {
  const mode = effectiveLateChargeMode(rule, setting.mode);
  if (mode === "STATUTORY") return annualRule(rule) != null;
  if (mode === "RESOLVED_RATE") {
    const rate = setting.monthlyRatePercent;
    const max = rule.maxMonthlyRatePercent ?? 100;
    return rule.method === "MONTHLY_SIMPLE_WHOLE_MONTHS" && rate != null && Number.isFinite(rate) && rate > 0 && rate <= max;
  }
  return false;
}

/**
 * The late charge on one notice under the building's rule
 * (`rules.LATE_CHARGE`) and setting: STATUTORY is `statutoryInterest`,
 * NO_INTEREST and NONE charge nothing (reason NO_INTEREST_RESOLUTION), and
 * RESOLVED_RATE is `monthlyPenalty` at the building's resolved rate.
 */
export function lateCharge(input: InterestInput, rule: LateChargeRule, setting: LateChargeSetting): InterestResult {
  const mode = effectiveLateChargeMode(rule, setting.mode);
  const annual = annualRule(rule);
  const rate = setting.monthlyRatePercent ?? 0;
  const charges = !input.noInterest && lateChargeApplies(rule, setting);
  if (annual) return statutoryInterest({ ...input, noInterest: !charges || mode !== "STATUTORY" }, annual);
  return monthlyPenalty({ ...input, noInterest: !charges || mode !== "RESOLVED_RATE" }, { monthlyRatePercent: rate });
}

/** The order NSW has always applied payments in: levies, then interest, then recovery costs. */
const LEVY_FIRST: PaymentAllocationOrder = ["LEVY", "INTEREST", "RECOVERY_COSTS"];

/**
 * Split a payment between the levy, interest (the late charge) and recovery
 * costs, in the building's order (`rules.PAYMENT_ALLOCATION_ORDER`): NSW
 * applies levies first (2025 amendments), Queensland the penalty first
 * (SM s 166(5)). Without an order, levies first. Returns what is applied to
 * each and any excess.
 */
export function allocatePayment(
  paymentCents: number,
  owing: { levyCents: number; interestCents: number; recoveryCostsCents: number },
  order: PaymentAllocationOrder = LEVY_FIRST,
) {
  let left = paymentCents;
  const take = (owed: number) => {
    const t = Math.min(Math.max(owed, 0), left);
    left -= t;
    return t;
  };
  const owed = { LEVY: owing.levyCents, INTEREST: owing.interestCents, RECOVERY_COSTS: owing.recoveryCostsCents };
  const applied = { LEVY: 0, INTEREST: 0, RECOVERY_COSTS: 0 };
  for (const part of order) applied[part] += take(owed[part] - applied[part]);
  return { levyCents: applied.LEVY, interestCents: applied.INTEREST, recoveryCostsCents: applied.RECOVERY_COSTS, excessCents: left };
}

export type InterestSettingMode = LateChargeMode;

/** The words the setting check used before packs gave them (an annual-rate rule passed on its own). */
const ANNUAL_RULE_TERMS: Pick<Terms, "lateCharge" | "ownersCorporation"> = { lateCharge: "interest", ownersCorporation: "owners corporation" };

/**
 * The late charge rule, from `rules.LATE_CHARGE` or from an annual-rate rule
 * passed on its own (`rules.STATUTORY_INTEREST`, as NSW's tests pass it),
 * which is read as NSW's LATE_CHARGE is built from it.
 */
function asLateChargeRule(rule: LateChargeRule | InterestRule): LateChargeRule {
  if ("method" in rule) return rule;
  return {
    method: "DAILY_SIMPLE_ANNUAL",
    modes: ["STATUTORY", "NO_INTEREST"],
    defaultMode: "STATUTORY",
    resolutionRequiredFor: ["NO_INTEREST"],
    annualRatePercent: rule.annualRatePercent,
    maxMonthlyRatePercent: null,
    graceMonths: rule.graceMonths,
    source: rule.source,
  };
}

/** How a setting is offered in a choice ("Choose the statutory rate or no interest."). */
function modeChoice(mode: LateChargeMode, t: Pick<Terms, "lateCharge" | "ownersCorporation">): string {
  switch (mode) {
    case "STATUTORY":
      return "the statutory rate";
    case "RESOLVED_RATE":
      return `a ${t.lateCharge} at the rate the ${t.ownersCorporation} resolved`;
    default:
      return `no ${t.lateCharge}`;
  }
}

/** What a setting does, after "Charging" ("Charging no interest needs ..."). */
function modeCharging(mode: LateChargeMode, t: Pick<Terms, "lateCharge">): string {
  switch (mode) {
    case "STATUTORY":
      return "the statutory rate";
    case "RESOLVED_RATE":
      return `a ${t.lateCharge}`;
    default:
      return `no ${t.lateCharge}`;
  }
}

/** Whether a rate has more than 2 decimal places. */
const moreThanTwoDecimals = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) > 1e-6;

/**
 * The late charge setting a building may record, from its pack
 * (`rules.LATE_CHARGE`): one of the pack's modes; the recorded resolution for
 * a mode that needs one; and for RESOLVED_RATE a monthly rate above 0, at most
 * the pack's maximum, to 2 decimal places. Where the law fixes the rate (NSW)
 * no other rate, higher or lower, can be set (s 85(1) and (3)).
 * `terms` are the building's words (`rules.TERMINOLOGY`).
 */
export function interestSettingProblem(
  input: {
    mode: string;
    /** An annual rate, where the pack fixes one: it must be that rate. */
    ratePercent?: number | null;
    /** The resolved monthly rate (RESOLVED_RATE). */
    monthlyRatePercent?: number | null;
    resolutionMeetingId?: string | null;
    resolutionMotionId?: string | null;
  },
  pack: LateChargeRule | InterestRule,
  terms: Pick<Terms, "lateCharge" | "ownersCorporation"> = ANNUAL_RULE_TERMS,
): string | null {
  const rule = asLateChargeRule(pack);
  const t = terms;
  if (!(rule.modes as readonly string[]).includes(input.mode)) return `Choose ${rule.modes.map((m) => modeChoice(m, t)).join(" or ")}.`;
  const mode = input.mode as LateChargeMode;
  if (rule.annualRatePercent != null && input.ratePercent != null && input.ratePercent !== rule.annualRatePercent) {
    return `The ${t.lateCharge} rate is fixed at ${rule.annualRatePercent}% a year by ${rule.source}. The ${t.ownersCorporation} can only resolve to charge no ${t.lateCharge}.`;
  }
  if (mode === "RESOLVED_RATE") {
    const rate = input.monthlyRatePercent;
    const max = rule.maxMonthlyRatePercent ?? 100;
    if (rate == null || !Number.isFinite(rate) || rate <= 0) return `Enter the monthly ${t.lateCharge} rate the ${t.ownersCorporation} resolved, as a percentage more than 0.`;
    if (rate > max) return `The monthly ${t.lateCharge} rate can be at most ${max}%.`;
    if (moreThanTwoDecimals(rate)) return `Enter the monthly ${t.lateCharge} rate with no more than 2 decimal places.`;
  }
  if (rule.resolutionRequiredFor.includes(mode) && (!input.resolutionMeetingId || !input.resolutionMotionId)) {
    return `Charging ${modeCharging(mode, t)} needs the general meeting resolution that decided it. Choose the meeting and motion.`;
  }
  return null;
}
