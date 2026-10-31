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
import { capitalise, noticeLeadMark } from "@/lib/jurisdiction/wording";
import { fundTypeWords, ledgerFundDefinition } from "@/lib/jurisdiction/funds";
import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";
import { getSystemAccountBySubType } from "@/lib/queries/account-codes";
import { addNumberedJournal, numberedTransaction } from "@/lib/queries/journal-numbering";
import { issueLevyNotice } from "@/lib/queries/levy-schedules";
import { logActivity } from "@/lib/queries/activity-log";
import { applyOwnerCredit } from "@/lib/finance/owner-credits";
import { logError } from "@/lib/log";
import { checkPlannedNotices, sendIssuedNotices } from "./notice-content-data";
import { loadPlanLots } from "./load-plan-lots";
import { addDays, toCents, toIsoDay } from "./notice-plan";
import { issueDateFor, issueTiming, lateMessage } from "./issue-timing";
import { noticeTimingFor } from "./notice-rule-check";
import { RULE_PACKS, UnsupportedJurisdictionError } from "@/config/statutory";
import { messageTermsFor, rulesForScheme, rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { platformToday, storedDayIn, todayIn } from "@/lib/jurisdiction/time-zone";
import { schemeTimeZone, timeZoneOf } from "@/lib/jurisdiction/scheme-time";
import { activeSchemesOnly, inactiveSchemeIds } from "@/lib/schemes/inactive";

const ts = (v: string) => v as unknown as TimestampString<3>;
const PAGE = 1000;
/** How long a failed notice email is retried. */
const EMAIL_RETRY_DAYS = 3;

/**
 * DR Levies Receivable, CR Levy Income for levies raised against a fund. The
 * entry is numbered, written and posted in one transaction under the
 * building's numbering lock, with the notices' pending marks cleared in it
 * (`noticeIds`, locked in id order after the building). If it cannot be
 * posted (for example a closed period) nothing is kept.
 */
export async function postLevyRaisedJournal(args: {
  schemeId: string;
  fundId: string;
  scheduleId: string;
  totalAmount: number;
  noticeCount: number;
  profileId: string;
  /** The date the levy is raised (YYYY-MM-DD): its due date. */
  date: string;
  /** The notices the levy is raised for, whose pending mark is cleared with the journal. */
  noticeIds?: string[];
}): Promise<boolean> {
  const clearPending = async (orm: typeof db.orm) => {
    for (const id of [...(args.noticeIds ?? [])].sort()) {
      await orm.public.LevyNotice.where((x) => and(x.id.eq(id), x.levyPostPending.eq(true))).updateAndCount({ levyPostPending: false });
    }
  };
  if (args.totalAmount <= 0) {
    await clearPending(db.orm);
    return true;
  }
  const fund = await db.orm.public.Fund.where((f) => f.id.eq(args.fundId)).first();
  const fundType = (fund?.fundType ?? "ADMINISTRATIVE") as "ADMINISTRATIVE" | "CAPITAL_WORKS";
  const receivableAccount = await getSystemAccountBySubType(args.schemeId, "ACCOUNTS_RECEIVABLE", fundType);
  const incomeAccount = await getSystemAccountBySubType(args.schemeId, "LEVY_INCOME", fundType);
  // A scheme whose chart of accounts is not seeded: nothing to post to, as before.
  if (!receivableAccount || !incomeAccount) {
    await clearPending(db.orm);
    return true;
  }

  // The fund as the building's pack names it: "Capital Works fund" (NSW), "Sinking fund" (Queensland).
  const { rules: packRules } = await rulesForScheme(args.schemeId);
  const fundWords = fundTypeWords(ledgerFundDefinition(packRules, fundType === "CAPITAL_WORKS" ? "CAPITAL_WORKS" : "ADMINISTRATIVE"));
  // The journal's words, in the building's words for a levy ("Levies raised", "Contributions raised").
  const t = packRules.TERMINOLOGY;
  const Levies = t.levies[0].toUpperCase() + t.levies.slice(1);
  const Levy = t.levy[0].toUpperCase() + t.levy.slice(1);
  await numberedTransaction(args.schemeId, async (tx) => {
    await addNumberedJournal(
      tx,
      {
        schemeId: args.schemeId,
        transactionDate: args.date,
        description: `${Levies} raised — ${args.noticeCount} notice(s) due ${args.date.split("-").reverse().join("/")}, ${fundWords} fund`,
        entryType: "AUTO",
        sourceType: "LEVY_RAISED",
        sourceId: args.scheduleId,
        createdBy: args.profileId,
        lines: [
          { accountCodeId: receivableAccount.id, fundId: args.fundId, debit: args.totalAmount, description: `${Levies} receivable raised` },
          { accountCodeId: incomeAccount.id, fundId: args.fundId, credit: args.totalAmount, description: `${Levy} income recognised` },
        ],
      },
      args.profileId,
    );
    await clearPending(tx.orm);
  });
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
        noticeIds: list.map((n) => n.id),
      });
    } catch (err) {
      postLevies.lastError = err;
      logError(`[levy-notices] the levy due ${dueDate} for schedule ${scheduleId} could not be posted:`, err);
      break;
    }
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
 * again for the next run. A switched off scheme's notices are left as they are.
 */
export async function postPendingLevies(now = new Date()): Promise<number> {
  const before = new Date(now.getTime() - PENDING_GRACE_MS).toISOString();
  const inactive = await inactiveSchemeIds();
  const pending = await db.orm.public.LevyNotice
    .where((n) => and(n.levyPostPending.eq(true), n.issuedAt.lte(ts(before)), ...activeSchemesOnly(n.schemeId, inactive)))
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
      await logActivity({ schemeId: schedule.schemeId, actorId, action: "LEVY_NOTICES_ISSUED", entityType: "LevySchedule", entityId: scheduleId, metadata: { count: done.length, note: `${capitalise((await messageTermsFor(schedule.schemeId)).levy)} posted by the daily job after an interrupted run.` } });
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

/**
 * Issue every planned notice of an active schedule whose day has come. Each
 * building's day is today in its own time zone at `now`. Safe to run more
 * than once a day. A switched off scheme's schedules are left as they are.
 */
export async function issueDueNotices(now: Date = new Date()): Promise<DueRunResult[]> {
  const inactive = await inactiveSchemeIds();
  const schedules = await db.orm.public.LevySchedule.where((s) => and(s.status.eq("ACTIVE"), ...activeSchemesOnly(s.schemeId, inactive))).limit(5000).all();
  if (!schedules.length) return [];
  // Read far enough ahead for every rule pack; each building's own rule decides below.
  const lookAhead = Math.max(...Object.values(RULE_PACKS).map((p) => noticeTimingFor(p.rules.NOTICE_RULES).leadDays));
  // A day of margin, since a building's today can be ahead of StrataVerze's.
  const horizon = addDays(platformToday(now), lookAhead + 1);
  const due = await draftNoticesDue(schedules.map((s) => s.id), horizon);
  if (!due.length) return [];
  const schemes = await db.orm.public.Scheme.where((s) => s.id.in([...new Set(schedules.map((x) => x.schemeId))])).limit(5000).all();
  const stateOf = new Map(schemes.map((s) => [s.id, s.state]));
  const schemeOf = new Map(schemes.map((s) => [s.id, s]));
  const lots = await db.orm.public.Lot.where((l) => l.id.in([...new Set(due.map((n) => n.lotId))])).limit(20000).all();
  const results: DueRunResult[] = [];

  for (const schedule of schedules) {
    const mine = due.filter((n) => n.levyScheduleId === schedule.id);
    if (!mine.length) continue;
    try {
      // The building's own notice rules (throws for a state with no rule pack), and its today.
      const scheduleRules = rulesForState(stateOf.get(schedule.schemeId)).rules;
      const rule = scheduleRules.NOTICE_RULES;
      const today = todayIn(timeZoneOf(schemeOf.get(schedule.schemeId)), now);
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
      // Past the mark and the rules do not let the due date move (a pack's checked rules, WA): held, never sent.
      const stuck = inWindow.filter((n) => issueTiming(toIsoDay(n.dueDate), today, rule).kind === "cannotMove");
      const late = inWindow.filter((n) => !["planned", "cannotMove"].includes(issueTiming(toIsoDay(n.dueDate), today, rule).kind));
      const stuckLines = [...new Set(stuck.map((n) => lateMessage(issueTiming(toIsoDay(n.dueDate), today, rule), `Notices due ${toIsoDay(n.dueDate).split("-").reverse().join("/")}`, rule)!))];
      if (stuck.length) {
        await logActivity({
          schemeId: schedule.schemeId,
          actorId: issuerId,
          action: "LEVY_NOTICES_HELD",
          entityType: "LevySchedule",
          entityId: schedule.id,
          metadata: { count: stuck.length, reason: `Their due date cannot be moved under this building's rules, so they cannot go out. Stop the planned notices on the ${scheduleRules.TERMINOLOGY.levy} schedule if the ${scheduleRules.TERMINOLOGY.levy} is to be raised again.`, missing: stuckLines },
        });
      }
      if (late.length) {
        const lines = [...new Set(late.map((n) => lateMessage(issueTiming(toIsoDay(n.dueDate), today, rule), `Notices due ${toIsoDay(n.dueDate).split("-").reverse().join("/")}`, rule)!))];
        await logActivity({
          schemeId: schedule.schemeId,
          actorId: issuerId,
          action: "LEVY_NOTICES_HELD",
          entityType: "LevySchedule",
          entityId: schedule.id,
          metadata: { count: late.length, reason: `Past the ${noticeLeadMark(rule)}: confirm on the ${scheduleRules.TERMINOLOGY.levy} schedule to send them.`, missing: lines },
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
        results.push({ scheduleId: schedule.id, schemeId: schedule.schemeId, issued: 0, held: stuck.length ? stuckLines : null, awaitingConfirmation: late.length });
        continue;
      }
      // Each notice's period, so a pack that requires each other unit's contribution (the ACT) can have it stated.
      const periodOf = new Map(onTime.map((n) => [n.id, toIsoDay(n.periodStart)]));
      const missing = await checkPlannedNotices({
        schemeId: schedule.schemeId,
        fundId: schedule.fundId,
        issuerId,
        noticeDate: today,
        levyScheduleId: schedule.id,
        notices: notices.map((x) => ({ ...x, periodStart: periodOf.get(x.id) })),
      });
      if (missing.length) {
        await logActivity({
          schemeId: schedule.schemeId,
          actorId: issuerId,
          action: "LEVY_NOTICES_HELD",
          entityType: "LevySchedule",
          entityId: schedule.id,
          metadata: { count: notices.length, missing: missing.map((m) => m.message) },
        });
        results.push({ scheduleId: schedule.id, schemeId: schedule.schemeId, issued: 0, held: [...missing.map((m) => m.message), ...stuckLines], awaitingConfirmation: late.length });
        continue;
      }
      const r = await issueNoticeBatch({ schemeId: schedule.schemeId, scheduleId: schedule.id, fundId: schedule.fundId, issuerId, noticeDate: today, notices });
      results.push({ scheduleId: schedule.id, schemeId: schedule.schemeId, issued: r.count, held: stuck.length ? stuckLines : null, awaitingConfirmation: late.length });
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
  const rule = (await rulesForScheme(schemeId)).rules.NOTICE_RULES;
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
  const all = await overdueDrafts(input.schemeId, input.scheduleId, input.today);
  if (!all.length) return { count: 0, emailed: 0, missing: [] as string[], held: [] as string[] };
  // A notice whose due date the building's rules do not let move (a pack's checked rules, WA) cannot go out:
  // it is held, with why, and the others are sent.
  const stuck = all.filter(({ t }) => t.kind === "cannotMove");
  const held = stuck.length
    ? await (async () => {
        const rule = (await rulesForScheme(input.schemeId)).rules.NOTICE_RULES;
        return [...new Set(stuck.map(({ n, t }) => lateMessage(t, `Notices due ${toIsoDay(n.dueDate).split("-").reverse().join("/")}`, rule)!))];
      })()
    : [];
  const list = all.filter(({ t }) => t.kind !== "cannotMove");
  if (!list.length) return { count: 0, emailed: 0, missing: [] as string[], held };
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
  const periodOf = new Map(list.map(({ n }) => [n.id, toIsoDay(n.periodStart)]));
  const missing = await checkPlannedNotices({
    schemeId: input.schemeId,
    fundId: input.fundId,
    issuerId: input.issuerId,
    noticeDate: input.today,
    levyScheduleId: input.scheduleId,
    notices: notices.map((x) => ({ ...x, periodStart: periodOf.get(x.id) })),
  });
  if (missing.length) return { count: 0, emailed: 0, missing: [...missing.map((m) => m.message), ...held], held };
  const r = await issueNoticeBatch({ ...input, noticeDate: input.today, notices });
  return { count: r.count, emailed: r.emailed, missing: [] as string[], held };
}

// ─── 2. Sending failed emails again ─────────────────────────────────────────

/** Email again any notice issued in the last few days (by this process) whose email did not go, except a switched off scheme's. */
export async function retryNoticeEmails(now: Date = new Date()): Promise<number> {
  // A day of margin before StrataVerze's own day, for buildings in other time zones.
  const since = addDays(platformToday(now), -EMAIL_RETRY_DAYS - 1);
  const inactive = await inactiveSchemeIds();
  const notices = await db.orm.public.LevyNotice
    .where((n) =>
      and(
        ...activeSchemesOnly(n.schemeId, inactive),
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
      const tz = await schemeTimeZone(schedule.schemeId);
      const lots = await db.orm.public.Lot.where((l) => l.id.in([...new Set(list.map((n) => n.lotId))])).limit(5000).all();
      sent += await sendIssuedNotices({
        schemeId: schedule.schemeId,
        fundId: schedule.fundId,
        issuerId,
        // The notice date the owner saw: the day it was issued, in the building's time zone.
        noticeDate: list[0].issuedAt ? storedDayIn(tz, String(list[0].issuedAt).replace(" ", "T")) : todayIn(tz, now),
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

/** The daily job: post any levy an interrupted run left, issue, then resend failed emails. */
export async function runLevyNoticeDay(now: Date = new Date()) {
  const recovered = await postPendingLevies();
  const issued = await issueDueNotices(now);
  const resent = await retryNoticeEmails(now);
  return { recovered, issued, resent };
}
