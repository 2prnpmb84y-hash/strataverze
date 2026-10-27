/**
 * A scheme's late charge setting (NSW interest, Queensland penalty) and the
 * inputs for the late charge on its notices (server side).
 */
import { db } from "@/prisma/db";
import { livePayments } from "./levy-reversal";
import { and } from "@prisma/orm-postgres/orm-client";
import { toCents } from "@/lib/billing/money";
import { lateCharge, type InterestResult, type InterestSettingMode } from "./statutory-interest";
import { rulesForState, SchemeNotFoundError, type SchemeRules } from "@/lib/jurisdiction/scheme-rules";
import { timeZoneOf } from "@/lib/jurisdiction/scheme-time";
import { todayIn } from "@/lib/jurisdiction/time-zone";

const isoDay = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").slice(0, 10));

export interface SchemeInterestSetting {
  mode: InterestSettingMode;
  /** The monthly rate the resolution set (RESOLVED_RATE only), else null. */
  monthlyRatePercent: number | null;
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
  return {
    mode: (s.interestMode as InterestSettingMode) ?? "STATUTORY",
    monthlyRatePercent: rate != null && Number.isFinite(rate) ? rate : null,
    meetingId: s.interestResolutionMeetingId ?? null,
    motionId: s.interestResolutionMotionId ?? null,
    rules: rulesForState(s.state),
    timeZone: timeZoneOf(s),
  };
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
  return notices.map((n) => {
    const base = {
      levyCents: toCents(String(n.amountDue)),
      dueDate: isoDay(n.dueDate),
      payments: payments
        .filter((p) => p.levyNoticeId === n.id)
        .map((p) => ({ date: isoDay(p.paymentDate), amountCents: toCents(String(p.amount)) })),
    };
    const result = lateCharge({ ...base, asAt }, rule, setting);
    // A notice brought across at takeover: the old system charged the
    // interest up to takeover (kept in migratedInterestCharged), so only
    // interest from the takeover day on is owed here. It is compared with
    // the interest charged here, plus the statutory interest to takeover,
    // which the old system's charge stands in for (financials review B8).
    const takeover = n.migrationBatchId ? isoDay(n.issuedAt) || isoDay(n.dueDate) : "";
    const toTakeoverCents = takeover ? lateCharge({ ...base, asAt: takeover }, rule, setting).interestCents : 0;
    const chargedHereCents = Math.max(0, toCents(String(n.interestCharged ?? 0)) - toCents(String(n.migratedInterestCharged ?? 0)));
    const previouslyChargedCents = chargedHereCents;
    return {
      ...result,
      noticeId: n.id,
      previouslyChargedCents,
      additionalCents: Math.max(0, result.interestCents - toTakeoverCents - chargedHereCents),
    };
  });
}
