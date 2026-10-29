/**
 * The amounts a final notice states (VIC stage 2, PR 9c, 30 Oct 2026; the
 * pack's DEBT_RECOVERY.finalNotice): the unpaid fees, the interest due to
 * date and the interest accruing each day, worked out from the lot's overdue
 * notices with the building's late charge. Pure, and it imports no pack: the
 * caller passes the building's rules.
 *
 * StrataVerze does not produce a final notice yet (the approved form), so
 * nothing calls this outside its tests. It is built now so that what stops a
 * final notice is said precisely, and fails closed:
 * - every notice must have been issued under the building's pack (`packCode`,
 *   "AU-VIC"): a notice brought across at takeover, or issued under other
 *   rules, refuses;
 * - only an annual-rate late charge is worked out, and every value it needs
 *   must be checked (annualLateChargeMissing): any missing value refuses,
 *   with what is missing;
 * - how the daily amount is rounded must have a value (CENT), or it refuses;
 * - a setting that charges no interest (NONE) gives 0 to date and 0 a day.
 *
 * The fees are each notice's levy less the payments made by `asAt` (applied
 * to the levy first, as the late charge engine requires). The interest to
 * date is the late charge engine's to `asAt` (not counting that day) less
 * any payment beyond the levy. The daily amount is the unpaid levy times the
 * annual rate divided by the pack's days in a year, exactly (the rate at its
 * full precision), summed over the notices and rounded once, half up, to the
 * cent; a notice whose interest is waived in whole, or for a period that
 * covers the as-at day, adds nothing, and a waived period without both its
 * days refuses. The interest to date is the shared late charge engine's, as
 * it charges it.
 */
import type { StatutoryRules } from "@/config/statutory";
import {
  annualLateChargeMissing,
  annualLateChargeRate,
  annualRateLateCharge,
  type LateChargeSetting,
  type LateChargeWaiver,
  type PaymentAllocationOrder,
} from "@/lib/finance/statutory-interest";
import { parseIsoDate } from "@/lib/onboarding/property-onboarding";

/** How a pack says the daily amount is rounded (`DEBT_RECOVERY.finalNotice.dailyInterestRounding`). */
type DailyRounding = NonNullable<NonNullable<StatutoryRules["DEBT_RECOVERY"]>["finalNotice"]>["dailyInterestRounding"];

/** One overdue notice, as the final notice reads it. */
export interface FinalNoticeNotice {
  /** The notice's number, to name it in a refusal. */
  number: string;
  /** The fees on the notice (excluding interest), in cents. */
  levyCents: number;
  /** YYYY-MM-DD. */
  dueDate: string;
  /** Payments on the notice, by day. */
  payments: readonly { date: string; amountCents: number }[];
  /** The pack label it was issued under ("AU-VIC 2026.10.13"), or null. */
  rulePack: string | null;
  /** Brought across at takeover (a migration batch). */
  takeover: boolean;
  /** Waivers of its late charge, where recorded. */
  waivers?: readonly LateChargeWaiver[];
}

export type FinalNoticeAmounts =
  | { ok: true; feesCents: number; interestToDateCents: number; dailyCents: number }
  | { ok: false; problems: string[] };

export interface FinalNoticeAmountsInput {
  notices: readonly FinalNoticeNotice[];
  /** The building's late charge rule (`rules.LATE_CHARGE`). */
  lateCharge: StatutoryRules["LATE_CHARGE"];
  /** The building's late charge setting. */
  setting: LateChargeSetting;
  /** The building's payment order (`rules.PAYMENT_ALLOCATION_ORDER`). */
  order: PaymentAllocationOrder | null;
  /** The building's pack code ("AU-VIC"): only notices issued under it count. */
  packCode: string;
  /** The day the amounts are stated as at (YYYY-MM-DD, the building's day). */
  asAt: string;
  /** How the daily amount is rounded (`DEBT_RECOVERY.finalNotice.dailyInterestRounding`). */
  rounding: DailyRounding;
}

const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && parseIsoDate(v) != null;
const wholeCents = (n: number) => Number.isFinite(n) && Number.isInteger(n) && n >= 0;

/** The fees, interest to date and daily interest a final notice states, or every reason they cannot be worked out. */
export function finalNoticeAmounts(input: FinalNoticeAmountsInput): FinalNoticeAmounts {
  const problems: string[] = [];
  const pack = input.packCode.trim();
  if (!isDay(input.asAt)) problems.push(`The day the amounts are worked out to is not a date: ${input.asAt}.`);
  if (input.notices.length === 0) problems.push("No notice of this lot is overdue.");
  for (const n of input.notices) {
    if (n.takeover) problems.push(`Notice ${n.number} was brought across at takeover, so it does not count towards a final notice.`);
    else if (!pack || !(n.rulePack ?? "").startsWith(`${pack} `)) problems.push(`Notice ${n.number} was not issued under this building's rules in StrataVerze, so it does not count towards a final notice.`);
    if (!isDay(n.dueDate)) problems.push(`Notice ${n.number} has no due date.`);
    if (!wholeCents(n.levyCents) || n.payments.some((p) => !wholeCents(p.amountCents) || !isDay(p.date))) problems.push(`Notice ${n.number} has an amount or payment that cannot be read.`);
    // A waived period must have both its days, so whether it covers the day the amounts are stated as at can be told.
    if ((n.waivers ?? []).some((w) => w.kind === "PERIOD" && !(isDay(w.fromDate ?? "") && isDay(w.toDate ?? "") && (w.fromDate ?? "") <= (w.toDate ?? "")))) {
      problems.push(`Notice ${n.number} has a waived period that cannot be read.`);
    }
  }
  const rule = input.lateCharge;
  if (!rule.annual) problems.push("The building's late charge is not worked out at an annual rate, so the interest a final notice states cannot be worked out.");
  else for (const m of annualLateChargeMissing(rule, input.setting, input.order)) problems.push(`The late charge value ${m} is not confirmed, so the interest a final notice states cannot be worked out.`);
  if (input.rounding.value !== "CENT") problems.push(`How the daily interest is rounded is not confirmed.${input.rounding.value == null ? ` ${input.rounding.note}` : ""}`);
  if (problems.length > 0) return { ok: false, problems };

  const rate = annualLateChargeRate(rule, input.setting, input.order);
  const daysInYear = rule.annual!.accrual.daysInYear.value;
  const rateFraction = rate == null ? null : decimalFraction(rate);
  const daysFraction = daysInYear == null ? null : decimalFraction(daysInYear);
  if (rate != null && rate > 0 && (rateFraction == null || daysFraction == null || daysFraction[0] === BigInt(0))) {
    return { ok: false, problems: ["The late charge rate or the days in a year cannot be read, so the interest a final notice states cannot be worked out."] };
  }
  let feesCents = 0;
  let interestToDateCents = 0;
  let unpaidForDaily = BigInt(0);
  for (const n of input.notices) {
    const paid = n.payments.filter((p) => p.date <= input.asAt).reduce((s, p) => s + p.amountCents, 0);
    const unpaid = Math.max(0, n.levyCents - paid);
    feesCents += unpaid;
    if (rate == null || rate <= 0) continue;
    const accrued = annualRateLateCharge(
      { levyCents: n.levyCents, dueDate: n.dueDate, payments: n.payments.map((p) => ({ date: p.date, amountCents: p.amountCents })), asAt: input.asAt },
      rule,
      input.setting,
      { order: input.order, waivers: n.waivers ?? [] },
    ).interestCents;
    // Payments go to the fees first: any beyond them paid interest.
    interestToDateCents += Math.max(0, accrued - Math.max(0, paid - n.levyCents));
    // A notice whose interest is waived in whole, or for a period covering the day stated as at, accrues nothing that day.
    const waived = (n.waivers ?? []).some((w) => w.kind === "WHOLE" || (w.kind === "PERIOD" && (w.fromDate ?? "") <= input.asAt && input.asAt <= (w.toDate ?? "")));
    if (!waived) unpaidForDaily += BigInt(unpaid);
  }
  // No interest charged (NONE, or a rate of 0): 0 to date and 0 a day.
  if (rate == null || rate <= 0 || rateFraction == null || daysFraction == null) return { ok: true, feesCents, interestToDateCents: 0, dailyCents: 0 };
  // unpaid cents x rate / 100 / days in a year, exactly, with the rate and the days at their full precision (review L6),
  // rounded once, half up, to the cent.
  const [rateNum, rateDen] = rateFraction;
  const [daysNum, daysDen] = daysFraction;
  const numerator = unpaidForDaily * rateNum * daysDen;
  const denominator = rateDen * BigInt(100) * daysNum;
  const dailyCents = Number((BigInt(2) * numerator + denominator) / (BigInt(2) * denominator));
  return { ok: true, feesCents, interestToDateCents, dailyCents };
}

/** A finite number of 0 or more as an exact fraction of its shortest decimal form ([numerator, denominator]), or null. */
function decimalFraction(n: number): [bigint, bigint] | null {
  if (!Number.isFinite(n) || n < 0) return null;
  let text = String(n);
  if (/e/i.test(text)) text = n.toFixed(20).replace(/0+$/, "").replace(/\.$/, "");
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const [whole, part = ""] = text.split(".");
  return [BigInt(whole + part), BigInt(10) ** BigInt(part.length)];
}
