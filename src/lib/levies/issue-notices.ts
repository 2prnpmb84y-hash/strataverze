/**
 * Issuing levy notices (server side, 24 Oct 2026).
 *
 * A budget levy schedule's notices are planned for the whole year when it is
 * generated, as DRAFT notices. Each goes out 35 days before it falls due
 * (src/lib/levies/issue-timing.ts): `issueDueNotices` runs every day from the
 * levy notices cron and issues those whose day has come. Issuing a batch
 * marks the notices ISSUED, posts the levy raised (DR levies receivable, CR
 * levy income) for that batch on the notice date, applies owner credit and
 * emails each notice to its owner.
 *
 * A notice is never issued while it would breach the content rules (for
 * example a missing bank account): it is held and the Adviser is told in the
 * building's activity. If it is then fewer than 30 days from falling due, its
 * due date moves to 30 days after the day it goes out.
 */
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";
import { getSystemAccountBySubType } from "@/lib/queries/account-codes";
import { createJournalEntry, getNextEntryNumber, postJournalEntry } from "@/lib/queries/journal-entries";
import { issueLevyNotice } from "@/lib/queries/levy-schedules";
import { logActivity } from "@/lib/queries/activity-log";
import { applyOwnerCredit } from "@/lib/finance/owner-credits";
import { logError } from "@/lib/log";
import { checkPlannedNotices, sendIssuedNotices } from "./notice-content-data";
import { addDays, toCents, toIsoDay } from "./notice-plan";
import { issueTiming } from "./issue-timing";
import { LEVY_NOTICE_RULES } from "@/config/statutory";

const ts = (v: string) => v as unknown as TimestampString<3>;

/** DR Levies Receivable, CR Levy Income for notices raised against a fund. */
export async function postLevyRaisedJournal(args: {
  schemeId: string;
  fundId: string;
  scheduleId: string;
  totalAmount: number;
  noticeCount: number;
  profileId: string;
  /** The notice date (YYYY-MM-DD). */
  date: string;
}) {
  if (args.totalAmount <= 0) return;
  const fund = await db.orm.public.Fund.where((f) => f.id.eq(args.fundId)).first();
  const fundType = (fund?.fundType ?? "ADMINISTRATIVE") as "ADMINISTRATIVE" | "CAPITAL_WORKS";
  const receivableAccount = await getSystemAccountBySubType(args.schemeId, "ACCOUNTS_RECEIVABLE", fundType);
  const incomeAccount = await getSystemAccountBySubType(args.schemeId, "LEVY_INCOME", fundType);
  if (!receivableAccount || !incomeAccount) return;

  const entryNumber = await getNextEntryNumber(args.schemeId);
  const entry = await createJournalEntry({
    schemeId: args.schemeId,
    entryNumber,
    transactionDate: args.date,
    description: `Levy notices issued — ${args.noticeCount} notice(s), ${fundType === "CAPITAL_WORKS" ? "Capital Works" : "Administrative"} fund`,
    entryType: "AUTO",
    sourceType: "LEVY_RAISED",
    sourceId: args.scheduleId,
    createdBy: args.profileId,
    lines: [
      { accountCodeId: receivableAccount.id, fundId: args.fundId, debit: args.totalAmount, description: "Levies receivable raised" },
      { accountCodeId: incomeAccount.id, fundId: args.fundId, credit: args.totalAmount, description: "Levy income recognised" },
    ],
  });
  await postJournalEntry(entry.id, args.profileId);
}

export interface BatchNotice {
  id: string;
  noticeNumber: string;
  lotId: string;
  lotNumber: string;
  ownerId: string | null;
  dueDate: string;
  amountCents: number;
}

/** Issue notices that already exist as DRAFT: post, apply credit, email. */
export async function issueNoticeBatch(input: {
  schemeId: string;
  scheduleId: string;
  fundId: string;
  issuerId: string;
  noticeDate: string;
  notices: BatchNotice[];
  isUrgentSpecialLevy?: boolean;
}): Promise<{ count: number; emailed: number; creditAppliedCents: number }> {
  // Claim each notice: only those this run turned from DRAFT to ISSUED are
  // posted, credited and emailed, so a second run at the same time does nothing twice.
  const claimed: BatchNotice[] = [];
  for (const n of input.notices) if (await issueLevyNotice(n.id)) claimed.push(n);
  if (claimed.length === 0) return { count: 0, emailed: 0, creditAppliedCents: 0 };
  input = { ...input, notices: claimed };
  const totalCents = input.notices.reduce((s, n) => s + n.amountCents, 0);
  await postLevyRaisedJournal({
    schemeId: input.schemeId,
    fundId: input.fundId,
    scheduleId: input.scheduleId,
    totalAmount: totalCents / 100,
    noticeCount: input.notices.length,
    profileId: input.issuerId,
    date: input.noticeDate,
  });
  await logActivity({
    schemeId: input.schemeId,
    actorId: input.issuerId,
    action: "LEVY_NOTICES_ISSUED",
    entityType: "LevySchedule",
    entityId: input.scheduleId,
    metadata: { count: input.notices.length, total: totalCents / 100, dueDates: [...new Set(input.notices.map((n) => n.dueDate))] },
  });

  let creditAppliedCents = 0;
  const scheme = await db.orm.public.Scheme.where((s) => s.id.eq(input.schemeId)).first();
  if (scheme?.autoApplyOwnerCredit !== false) {
    creditAppliedCents = await applyOwnerCredit({ schemeId: input.schemeId, lotIds: [...new Set(input.notices.map((n) => n.lotId))], actorId: input.issuerId });
  }

  const emailed = await sendIssuedNotices({
    schemeId: input.schemeId,
    fundId: input.fundId,
    issuerId: input.issuerId,
    noticeDate: input.noticeDate,
    notices: input.notices.map((n) => ({ noticeId: n.id, lotId: n.lotId, lotNumber: n.lotNumber, ownerId: n.ownerId, noticeNumber: n.noticeNumber, dueDate: n.dueDate, amountCents: n.amountCents })),
  });
  await logActivity({
    schemeId: input.schemeId,
    actorId: input.issuerId,
    action: "LEVY_NOTICES_EMAILED",
    entityType: "LevySchedule",
    entityId: input.scheduleId,
    metadata: { emailed, notices: input.notices.length },
  });
  return { count: input.notices.length, emailed, creditAppliedCents };
}

export interface DueRunResult {
  scheduleId: string;
  schemeId: string;
  issued: number;
  held: string[] | null;
  moved: number;
}

/** Who a scheduled batch is issued by: the Adviser who approved the schedule, else any Adviser of the scheme. */
async function issuerFor(schemeId: string, approvedBy: string | null): Promise<string | null> {
  if (approvedBy) return approvedBy;
  const m = await db.orm.public.SchemeMembership.where((x) => and(x.schemeId.eq(schemeId), x.role.eq("ADVISER"))).first();
  return m?.profileId ?? null;
}

/** Issue every planned notice whose day has come (`today`, Sydney). Safe to run more than once a day. */
export async function issueDueNotices(today: string): Promise<DueRunResult[]> {
  const horizon = addDays(today, LEVY_NOTICE_RULES.issueDaysBeforeDue);
  const due = await db.orm.public.LevyNotice
    .where((n) => and(n.status.eq("DRAFT"), n.dueDate.lte(ts(horizon))))
    .limit(20000)
    .all();
  if (!due.length) return [];
  const scheduleIds = [...new Set(due.map((n) => String(n.levyScheduleId)).filter(Boolean))];
  const schedules = await db.orm.public.LevySchedule.where((s) => and(s.id.in(scheduleIds), s.status.eq("ACTIVE"))).limit(5000).all();
  const lots = await db.orm.public.Lot.where((l) => l.id.in([...new Set(due.map((n) => n.lotId))])).limit(20000).all();
  const results: DueRunResult[] = [];

  for (const schedule of schedules) {
    try {
      const issuerId = await issuerFor(schedule.schemeId, schedule.approvedBy ?? null);
      const mine = due.filter((n) => n.levyScheduleId === schedule.id);
      if (!issuerId || !mine.length) continue;
      // Fewer than 30 days left (it was held, or the job did not run): the due date moves.
      let moved = 0;
      const notices: BatchNotice[] = [];
      for (const n of mine) {
        const t = issueTiming(toIsoDay(n.dueDate), today);
        if (t.kind === "moved") {
          await db.orm.public.LevyNotice.where((x) => and(x.id.eq(n.id), x.status.eq("DRAFT"))).update({ dueDate: ts(t.dueDate) });
          moved++;
        }
        notices.push({
          id: n.id,
          noticeNumber: String(n.noticeNumber),
          lotId: n.lotId,
          lotNumber: String(lots.find((l) => l.id === n.lotId)?.lotNumber ?? "?"),
          ownerId: n.ownerId ?? null,
          dueDate: t.dueDate,
          amountCents: toCents(String(n.amountDue)),
        });
      }
      const missing = await checkPlannedNotices({ schemeId: schedule.schemeId, fundId: schedule.fundId, issuerId, noticeDate: today, notices });
      if (missing.length) {
        await logActivity({
          schemeId: schedule.schemeId,
          actorId: issuerId,
          action: "LEVY_NOTICES_HELD",
          entityType: "LevySchedule",
          entityId: schedule.id,
          metadata: { count: notices.length, missing: missing.map((m) => m.message) },
        });
        results.push({ scheduleId: schedule.id, schemeId: schedule.schemeId, issued: 0, held: missing.map((m) => m.message), moved });
        continue;
      }
      const r = await issueNoticeBatch({ schemeId: schedule.schemeId, scheduleId: schedule.id, fundId: schedule.fundId, issuerId, noticeDate: today, notices });
      results.push({ scheduleId: schedule.id, schemeId: schedule.schemeId, issued: r.count, held: null, moved });
    } catch (err) {
      logError(`[levy-notices] schedule ${schedule.id} could not be issued:`, err);
      results.push({ scheduleId: schedule.id, schemeId: schedule.schemeId, issued: 0, held: ["The notices could not be issued; see the server log."], moved: 0 });
    }
  }
  return results;
}
