/**
 * A scheme's interest setting and the inputs for statutory interest on its
 * notices (server side).
 */
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import { toCents } from "@/lib/billing/money";
import { statutoryInterest, type InterestResult } from "./statutory-interest";
import type { InterestSettingMode } from "./statutory-interest";

const isoDay = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").slice(0, 10));

export interface SchemeInterestSetting {
  mode: InterestSettingMode;
  meetingId: string | null;
  motionId: string | null;
}

export async function getSchemeInterestSetting(schemeId: string): Promise<SchemeInterestSetting> {
  const s = await db.orm.public.Scheme.where((x) => x.id.eq(schemeId)).first();
  return {
    mode: (s?.interestMode as InterestSettingMode) ?? "STATUTORY",
    meetingId: s?.interestResolutionMeetingId ?? null,
    motionId: s?.interestResolutionMotionId ?? null,
  };
}

/** Today's date in Sydney (YYYY-MM-DD). */
export function sydneyToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export interface NoticeInterest extends InterestResult {
  noticeId: string;
  previouslyChargedCents: number;
  additionalCents: number;
}

/**
 * Statutory interest owed to date on each overdue notice of a scheme, from
 * the notice's levy amount and its payment history.
 *
 * A payment plan does not stop interest: it keeps accruing at the statutory
 * rate unless the owners corporation resolves that the contribution bears no
 * interest (s 85(3)), which is the scheme's NO_INTEREST setting.
 */
export async function statutoryInterestForScheme(schemeId: string, asAt = sydneyToday()): Promise<NoticeInterest[]> {
  const setting = await getSchemeInterestSetting(schemeId);
  const notices = await db.orm.public.LevyNotice
    .where((n) => and(n.schemeId.eq(schemeId), n.status.in(["ISSUED", "PARTIALLY_PAID", "OVERDUE"])))
    .limit(5000)
    .all();
  if (notices.length === 0) return [];
  const ids = notices.map((n) => n.id);
  const payments = await db.orm.public.LevyPayment.where((p) => p.levyNoticeId.in(ids)).limit(50000).all();
  return notices.map((n) => {
    const result = statutoryInterest({
      levyCents: toCents(String(n.amountDue)),
      dueDate: isoDay(n.dueDate),
      payments: payments
        .filter((p) => p.levyNoticeId === n.id)
        .map((p) => ({ date: isoDay(p.paymentDate), amountCents: toCents(String(p.amount)) })),
      asAt,
      noInterest: setting.mode === "NO_INTEREST",
    });
    const previouslyChargedCents = toCents(String(n.interestCharged ?? 0));
    return {
      ...result,
      noticeId: n.id,
      previouslyChargedCents,
      additionalCents: Math.max(0, result.interestCents - previouslyChargedCents),
    };
  });
}
