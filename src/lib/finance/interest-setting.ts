/**
 * A scheme's late charge setting (NSW interest, Queensland penalty) and the
 * inputs for the late charge on its notices (server side).
 */
import { db } from "@/prisma/db";
import { livePayments } from "./levy-reversal";
import { and } from "@prisma/orm-postgres/orm-client";
import { toCents } from "@/lib/billing/money";
import {
  lateCharge,
  lateChargeApplies,
  lateChargeFirst,
  lateChargePaidOnNotice,
  type InterestResult,
  type InterestSettingMode,
  type LateChargeWaiver,
  type LateChargeWaiverKind,
} from "./statutory-interest";
import { rulesForScheme, rulesForState, SchemeNotFoundError, type SchemeRules } from "@/lib/jurisdiction/scheme-rules";
import { UnsupportedJurisdictionError } from "@/config/statutory";
import { timeZoneOf } from "@/lib/jurisdiction/scheme-time";
import { todayIn } from "@/lib/jurisdiction/time-zone";

const isoDay = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").slice(0, 10));

export interface SchemeInterestSetting {
  mode: InterestSettingMode;
  /** The monthly rate the resolution set (RESOLVED_RATE only), else null. */
  monthlyRatePercent: number | null;
  /** The yearly rate the resolution set (RESOLVED_ANNUAL_RATE only; VIC, ACT and WA), else null. */
  annualRatePercent: number | null;
  meetingId: string | null;
  motionId: string | null;
  /** The building's rule pack, which sets the late charge rule (`rules.LATE_CHARGE`). */
  rules: SchemeRules;
  /** The building's time zone: interest runs to today there. */
  timeZone: string;
}

/** A scheme's late charge setting and rule pack. Throws SchemeNotFoundError or UnsupportedJurisdictionError. */
export async function getSchemeInterestSetting(schemeId: string): Promise<SchemeInterestSetting> {
  const s = await db.orm.public.Scheme.where((x) => x.id.eq(schemeId)).first();
  if (!s) throw new SchemeNotFoundError();
  const rate = s.lateChargeMonthlyRatePercent == null ? null : Number(String(s.lateChargeMonthlyRatePercent));
  const annual = s.lateChargeAnnualRatePercent == null ? null : Number(String(s.lateChargeAnnualRatePercent));
  return {
    mode: (s.interestMode as InterestSettingMode) ?? "STATUTORY",
    monthlyRatePercent: rate != null && Number.isFinite(rate) ? rate : null,
    annualRatePercent: annual != null && Number.isFinite(annual) ? annual : null,
    meetingId: s.interestResolutionMeetingId ?? null,
    motionId: s.interestResolutionMotionId ?? null,
    rules: rulesForState(s.state),
    timeZone: timeZoneOf(s),
  };
}


/**
 * The building's rules and pack label when its order applies payments to the
 * late charge first (Queensland, SM s 166(5)); otherwise null, and the
 * caller goes on as it always has (NSW, levy first). A building that is not
 * found, or whose state has no pack, is also null here, so receipting and
 * applying credit behave for it as they did before packs set the order.
 */
export async function lateChargeFirstRules(schemeId: string): Promise<{ rules: SchemeRules["rules"]; label: string } | null> {
  try {
    const { rules, label } = await rulesForScheme(schemeId);
    return lateChargeFirst(rules.PAYMENT_ALLOCATION_ORDER) ? { rules, label } : null;
  } catch (err) {
    if (err instanceof SchemeNotFoundError || err instanceof UnsupportedJurisdictionError) return null;
    throw err;
  }
}

export interface NoticeInterest extends InterestResult {
  noticeId: string;
  previouslyChargedCents: number;
  additionalCents: number;
}

/**
 * The late charge owed to date on each overdue notice of a scheme, from the
 * notice's levy amount and its payment history, under the building's rule
 * (`rules.LATE_CHARGE`) and setting.
 *
 * NSW: a payment plan does not stop interest: it keeps accruing at the
 * statutory rate unless the owners corporation resolves that the contribution
 * bears no interest (s 85(3)), which is the scheme's NO_INTEREST setting.
 * Queensland: a penalty only once the body corporate's resolution and rate
 * are recorded (RESOLVED_RATE).
 */
/** `asAt` defaults to today in the building's time zone. */
export async function statutoryInterestForScheme(schemeId: string, asAtDay?: string): Promise<NoticeInterest[]> {
  const setting = await getSchemeInterestSetting(schemeId);
  const asAt = asAtDay ?? todayIn(setting.timeZone);
  const rule = setting.rules.rules.LATE_CHARGE;
  const notices = await db.orm.public.LevyNotice
    .where((n) => and(n.schemeId.eq(schemeId), n.status.in(["ISSUED", "PARTIALLY_PAID", "OVERDUE"])))
    .limit(5000)
    .all();
  if (notices.length === 0) return [];
  const ids = notices.map((n) => n.id);
  // A reversed payment (dishonoured, wrong lot) never paid the notice, so interest runs as if it had not been made.
  const payments = livePayments(await db.orm.public.LevyPayment.where((p) => p.levyNoticeId.in(ids)).limit(50000).all());
  // Waivers are read only where the pack gives one (VIC, ACT and WA); NSW and Queensland never read the table.
  const waivers = rule.annual?.waiver ? await lateChargeWaiversFor(ids) : [];
  return notices.map((n) => noticeLateCharge(n, payments, rule, setting, asAt, waivers));
}

/** A waiver row, as the engine reads it. */
type LateChargeWaiverRow = { levyNoticeId: string; kind: string; amount?: unknown; fromDate?: unknown; toDate?: unknown };

/** The waivers recorded for these notices (late_charge_waivers). */
export async function lateChargeWaiversFor(noticeIds: readonly string[]): Promise<LateChargeWaiverRow[]> {
  if (noticeIds.length === 0) return [];
  return db.orm.public.LateChargeWaiver.where((w) => w.levyNoticeId.in([...noticeIds])).limit(50000).all();
}

/** One notice's waivers, for the engine. */
function noticeWaivers(noticeId: string, rows: readonly LateChargeWaiverRow[]): LateChargeWaiver[] {
  return rows
    .filter((w) => w.levyNoticeId === noticeId)
    .map((w) => ({
      kind: w.kind as LateChargeWaiverKind,
      amountCents: w.amount == null ? null : toCents(String(w.amount)),
      fromDate: w.fromDate == null ? null : isoDay(w.fromDate),
      toDate: w.toDate == null ? null : isoDay(w.toDate),
    }));
}

/** The notice fields the late charge is worked out from. */
type LateChargeNotice = {
  id: string;
  amountDue: unknown;
  dueDate: unknown;
  interestCharged?: unknown;
  migratedInterestCharged?: unknown;
  migrationBatchId?: string | null;
  issuedAt?: unknown;
};
/** A payment row. `lateChargeAmount`: its part recorded as paid to the late charge (late charge first only). */
type LateChargePayment = { levyNoticeId: string; paymentDate: unknown; amount: unknown; lateChargeAmount?: unknown };

const recordedPartCents = (p: LateChargePayment) => (p.lateChargeAmount == null ? 0 : toCents(String(p.lateChargeAmount)));

/** The engine's input for a notice: its levy, due date and its own live payments, with any recorded late charge part. */
function engineInput(n: LateChargeNotice, payments: readonly LateChargePayment[]) {
  return {
    levyCents: toCents(String(n.amountDue)),
    dueDate: isoDay(n.dueDate),
    payments: payments
      .filter((p) => p.levyNoticeId === n.id)
      .map((p) => ({
        date: isoDay(p.paymentDate),
        amountCents: toCents(String(p.amount)),
        ...(p.lateChargeAmount == null ? {} : { lateChargeCents: recordedPartCents(p) }),
      })),
  };
}

/** The engine's working for one notice: its result, the late charge to takeover and what is charged here. */
function lateChargeWorking(
  n: LateChargeNotice,
  payments: readonly LateChargePayment[],
  rule: SchemeRules["rules"]["LATE_CHARGE"],
  setting: SchemeInterestSetting,
  asAt: string,
  waiverRows: readonly LateChargeWaiverRow[] = [],
) {
  const base = engineInput(n, payments);
  // Read by an annual-rate rule only (VIC, ACT and WA); NSW and Queensland ignore it.
  const context = { order: setting.rules.rules.PAYMENT_ALLOCATION_ORDER, waivers: noticeWaivers(n.id, waiverRows) };
  const result = lateCharge({ ...base, asAt }, rule, setting, context);
  // A notice brought across at takeover: the old system charged the
  // interest up to takeover (kept in migratedInterestCharged), so only
  // interest from the takeover day on is owed here. It is compared with
  // the interest charged here, plus the statutory interest to takeover,
  // which the old system's charge stands in for (financials review B8).
  const takeover = n.migrationBatchId ? isoDay(n.issuedAt) || isoDay(n.dueDate) : "";
  const toTakeoverCents = takeover ? lateCharge({ ...base, asAt: takeover }, rule, setting, context).interestCents : 0;
  const chargedHereCents = Math.max(0, toCents(String(n.interestCharged ?? 0)) - toCents(String(n.migratedInterestCharged ?? 0)));
  return { result, toTakeoverCents, chargedHereCents, additionalCents: Math.max(0, result.interestCents - toTakeoverCents - chargedHereCents) };
}

/**
 * The late charge on one notice to `asAt`, and what is still to be charged
 * here, from its live payments (`payments` may hold other notices' too).
 */
export function noticeLateCharge(
  n: LateChargeNotice,
  payments: readonly LateChargePayment[],
  rule: SchemeRules["rules"]["LATE_CHARGE"],
  setting: SchemeInterestSetting,
  asAt: string,
  /** The waivers recorded for the notices (VIC, ACT and WA); may hold other notices' too. */
  waivers: readonly LateChargeWaiverRow[] = [],
): NoticeInterest {
  const w = lateChargeWorking(n, payments, rule, setting, asAt, waivers);
  const previouslyChargedCents = w.chargedHereCents;
  return {
    ...w.result,
    noticeId: n.id,
    previouslyChargedCents,
    additionalCents: w.additionalCents,
  };
}

/**
 * The late charge paid on a notice, where the building's order applies
 * payments to it first (Queensland, SM s 166(5)): the parts recorded on its
 * live receipts, plus anything paid with no receipt (`lateChargePaidOnNotice`).
 * This is the one figure for the penalty paid: receipting, owner credit,
 * lotArrears and the engine (which applies each payment as recorded) use it.
 */
export function noticeLateChargePaid(n: { id: string; amountPaid?: unknown; interestCharged?: unknown }, livePaymentRows: readonly LateChargePayment[]): number {
  const own = livePaymentRows.filter((p) => p.levyNoticeId === n.id);
  return lateChargePaidOnNotice({
    paidCents: toCents(String(n.amountPaid ?? 0)),
    chargedCents: toCents(String(n.interestCharged ?? 0)),
    receiptedCents: own.reduce((s, p) => s + toCents(String(p.amount)), 0),
    recordedChargeCents: own.reduce((s, p) => s + recordedPartCents(p), 0),
  });
}

/** Where a notice stands for a payment dated `asAt`, late charge first. All in cents. */
export interface LateChargePosition {
  /** The late charge the engine has worked out to `asAt` that is not yet charged (0 for a notice not open). */
  additionalCents: number;
  /** The late charge that had accrued by `asAt`: the engine's figure while the building charges one, else what is charged. */
  accruedByDateCents: number;
  /** The late charge paid by every live payment (`noticeLateChargePaid`). */
  chargePaidCents: number;
  /** The late charge paid by live payments dated on or before `asAt`. */
  chargePaidByDateCents: number;
}

/**
 * Where a notice stands just before a payment dated `asAt` is applied to it,
 * late charge first (Queensland, SM s 166(5)). Read it with the notice locked
 * (src/lib/queries/interest.ts lockLateCharge), so it cannot change before the
 * payment is recorded. `livePaymentRows` are the notice's payments not reversed.
 */
export function lateChargePosition(
  n: LateChargeNotice & { amountPaid?: unknown; status?: unknown },
  livePaymentRows: readonly LateChargePayment[],
  rule: SchemeRules["rules"]["LATE_CHARGE"],
  setting: SchemeInterestSetting,
  asAt: string,
): LateChargePosition {
  const own = livePaymentRows.filter((p) => p.levyNoticeId === n.id);
  const byDate = own.filter((p) => isoDay(p.paymentDate) <= asAt);
  const open = ["ISSUED", "PARTIALLY_PAID", "OVERDUE"].includes(String(n.status));
  const w = lateChargeWorking(n, byDate, rule, setting, asAt);
  const additionalCents = open ? w.additionalCents : 0;
  const chargedCents = toCents(String(n.interestCharged ?? 0));
  const paidCents = toCents(String(n.amountPaid ?? 0));
  const receiptedCents = own.reduce((s, p) => s + toCents(String(p.amount)), 0);
  const unreceipted = Math.max(0, paidCents - receiptedCents);
  return {
    additionalCents,
    accruedByDateCents: lateChargeApplies(rule, setting)
      ? toCents(String(n.migratedInterestCharged ?? 0)) + Math.max(0, w.result.interestCents - w.toTakeoverCents)
      : chargedCents + additionalCents,
    chargePaidCents: noticeLateChargePaid(n, own),
    chargePaidByDateCents: Math.max(0, Math.min(chargedCents, byDate.reduce((s, p) => s + recordedPartCents(p), 0) + unreceipted)),
  };
}
