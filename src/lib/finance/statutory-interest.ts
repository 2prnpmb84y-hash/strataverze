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
 * VIC, ACT and WA (ANNUAL_RATE, `annualRateLateCharge`; stage 2, PR 5):
 * interest at an annual rate, the statutory rate or one a resolution set
 * within the pack's range, worked out day by day exactly as the pack's
 * `annual` rule records. Any value it needs that the pack does not hold as
 * checked (CONFIRMED or a StrataVerze choice) stops the charge: nothing is
 * charged and the result says what is missing (fails closed). A waiver
 * recorded for the notice is applied where the pack gives one.
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

/** An annual-rate late charge rule (`rules.LATE_CHARGE.annual`; VIC, ACT and WA). */
export type AnnualLateChargeRule = NonNullable<LateChargeRule["annual"]>;

/** What a waiver in a particular case may do (`rules.LATE_CHARGE.annual.waiver.kinds`). */
export type LateChargeWaiverKind = NonNullable<AnnualLateChargeRule["waiver"]>["kinds"][number];

/**
 * A waiver recorded for one notice (`late_charge_waivers`): the whole late
 * charge on it, an amount of it, or the days of a period (first and last
 * day, both included).
 */
export interface LateChargeWaiver {
  kind: LateChargeWaiverKind;
  amountCents?: number | null;
  fromDate?: string | null;
  toDate?: string | null;
}

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
  reason:
    | "ACCRUED"
    | "PAID_IN_GRACE"
    | "NOT_YET_DUE"
    | "IN_GRACE"
    | "NO_INTEREST_RESOLUTION"
    | "NOTHING_OWING"
    | "NOT_A_MONTH_IN_ARREARS"
    | "WAIVED"
    | "RULE_NOT_CONFIRMED";
  /** A monthly penalty only: the whole months charged. */
  monthsAccrued?: number;
  /** An annual-rate late charge only (RULE_NOT_CONFIRMED): the rule values the pack does not hold as checked, so nothing is charged. */
  missing?: string[];
  /** An annual-rate late charge only: the cents a recorded waiver took off, and the days it left out. */
  waivedCents?: number;
  waivedDays?: number;
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

/** A building's late charge setting: its mode and, for RESOLVED_RATE, the monthly rate (RESOLVED_ANNUAL_RATE, the annual rate). */
export interface LateChargeSetting {
  mode: string;
  monthlyRatePercent?: number | null;
  annualRatePercent?: number | null;
}

/**
 * What else an annual-rate late charge reads (ignored by NSW and Queensland):
 * the building's payment order and the waivers recorded for the notice.
 */
export interface LateChargeContext {
  order?: PaymentAllocationOrder | null;
  waivers?: readonly LateChargeWaiver[];
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
 * An annual-rate rule (VIC, ACT and WA) charges only with every value it
 * needs checked and a rate above 0, under the building's payment `order`
 * where given (see annualRateLateCharge).
 */
export function lateChargeApplies(rule: LateChargeRule, setting: LateChargeSetting, order?: PaymentAllocationOrder | null): boolean {
  if (rule.annual) {
    const plan = annualRatePlan(rule, setting, order);
    return plan.rate != null && plan.missing.length === 0 && plan.rate.ratePercent > 0;
  }
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
 * RESOLVED_RATE is `monthlyPenalty` at the building's resolved rate. An
 * annual-rate rule (`annual`, VIC, ACT and WA) is `annualRateLateCharge`,
 * which reads `context` (the payment order and the notice's waivers); NSW
 * and Queensland never read it.
 */
export function lateCharge(input: InterestInput, rule: LateChargeRule, setting: LateChargeSetting, context: LateChargeContext = {}): InterestResult {
  if (rule.annual) return annualRateLateCharge(input, rule, setting, context);
  const mode = effectiveLateChargeMode(rule, setting.mode);
  const annual = annualRule(rule);
  const rate = setting.monthlyRatePercent ?? 0;
  const charges = !input.noInterest && lateChargeApplies(rule, setting);
  if (annual) return statutoryInterest({ ...input, noInterest: !charges || mode !== "STATUTORY" }, annual);
  return monthlyPenalty({ ...input, noInterest: !charges || mode !== "RESOLVED_RATE" }, { monthlyRatePercent: rate });
}

// ─── Annual rate (VIC, ACT and WA stage 2, PR 5) ──────────────────────────

/** Whether a rate has more than 2 decimal places. */
const moreThanTwoDecimals = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) > 1e-6;

/** The rate a resolution recorded falls within the pack's range (and has at most 2 decimal places); false where a bound is not confirmed. */
export function annualRateInRange(annual: AnnualLateChargeRule, rate: number | null | undefined): boolean {
  const r = annual.resolvedRate;
  if (!r || r.minPercent.value == null || r.maxPercent.value == null || rate == null || !Number.isFinite(rate) || moreThanTwoDecimals(rate)) return false;
  return rate >= r.minPercent.value && (r.maxInclusive ? rate <= r.maxPercent.value : rate < r.maxPercent.value);
}

/** What an annual-rate late charge would run on: the rate and how it accrues, or what is missing. */
interface AnnualRatePlan {
  mode: LateChargeMode;
  rate: { ratePercent: number; graceMonths: number; daysInYear: number } | null;
  /** The rule values (or setting) it needs that have no checked value. Empty for a mode that charges nothing. */
  missing: string[];
}

/**
 * The rate and accrual an annual-rate setting charges at. STATUTORY needs the
 * pack's statutory rate; RESOLVED_ANNUAL_RATE needs who decides, both bounds
 * and a recorded rate within them (a rate found stored outside them is not
 * relied on). Both need every accrual value. A payment order that pays the
 * late charge before the levy is not one this engine applies, so it is
 * refused too. NO_INTEREST and NONE charge nothing and need nothing.
 */
function annualRatePlan(rule: LateChargeRule, setting: LateChargeSetting, order?: PaymentAllocationOrder | null): AnnualRatePlan {
  const annual = rule.annual!;
  const mode = effectiveLateChargeMode(rule, setting.mode);
  if (mode !== "STATUTORY" && mode !== "RESOLVED_ANNUAL_RATE") return { mode, rate: null, missing: [] };
  const missing: string[] = [];
  let ratePercent: number | null = null;
  if (mode === "STATUTORY") {
    ratePercent = annual.statutoryRatePercent?.value ?? null;
    if (ratePercent == null) missing.push("statutoryRatePercent");
  } else {
    const r = annual.resolvedRate;
    if (!r) missing.push("resolvedRate");
    else {
      if (r.resolution.value == null) missing.push("resolvedRate.resolution");
      if (r.minPercent.value == null) missing.push("resolvedRate.minPercent");
      if (r.maxPercent.value == null) missing.push("resolvedRate.maxPercent");
      if (r.minPercent.value != null && r.maxPercent.value != null && !annualRateInRange(annual, setting.annualRatePercent)) missing.push("resolvedRatePercent");
    }
    ratePercent = setting.annualRatePercent ?? null;
  }
  const a = annual.accrual;
  if (a.from.value == null) missing.push("accrual.from");
  if (a.graceMonths.value == null) missing.push("accrual.graceMonths");
  if (a.simple.value == null) missing.push("accrual.simple");
  if (a.daysInYear.value == null || !(a.daysInYear.value > 0)) missing.push("accrual.daysInYear");
  if (lateChargeFirst(order)) missing.push("paymentAllocationOrder");
  if (missing.length > 0 || ratePercent == null || a.graceMonths.value == null || a.daysInYear.value == null) return { mode, rate: null, missing };
  return { mode, rate: { ratePercent, graceMonths: a.graceMonths.value, daysInYear: a.daysInYear.value }, missing };
}

/** The rule values an annual-rate setting needs and the pack does not hold as checked (empty where it can charge, or charges nothing). */
export function annualLateChargeMissing(rule: LateChargeRule, setting: LateChargeSetting, order?: PaymentAllocationOrder | null): string[] {
  return rule.annual ? annualRatePlan(rule, setting, order).missing : [];
}

/** The annual rate a building's setting charges at (the statutory or the resolved rate), or null where it charges none or cannot. */
export function annualLateChargeRate(rule: LateChargeRule, setting: LateChargeSetting, order?: PaymentAllocationOrder | null): number | null {
  if (!rule.annual) return null;
  const plan = annualRatePlan(rule, setting, order);
  return plan.missing.length === 0 ? (plan.rate?.ratePercent ?? null) : null;
}

/** Whether a day falls in a waived period (first and last day included). */
const inPeriod = (day: string, w: LateChargeWaiver) => w.kind === "PERIOD" && !!w.fromDate && !!w.toDate && day >= w.fromDate && day <= w.toDate;

/**
 * Interest at an annual rate on one notice (method ANNUAL_RATE).
 *
 * How it is worked out:
 * - from the due date, day by day, on the levy unpaid at the end of each day
 *   (simple interest: never on interest), until it is paid, accrual stops
 *   (write-off) or the as-at day, which is not counted. A levy paid on its
 *   due date bears none; paid the day after, one day. This is how NSW
 *   interest counts days;
 * - nothing if it is paid in full within the pack's grace period (none in
 *   WA). With no grace period, a levy paid in full by its due date has
 *   nothing owing;
 * - payments are applied to the levy first, as the pack's order says (an
 *   order that pays the late charge first is refused, see annualRatePlan);
 * - a day's interest is the unpaid levy times the rate divided by the pack's
 *   days in a year. The days are summed in whole cents and the total is
 *   rounded once, half up, to the cent (exact, in whole numbers), as NSW
 *   interest is rounded once;
 * - a recorded waiver: WHOLE waives everything on the notice; PERIOD leaves
 *   its days out (they still count as unpaid, so a waived period never
 *   moves the grace period); AMOUNT takes the amount off the total, never
 *   below 0.
 */
export function annualRateLateCharge(input: InterestInput, rule: LateChargeRule, setting: LateChargeSetting, context: LateChargeContext = {}): InterestResult {
  const plan = annualRatePlan(rule, setting, context.order);
  const graceMonths = plan.rate?.graceMonths ?? rule.annual?.accrual.graceMonths.value ?? 0;
  const graceEnds = addMonths(input.dueDate, graceMonths);
  const base = { graceEnds, daysAccrued: 0, interestCents: 0 };
  if (plan.missing.length > 0) return { ...base, reason: "RULE_NOT_CONFIRMED", missing: plan.missing };
  if (input.noInterest || !plan.rate || plan.rate.ratePercent <= 0) return { ...base, reason: "NO_INTEREST_RESOLUTION" };
  if (input.levyCents <= 0) return { ...base, reason: "NOTHING_OWING" };
  if (input.asAt <= input.dueDate) return { ...base, reason: "NOT_YET_DUE" };

  const payments = [...input.payments].sort((a, b) => a.date.localeCompare(b.date));
  const paidBy = (day: string) => payments.filter((p) => p.date <= day).reduce((s, p) => s + p.amountCents, 0);
  if (paidBy(graceEnds) >= input.levyCents) return { ...base, reason: graceMonths > 0 ? "PAID_IN_GRACE" : "NOTHING_OWING" };
  if (input.asAt <= graceEnds) return { ...base, reason: "IN_GRACE" };

  const waivers = context.waivers ?? [];
  if (waivers.some((w) => w.kind === "WHOLE")) return { ...base, reason: "WAIVED" };

  const end = input.stopAt && input.stopAt < input.asAt ? input.stopAt : input.asAt;
  let principalDays = BigInt(0);
  let days = 0;
  let waivedDays = 0;
  for (let t = toUtc(input.dueDate); t < toUtc(end); t += DAY_MS) {
    const day = fromUtc(t);
    const unpaid = Math.max(0, input.levyCents - paidBy(day));
    if (unpaid === 0) break;
    if (waivers.some((w) => inPeriod(day, w))) {
      waivedDays += 1;
      continue;
    }
    principalDays += BigInt(unpaid);
    days += 1;
  }
  // unpaid cent-days x rate / 100 / days in a year, the rate in hundredths of a percent, rounded half up.
  const rateHundredths = BigInt(Math.round(plan.rate.ratePercent * 100));
  const denominator = BigInt(10_000) * BigInt(Math.round(plan.rate.daysInYear));
  const accrued = Number((BigInt(2) * principalDays * rateHundredths + denominator) / (BigInt(2) * denominator));
  const amountWaived = waivers.filter((w) => w.kind === "AMOUNT").reduce((s, w) => s + Math.max(0, Math.round(Number(w.amountCents ?? 0))), 0);
  const waivedCents = Math.min(accrued, amountWaived);
  const interestCents = accrued - waivedCents;
  const waived = waivedCents > 0 || waivedDays > 0;
  return {
    interestCents,
    daysAccrued: days,
    graceEnds,
    reason: interestCents === 0 && waived ? "WAIVED" : "ACCRUED",
    ...(waived ? { waivedCents, waivedDays } : {}),
  };
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

/**
 * What is still owing on one notice, split into the levy and the late
 * charge, with what was paid applied in the building's order (`order`, the
 * pack's PAYMENT_ALLOCATION_ORDER). All in cents. Where the late charge is
 * paid first (Queensland, SM s 166(5)), `chargePaidCents` is the part of the
 * payments that went to it (noticeLateChargePaid); otherwise payments go to
 * the levy first (NSW), and it is not used. A negative levy (a credit) adds
 * to what is paid. lotArrears (the payment plan figure) and the debt
 * recovery case amount use this one split.
 */
export function noticeOwingSplit(
  n: { dueCents: number; paidCents: number; chargedCents: number; chargePaidCents?: number },
  order?: PaymentAllocationOrder | null,
): { levyCents: number; lateChargeCents: number } {
  const { dueCents: due, paidCents: paid, chargedCents: charged } = n;
  if (lateChargeFirst(order)) {
    const chargePaid = n.chargePaidCents ?? 0;
    const levyPaid = paid - Math.min(0, due) - chargePaid;
    return { levyCents: Math.max(0, Math.max(0, due) - levyPaid), lateChargeCents: Math.max(0, charged - chargePaid) };
  }
  const applied = allocatePayment(paid - Math.min(0, due), { levyCents: Math.max(0, due), interestCents: charged, recoveryCostsCents: 0 }, order ?? undefined);
  return { levyCents: Math.max(0, due - applied.levyCents), lateChargeCents: Math.max(0, charged - applied.interestCents) };
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
    case "RESOLVED_ANNUAL_RATE":
      return `${t.lateCharge} at a yearly rate the ${t.ownersCorporation} resolved`;
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
    case "RESOLVED_ANNUAL_RATE":
      return `${t.lateCharge} at a resolved rate`;
    default:
      return `no ${t.lateCharge}`;
  }
}

/**
 * The late charge setting a building may record, from its pack
 * (`rules.LATE_CHARGE`): one of the pack's modes; the recorded resolution for
 * a mode that needs one; and for RESOLVED_RATE a monthly rate above 0, at most
 * the pack's maximum, to 2 decimal places. Where the law fixes the rate (NSW)
 * no other rate, higher or lower, can be set (s 85(1) and (3)).
 * For RESOLVED_ANNUAL_RATE (VIC, ACT and WA): an annual rate within the
 * pack's range, to 2 decimal places, set by the kind of resolution the pack
 * names; refused where who decides or a bound is not confirmed.
 * `terms` are the building's words (`rules.TERMINOLOGY`).
 */
export function interestSettingProblem(
  input: {
    mode: string;
    /** An annual rate, where the pack fixes one: it must be that rate. */
    ratePercent?: number | null;
    /** The resolved monthly rate (RESOLVED_RATE). */
    monthlyRatePercent?: number | null;
    /** The resolved annual rate (RESOLVED_ANNUAL_RATE). */
    annualRatePercent?: number | null;
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
  if (mode === "RESOLVED_ANNUAL_RATE") {
    const problem = annualRateProblem(rule.annual, input.annualRatePercent, t);
    if (problem) return problem;
    if (!input.resolutionMeetingId || !input.resolutionMotionId) {
      return `Charging ${modeCharging(mode, t)} needs the ${rule.annual!.resolvedRate!.resolution.value!.words} that decided it. Choose the meeting and motion.`;
    }
  }
  if (rule.resolutionRequiredFor.includes(mode) && (!input.resolutionMeetingId || !input.resolutionMotionId)) {
    return `Charging ${modeCharging(mode, t)} needs the general meeting resolution that decided it. Choose the meeting and motion.`;
  }
  return null;
}

/** A rate as the screens write it: 2.5 is "2.5", 20 is "20". */
const pct = (n: number) => String(Number(n.toFixed(2)));

/**
 * Why an annual rate cannot be recorded under the pack's `annual` rule, or
 * null where it can (VIC, ACT and WA stage 2, PR 5). Refused, in this order:
 * a pack with no resolved rate; who decides not confirmed; a bound not
 * confirmed (the Victorian cap is guidance only); a rate missing, negative or
 * with more than 2 decimal places; a rate outside the range.
 */
export function annualRateProblem(
  annual: AnnualLateChargeRule | undefined,
  rate: number | null | undefined,
  t: Pick<Terms, "lateCharge" | "ownersCorporation">,
): string | null {
  const r = annual?.resolvedRate;
  if (!r) return `This building's rules give no other ${t.lateCharge} rate a resolution can set.`;
  if (r.resolution.value == null) return `Who may set a different ${t.lateCharge} rate is not confirmed for this building's rules yet, so no rate can be recorded.`;
  if (r.maxPercent.value == null) return `The highest ${t.lateCharge} rate a resolution may set is not confirmed yet, so no rate can be recorded.`;
  if (r.minPercent.value == null) return `The lowest ${t.lateCharge} rate a resolution may set is not confirmed yet, so no rate can be recorded.`;
  if (rate == null || !Number.isFinite(rate) || rate < 0) return `Enter the yearly ${t.lateCharge} rate the ${t.ownersCorporation} resolved, as a percentage.`;
  if (moreThanTwoDecimals(rate)) return `Enter the yearly ${t.lateCharge} rate with no more than 2 decimal places.`;
  if (!annualRateInRange(annual!, rate)) {
    return r.maxInclusive
      ? `The yearly ${t.lateCharge} rate must be from ${pct(r.minPercent.value)}% to ${pct(r.maxPercent.value)}% a year.`
      : `The yearly ${t.lateCharge} rate must be at least ${pct(r.minPercent.value)}% and less than ${pct(r.maxPercent.value)}% a year.`;
  }
  return null;
}

/** A waiver as an adviser records it, before it is saved. */
export interface LateChargeWaiverInput {
  kind: string;
  amountCents?: number | null;
  fromDate?: string | null;
  toDate?: string | null;
  reasons?: string | null;
  resolutionMeetingId?: string | null;
  resolutionMotionId?: string | null;
}

const isDay = (d: string | null | undefined): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && fromUtc(toUtc(d)) === d;

/**
 * Why a one-case waiver cannot be recorded under the building's rule, or null
 * where it can (VIC, ACT and WA stage 2, PR 5). The pack must give a waiver
 * and say who decides it; the kind must be one the pack allows; an amount is
 * whole cents above 0; a period is two real days, the first on or before the
 * last; the resolution that decided it is chosen; and where decisions are
 * reported to the annual general meeting, the reasons are given.
 */
export function lateChargeWaiverProblem(input: LateChargeWaiverInput, rule: LateChargeRule, t: Pick<Terms, "lateCharge" | "ownersCorporation">): string | null {
  const waiver = rule.annual?.waiver;
  if (!waiver) return `This building's rules give no waiver of ${t.lateCharge} in a particular case.`;
  if (waiver.decidedBy.value == null) return `Who may waive ${t.lateCharge} is not confirmed for this building's rules yet, so no waiver can be recorded.`;
  if (!(waiver.kinds as readonly string[]).includes(input.kind)) return `Choose what is waived: all the ${t.lateCharge} on the notice, an amount of it, or a period.`;
  if (input.kind === "AMOUNT" && !(input.amountCents != null && Number.isInteger(input.amountCents) && input.amountCents > 0)) return "Enter the amount waived, in dollars and cents, more than $0.";
  if (input.kind === "PERIOD" && !(isDay(input.fromDate) && isDay(input.toDate) && input.fromDate <= input.toDate)) {
    return "Enter the first and last days of the period waived, with the first on or before the last.";
  }
  if (waiver.reportedToAgm && !String(input.reasons ?? "").trim()) return "Enter the reasons for the decision. They are reported to the annual general meeting.";
  if (!input.resolutionMeetingId || !input.resolutionMotionId) return `A waiver needs the ${waiver.decidedBy.value.words} that decided it. Choose the meeting and motion.`;
  return null;
}
