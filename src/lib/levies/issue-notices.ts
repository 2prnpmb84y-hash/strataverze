/**
 * Issuing levy notices (server side, 24 to 25 Oct 2026).
 *
 * A budget levy schedule's notices are planned for the whole year when it is
 * generated, as DRAFT notices. Each goes out 35 days before it falls due
 * (src/lib/levies/issue-timing.ts). The daily job (`runLevyNoticeDay`):
 *
 *   1. issues the planned notices whose day has come (`issueDueNotices`). A
 *      notice whose 5-week mark has passed (it was held, or the job did not
 *      run) is not sent by the job: it waits for the Adviser to confirm, as
 *      when the schedule was generated;
 *   2. sends again any notice email that failed in the last 3 days.
 *
 * Issuing a batch (`issueNoticeBatch`) claims each notice (DRAFT to ISSUED,
 * addressed to the lot's current owner), posts the levy raised, applies any
 * owner credit and emails the notices. The levy is posted dated its due date
 * (DR levies receivable, CR levy income), so the income falls in the period's
 * own financial year (decided 25 Oct 2026). A payment received before then
 * is receipted against the notice as usual; until the due date it shows as a
 * credit on the lot's levy account, levies paid in advance.
 *
 * A notice is never issued while it would breach the content rules (for
 * example a missing bank account): it is held and the Adviser is told in the
 * building's activity. Claiming first means two runs at once never issue,
 * post or email the same notice twice; if the levy cannot be posted the
 * claim is undone, so the notices are issued on a later run instead.
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
import { loadPlanLots } from "./load-plan-lots";
import { addDays, toCents, toIsoDay } from "./notice-plan";
import { issueDateFor, issueTiming, lateMessage } from "./issue-timing";
import { RULE_PACKS, UnsupportedJurisdictionError } from "@/config/statutory";
import { rulesForScheme, rulesForState } from "@/lib/jurisdiction/scheme-rules";

const ts = (v: string) => v as unknown as TimestampString<3>;
const PAGE = 1000;
/** How long a failed notice email is retried. */
const EMAIL_RETRY_DAYS = 3;

/** DR Levies Receivable, CR Levy Income for levies raised against a fund. */
export async function postLevyRaisedJournal(args: {
  schemeId: string;
  fundId: string;
  scheduleId: string;
  totalAmount: number;
  noticeCount: number;
  profileId: string;
  /** The date the levy is raised (YYYY-MM-DD): its due date. */
  date: string;
}): Promise<boolean> {
  if (args.totalAmount <= 0) return true;
  const fund = await db.orm.public.Fund.where((f) => f.id.eq(args.fundId)).first();
  const fundType = (fund?.fundType ?? "ADMINISTRATIVE") as "ADMINISTRATIVE" | "CAPITAL_WORKS";
  const receivableAccount = await getSystemAccountBySubType(args.schemeId, "ACCOUNTS_RECEIVABLE", fundType);
  const incomeAccount = await getSystemAccountBySubType(args.schemeId, "LEVY_INCOME", fundType);
  // A scheme whose chart of accounts is not seeded: nothing to post to, as before.
  if (!receivableAccount || !incomeAccount) return true;

  const entryNumber = await getNextEntryNumber(args.schemeId);
  const entry = await createJournalEntry({
    schemeId: args.schemeId,
    entryNumber,
    transactionDate: args.date,
    description: `Levies raised — ${args.noticeCount} notice(s) due ${args.date.split("-").reverse().join("/")}, ${fundType === "CAPITAL_WORKS" ? "Capital Works" : "Administrative"} fund`,
    entryType: "AUTO",
    sourceType: "LEVY_RAISED",
    sourceId: args.scheduleId,
    createdBy: args.profileId,
    lines: [
      { accountCodeId: receivableAccount.id, fundId: args.fundId, debit: args.totalAmount, description: "Levies receivable raised" },
      { accountCodeId: incomeAccount.id, fundId: args.fundId, credit: args.totalAmount, description: "Levy income recognised" },
    ],
  });
  try {
    await postJournalEntry(entry.id, args.profileId);
  } catch (err) {
    // Not posted (for example a closed period): remove the draft, so a retry does not leave another.
    await db.transaction(async (tx) => {
      await tx.orm.public.JournalLine.where((l) => l.journalEntryId.eq(entry.id)).deleteAndCount();
      await tx.orm.public.JournalEntry.where((e) => and(e.id.eq(entry.id), e.status.eq("DRAFT"))).delete();
    }).catch((cleanup) => logError("[levy-notices] could not remove an unposted levy journal:", cleanup));
    throw err;
  }
  return true;
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

/** The lot's current owner (an active owner membership), so a sale after planning is followed. */
async function currentOwners(schemeId: string): Promise<Map<string, string | null>> {
  const lots = await loadPlanLots(schemeId);
  return new Map(lots.map((l) => [l.lotId, l.ownerId]));
}

/**
 * Issue notices that exist as DRAFT: claim each (DRAFT to ISSUED, addressed
 * to the lot's current owner), post the levy dated each due date, apply any
 * owner credit, then email them.
 */
export async function issueNoticeBatch(input: {
  schemeId: string;
  scheduleId: string;
  fundId: string;
  issuerId: string;
  noticeDate: string;
  notices: BatchNotice[];
  isUrgentSpecialLevy?: boolean;
}): Promise<{ count: number; emailed: number; creditAppliedCents: number }> {
  if (input.notices.length === 0) return { count: 0, emailed: 0, creditAppliedCents: 0 };
  const owners = await currentOwners(input.schemeId);
  // The building's rule pack, recorded on each notice it issues.
  const { label: rulePack } = await rulesForScheme(input.schemeId);
  // One stamp for this run's claims, so a failure puts back only what this run claimed.
  const claimedAt = new Date().toISOString();
  const claimed: BatchNotice[] = [];
  for (const n of input.notices) {
    const ownerId = owners.has(n.lotId) ? owners.get(n.lotId)! : n.ownerId;
    if (await issueLevyNotice(n.id, { ownerId, dueDate: n.dueDate, claimedAt, rulePack })) claimed.push({ ...n, ownerId });
  }
  if (claimed.length === 0) return { count: 0, emailed: 0, creditAppliedCents: 0 };

  // The levy raised, one entry per due date, dated the due date. If it cannot
  // be posted, this run's notices go back to DRAFT: nothing was sent yet.
  const posted = await postLevies(input.schemeId, input.fundId, input.scheduleId, input.issuerId, claimed);
  if (posted.length < claimed.length) {
    const unposted = claimed.filter((n) => !posted.includes(n));
    for (const n of unposted) {
      await db.orm.public.LevyNotice
        .where((x) => and(x.id.eq(n.id), x.status.eq("ISSUED"), x.levyPostPending.eq(true), x.issuedAt.eq(ts(claimedAt))))
        .updateAndCount({ status: "DRAFT", issuedAt: null, levyPostPending: false, rulePack: null });
    }
    if (!posted.length) throw postLevies.lastError ?? new Error("The levy could not be posted.");
    claimed.splice(0, claimed.length, ...posted);
  }

  const totalCents = claimed.reduce((s, n) => s + n.amountCents, 0);
  await logActivity({
    schemeId: input.schemeId,
    actorId: input.issuerId,
    action: "LEVY_NOTICES_ISSUED",
    entityType: "LevySchedule",
    entityId: input.scheduleId,
    metadata: { count: claimed.length, total: totalCents / 100, dueDates: [...new Set(claimed.map((n) => n.dueDate))] },
  });

  let creditAppliedCents = 0;
  const scheme = await db.orm.public.Scheme.where((s) => s.id.eq(input.schemeId)).first();
  if (scheme?.autoApplyOwnerCredit !== false) {
    creditAppliedCents = await applyOwnerCredit({ schemeId: input.schemeId, lotIds: [...new Set(claimed.map((n) => n.lotId))], actorId: input.issuerId, date: input.noticeDate }).catch((err) => {
      logError("[levy-notices] owner credit could not be applied:", err);
      return 0;
    });
  }

  const emailed = await sendIssuedNotices({
    schemeId: input.schemeId,
    fundId: input.fundId,
    issuerId: input.issuerId,
    noticeDate: input.noticeDate,
    notices: claimed.map((n) => ({ noticeId: n.id, lotId: n.lotId, lotNumber: n.lotNumber, ownerId: n.ownerId, noticeNumber: n.noticeNumber, dueDate: n.dueDate, amountCents: n.amountCents })),
    onSent: markEmailed,
  });
  await logActivity({
    schemeId: input.schemeId,
    actorId: input.issuerId,
    action: "LEVY_NOTICES_EMAILED",
    entityType: "LevySchedule",
    entityId: input.scheduleId,
    metadata: { emailed, notices: claimed.length },
  });
  return { count: claimed.length, emailed, creditAppliedCents };
}

/**
 * Post the levy for issued notices, one entry per due date, dated it, and
 * clear each notice's pending mark. Returns the notices posted; stops at the
 * first entry that cannot be posted (keeping its error for the caller).
 */
async function postLevies(schemeId: string, fundId: string, scheduleId: string, actorId: string, notices: BatchNotice[]): Promise<BatchNotice[]> {
  postLevies.lastError = null;
  const byDue = new Map<string, BatchNotice[]>();
  for (const n of notices) byDue.set(n.dueDate, [...(byDue.get(n.dueDate) ?? []), n]);
  const posted: BatchNotice[] = [];
  for (const [dueDate, list] of [...byDue].sort(([a], [b]) => a.localeCompare(b))) {
    try {
      await postLevyRaisedJournal({
        schemeId,
        fundId,
        scheduleId,
        totalAmount: list.reduce((s, n) => s + n.amountCents, 0) / 100,
        noticeCount: list.length,
        profileId: actorId,
        date: dueDate,
      });
    } catch (err) {
      postLevies.lastError = err;
      logError(`[levy-notices] the levy due ${dueDate} for schedule ${scheduleId} could not be posted:`, err);
      break;
    }
    for (const n of list) await db.orm.public.LevyNotice.where((x) => and(x.id.eq(n.id), x.levyPostPending.eq(true))).updateAndCount({ levyPostPending: false });
    posted.push(...list);
  }
  return posted;
}
postLevies.lastError = null as unknown;

/** How long a notice may stay pending before the daily job takes it over (a run lasts at most 5 minutes). */
const PENDING_GRACE_MS = 30 * 60 * 1000;

/**
 * Post the levy for notices a run issued but did not get to post (it was
 * stopped part way). Each is taken over with one conditional UPDATE, so two
 * sweeps at once do not both post it; if posting fails it is marked pending
 * again for the next run.
 */
export async function postPendingLevies(now = new Date()): Promise<number> {
  const before = new Date(now.getTime() - PENDING_GRACE_MS).toISOString();
  const pending = await db.orm.public.LevyNotice
    .where((n) => and(n.levyPostPending.eq(true), n.issuedAt.lte(ts(before))))
    .limit(2000)
    .all();
  let posted = 0;
  const bySchedule = new Map<string, typeof pending>();
  for (const n of pending) bySchedule.set(n.levyScheduleId, [...(bySchedule.get(n.levyScheduleId) ?? []), n]);
  for (const [scheduleId, list] of bySchedule) {
    const schedule = await db.orm.public.LevySchedule.where((x) => x.id.eq(scheduleId)).first();
    const actorId = schedule ? await issuerFor(schedule.schemeId, schedule.approvedBy ?? null) : null;
    if (!schedule || !actorId) continue;
    const mine: BatchNotice[] = [];
    for (const n of list) {
      // Taken over by this sweep: pending stays true, issuedAt moves, so another sweep's filter no longer matches.
      const stamp = now.toISOString();
      const took = await db.orm.public.LevyNotice
        .where((x) => and(x.id.eq(n.id), x.levyPostPending.eq(true), x.issuedAt.eq(ts(String(n.issuedAt)))))
        .updateAndCount({ issuedAt: ts(stamp) });
      if (took === 1) mine.push({ id: n.id, noticeNumber: String(n.noticeNumber), lotId: n.lotId, lotNumber: "", ownerId: n.ownerId ?? null, dueDate: toIsoDay(n.dueDate), amountCents: toCents(String(n.amountDue)) });
    }
    if (!mine.length) continue;
    const done = await postLevies(schedule.schemeId, schedule.fundId, scheduleId, actorId, mine);
    posted += done.length;
    if (done.length) {
      await logActivity({ schemeId: schedule.schemeId, actorId, action: "LEVY_NOTICES_ISSUED", entityType: "LevySchedule", entityId: scheduleId, metadata: { count: done.length, note: "Levy posted by the daily job after an interrupted run." } });
    }
  }
  return posted;
}

async function markEmailed(noticeId: string) {
  await db.orm.public.LevyNotice.where((n) => n.id.eq(noticeId)).update({ emailedAt: ts(new Date().toISOString()) });
}

/** Who a scheduled batch is issued by: the Adviser who approved the schedule while still an active Adviser of the scheme, else another active Adviser. */
export async function issuerFor(schemeId: string, approvedBy: string | null): Promise<string | null> {
  const advisers = await db.orm.public.SchemeMembership
    .where((x) => and(x.schemeId.eq(schemeId), x.role.eq("ADVISER"), x.isActive.eq(true)))
    .limit(50)
    .all();
  if (approvedBy && advisers.some((a) => a.profileId === approvedBy)) return approvedBy;
  return advisers[0]?.profileId ?? null;
}

// ─── 1. Issuing planned notices on their day ────────────────────────────────

export interface DueRunResult {
  scheduleId: string;
  schemeId: string;
  issued: number;
  held: string[] | null;
  /** Notices past their 5-week mark, waiting for the Adviser to confirm. */
  awaitingConfirmation: number;
}

/** Every DRAFT notice of the given schedules due on or before `horizon`, earliest due first, read a page at a time. */
async function draftNoticesDue(scheduleIds: string[], horizon: string) {
  const out: Awaited<ReturnType<typeof readPage>> = [];
  async function readPage(offset: number) {
    return db.orm.public.LevyNotice
      .where((n) => and(n.levyScheduleId.in(scheduleIds), n.status.eq("DRAFT"), n.dueDate.lte(ts(horizon))))
      .orderBy([(n) => n.dueDate.asc(), (n) => n.id.asc()])
      .offset(offset)
      .limit(PAGE)
      .all();
  }
  for (let offset = 0; ; offset += PAGE) {
    const page = await readPage(offset);
    out.push(...page);
    if (page.length < PAGE) break;
  }
  return out;
}

/** Issue every planned notice of an active schedule whose day has come (`today`, Sydney). Safe to run more than once a day. */
export async function issueDueNotices(today: string): Promise<DueRunResult[]> {
  const schedules = await db.orm.public.LevySchedule.where((s) => s.status.eq("ACTIVE")).limit(5000).all();
  if (!schedules.length) return [];
  // Read far enough ahead for every rule pack; each building's own rule decides below.
  const lookAhead = Math.max(...Object.values(RULE_PACKS).map((p) => p.rules.LEVY_NOTICE_RULES.issueDaysBeforeDue));
  const horizon = addDays(today, lookAhead);
  const due = await draftNoticesDue(schedules.map((s) => s.id), horizon);
  if (!due.length) return [];
  const schemes = await db.orm.public.Scheme.where((s) => s.id.in([...new Set(schedules.map((x) => x.schemeId))])).limit(5000).all();
  const stateOf = new Map(schemes.map((s) => [s.id, s.state]));
  const lots = await db.orm.public.Lot.where((l) => l.id.in([...new Set(due.map((n) => n.lotId))])).limit(20000).all();
  const results: DueRunResult[] = [];

  for (const schedule of schedules) {
    const mine = due.filter((n) => n.levyScheduleId === schedule.id);
    if (!mine.length) continue;
    try {
      // The building's own levy notice rules (throws for a state with no rule pack).
      const rule = rulesForState(stateOf.get(schedule.schemeId)).rules.LEVY_NOTICE_RULES;
      // Not yet in the building's issue window: next run.
      const inWindow = mine.filter((n) => issueDateFor(toIsoDay(n.dueDate), rule) <= today);
      if (!inWindow.length) continue;
      const issuerId = await issuerFor(schedule.schemeId, schedule.approvedBy ?? null);
      if (!issuerId) {
        results.push({ scheduleId: schedule.id, schemeId: schedule.schemeId, issued: 0, held: ["The building has no active Adviser to issue the notices."], awaitingConfirmation: 0 });
        continue;
      }
      // On time: today is the 5-week mark. Past it: the Adviser confirms first.
      const onTime = inWindow.filter((n) => issueTiming(toIsoDay(n.dueDate), today, rule).kind === "planned");
      const late = inWindow.filter((n) => issueTiming(toIsoDay(n.dueDate), today, rule).kind !== "planned");
      if (late.length) {
        const lines = [...new Set(late.map((n) => lateMessage(issueTiming(toIsoDay(n.dueDate), today, rule), `Notices due ${toIsoDay(n.dueDate).split("-").reverse().join("/")}`, rule)!))];
        await logActivity({
          schemeId: schedule.schemeId,
          actorId: issuerId,
          action: "LEVY_NOTICES_HELD",
          entityType: "LevySchedule",
          entityId: schedule.id,
          metadata: { count: late.length, reason: "Past the 5-week mark: confirm on the levy schedule to send them.", missing: lines },
        });
      }
      const notices: BatchNotice[] = onTime.map((n) => ({
        id: n.id,
        noticeNumber: String(n.noticeNumber),
        lotId: n.lotId,
        lotNumber: String(lots.find((l) => l.id === n.lotId)?.lotNumber ?? "?"),
        ownerId: n.ownerId ?? null,
        dueDate: toIsoDay(n.dueDate),
        amountCents: toCents(String(n.amountDue)),
      }));
      if (!notices.length) {
        results.push({ scheduleId: schedule.id, schemeId: schedule.schemeId, issued: 0, held: null, awaitingConfirmation: late.length });
        continue;
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
        results.push({ scheduleId: schedule.id, schemeId: schedule.schemeId, issued: 0, held: missing.map((m) => m.message), awaitingConfirmation: late.length });
        continue;
      }
      const r = await issueNoticeBatch({ schemeId: schedule.schemeId, scheduleId: schedule.id, fundId: schedule.fundId, issuerId, noticeDate: today, notices });
      results.push({ scheduleId: schedule.id, schemeId: schedule.schemeId, issued: r.count, held: null, awaitingConfirmation: late.length });
    } catch (err) {
      logError(`[levy-notices] schedule ${schedule.id} could not be issued:`, err);
      // A closed or locked period is the Adviser's to fix: say so in the building's activity.
      const message =
        err instanceof UnsupportedJurisdictionError || (err instanceof Error && /^(Cannot post to a closed period|This period is locked)/.test(err.message))
          ? err.message
          : "The notices could not be issued; see the server log.";
      try {
        const issuerId = await issuerFor(schedule.schemeId, schedule.approvedBy ?? null);
        if (issuerId) await logActivity({ schemeId: schedule.schemeId, actorId: issuerId, action: "LEVY_NOTICES_HELD", entityType: "LevySchedule", entityId: schedule.id, metadata: { missing: [message] } });
      } catch {
        // The result below still reports it.
      }
      results.push({ scheduleId: schedule.id, schemeId: schedule.schemeId, issued: 0, held: [message], awaitingConfirmation: 0 });
    }
  }
  return results;
}

/**
 * The planned notices of a schedule whose 5-week mark has passed, as the
 * Adviser sees them before confirming: each with the day it would go out
 * (today) and its due date (moved to 30 days away when fewer are left).
 */
export async function overdueDrafts(schemeId: string, scheduleId: string, today: string) {
  const rule = (await rulesForScheme(schemeId)).rules.LEVY_NOTICE_RULES;
  const drafts = await db.orm.public.LevyNotice
    .where((n) => and(n.schemeId.eq(schemeId), n.levyScheduleId.eq(scheduleId), n.status.eq("DRAFT")))
    .limit(5000)
    .all();
  return drafts
    .map((n) => ({ n, t: issueTiming(toIsoDay(n.dueDate), today, rule) }))
    .filter((x) => x.t.kind !== "planned");
}

/**
 * Send, once the Adviser confirms, the planned notices of a schedule whose
 * 5-week mark has passed. Those with fewer than 30 days left fall due 30
 * days from today instead.
 */
export async function issueOverdueDrafts(input: { schemeId: string; scheduleId: string; fundId: string; issuerId: string; today: string }) {
  const list = await overdueDrafts(input.schemeId, input.scheduleId, input.today);
  if (!list.length) return { count: 0, emailed: 0, missing: [] as string[] };
  const lots = await db.orm.public.Lot.where((l) => l.id.in([...new Set(list.map((x) => x.n.lotId))])).limit(5000).all();
  const notices: BatchNotice[] = list.map(({ n, t }) => ({
    id: n.id,
    noticeNumber: String(n.noticeNumber),
    lotId: n.lotId,
    lotNumber: String(lots.find((l) => l.id === n.lotId)?.lotNumber ?? "?"),
    ownerId: n.ownerId ?? null,
    dueDate: t.dueDate,
    amountCents: toCents(String(n.amountDue)),
  }));
  const missing = await checkPlannedNotices({ schemeId: input.schemeId, fundId: input.fundId, issuerId: input.issuerId, noticeDate: input.today, notices });
  if (missing.length) return { count: 0, emailed: 0, missing: missing.map((m) => m.message) };
  const r = await issueNoticeBatch({ ...input, noticeDate: input.today, notices });
  return { count: r.count, emailed: r.emailed, missing: [] as string[] };
}

// ─── 2. Sending failed emails again ─────────────────────────────────────────

/** Email again any notice issued in the last few days (by this process) whose email did not go. */
export async function retryNoticeEmails(today: string): Promise<number> {
  const since = addDays(today, -EMAIL_RETRY_DAYS);
  const notices = await db.orm.public.LevyNotice
    .where((n) =>
      and(
        n.status.in(["ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE"]),
        n.emailedAt.isNull(),
        n.levyPostPending.eq(false),
        n.ownerId.isNotNull(),
        // Recent ones only: from 25 Oct 2026 every issue records emailedAt.
        n.issuedAt.gte(ts(`${since}T00:00:00.000Z`)),
      ),
    )
    .limit(2000)
    .all();
  let sent = 0;
  const bySchedule = new Map<string, typeof notices>();
  for (const n of notices) bySchedule.set(n.levyScheduleId, [...(bySchedule.get(n.levyScheduleId) ?? []), n]);
  for (const [scheduleId, list] of bySchedule) {
    try {
      const schedule = await db.orm.public.LevySchedule.where((s) => s.id.eq(scheduleId)).first();
      if (!schedule) continue;
      const issuerId = await issuerFor(schedule.schemeId, schedule.approvedBy ?? null);
      if (!issuerId) continue;
      const lots = await db.orm.public.Lot.where((l) => l.id.in([...new Set(list.map((n) => n.lotId))])).limit(5000).all();
      sent += await sendIssuedNotices({
        schemeId: schedule.schemeId,
        fundId: schedule.fundId,
        issuerId,
        noticeDate: list[0].issuedAt ? sydneyDay(String(list[0].issuedAt)) : today,
        notices: list.map((n) => ({
          noticeId: n.id,
          lotId: n.lotId,
          lotNumber: String(lots.find((l) => l.id === n.lotId)?.lotNumber ?? "?"),
          ownerId: n.ownerId ?? null,
          noticeNumber: String(n.noticeNumber),
          dueDate: toIsoDay(n.dueDate),
          amountCents: toCents(String(n.amountDue)),
        })),
        onSent: markEmailed,
      });
    } catch (err) {
      logError(`[levy-notices] could not resend notices for schedule ${scheduleId}:`, err);
    }
  }
  return sent;
}

/** The Sydney date of a moment (the notice date the owner saw). */
function sydneyDay(isoTimestamp: string): string {
  const d = new Date(isoTimestamp.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? isoTimestamp.slice(0, 10) : d.toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
}

/** The daily job: post any levy an interrupted run left, issue, then resend failed emails. */
export async function runLevyNoticeDay(today: string) {
  const recovered = await postPendingLevies();
  const issued = await issueDueNotices(today);
  const resent = await retryNoticeEmails(today);
  return { recovered, issued, resent };
}
