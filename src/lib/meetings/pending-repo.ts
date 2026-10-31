/**
 * Resolutions decided or taking effect after their meeting (DB access; VIC,
 * ACT and WA stage 2, PR 8b-i, 29 Oct 2026). See ./pending.ts for the rules.
 *
 * A pending row is opened at conduct, in one transaction with the agenda item
 * stored as INTERIM and its AGENDA_OUTCOME_RECORDED event. It is decided once,
 * in one transaction: the row is locked and checked still PENDING, updated,
 * the agenda item set to CARRIED/RESOLVED or LOST/MOTION_LOST (only while it
 * is INTERIM or OPEN), and a PENDING_RESOLUTION_SETTLED event appended to the
 * original meeting. The first writer wins, and a repeat does nothing. The
 * daily run's decision at the end of a period is made again on the locked
 * row, and written only if it still holds (review M3). A fact
 * an adviser records (the notice, a special general meeting notice) is
 * written the same way, with its own event. Meeting events are append-only.
 *
 * Western Australia's voting period (PR 8b-ii) is opened the same way, with
 * the item stored as OPEN. A written vote received after the meeting is a
 * LATE_VOTE lot row, written under the row lock with its event, so the count
 * at the close, made again under the same lock, always sees every vote
 * written before it.
 *
 * Nothing here is read for an NSW or Queensland building: their packs record
 * no pending resolutions, so no row is ever opened for them.
 */
import { db } from "@/prisma/db";
import { and, or } from "@prisma/orm-postgres/orm-client";
import { recordMeetingEvent } from "./events";
import { schemeTimeZones } from "@/lib/jurisdiction/scheme-time";
import { dayIn, formatDateIn, platformToday, todayIn } from "@/lib/jurisdiction/time-zone";
import { logError } from "@/lib/log";
import { activeSchemesOnly, inactiveSchemeIds } from "@/lib/schemes/inactive";
import { addDays } from "@/lib/levies/notice-plan";
import { lotEntitlementFor } from "@/lib/jurisdiction/building-data";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { countEntitlementUse } from "./conduct-tally";
import {
  confirmationResult,
  dayProblem,
  formatDay,
  lateVoteProblem,
  pendingDecision,
  pendingPanelItem,
  petitionStops,
  type LateVote,
  type PendingDates,
  type PendingDecision,
  type PendingFacts,
  type PendingPanelItem,
  type PendingPanelRow,
  type PendingRowView,
  type PendingRuleSnapshot,
  type VotingPeriodFacts,
} from "./pending";
import type { PendingKind, ResolutionTally } from "./rules";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Orm = typeof db.orm;

/** Wait at most 5 seconds for a row lock in this transaction (as the journal does). */
async function setLockTimeout(tx: Tx) {
  await tx.execute(tx.raw.sql`SET LOCAL lock_timeout = '5s'`.affectedCount().build());
}

/** The general meetings a confirming meeting may be, and the special general meetings Victoria s 78 calls. */
const GENERAL_MEETINGS = ["AGM", "EGM", "SGM", "FIRST_AGM"];
const SPECIAL_GENERAL_MEETINGS = ["EGM", "SGM"];
const LIVE_ITEM_STATUSES = ["INTERIM", "OPEN"];

/** A stored date as YYYY-MM-DD (a date column, or null). */
const day = (v: unknown): string | null => (v == null || v === "" ? null : String(v).slice(0, 10));

export type PendingRow = Awaited<ReturnType<typeof readPending>>;

async function readPending(id: string, orm: Orm = db.orm) {
  return orm.public.PendingResolution.where((p) => p.id.eq(id)).first();
}

/** A stored row as the pure decision reads it. */
export function pendingView(row: NonNullable<PendingRow>): PendingRowView {
  const snapshot = row.rule as unknown as PendingRuleSnapshot;
  return {
    kind: row.kind,
    status: row.status,
    madeOn: day(row.madeOn)!,
    windowClosesOn: day(row.windowClosesOn)!,
    noticeDueOn: day(row.noticeDueOn),
    noticeGivenOn: day(row.noticeGivenOn),
    meetingNoticeGivenOn: day(row.meetingNoticeGivenOn),
    meetingNoticeMeetingId: row.meetingNoticeMeetingId ?? null,
    meetingHeldBy: day(row.meetingHeldBy),
    rule: snapshot.pending,
  };
}

export type RepoResult = { ok: true; notice?: string } | { error: string };

// ─── Opening at conduct ────────────────────────────────────────────────────

export interface OpenPendingInput {
  schemeId: string;
  meetingId: string;
  itemId: string;
  state: string;
  kind: PendingKind;
  category: string;
  takesEffectAs: string;
  dates: PendingDates;
  meetingVotes: Record<string, unknown>;
  rule: PendingRuleSnapshot;
  rulePack: string;
  actorId: string;
  /** The AGENDA_OUTCOME_RECORDED payload, written with the row. */
  eventPayload: Record<string, unknown>;
  /** What the agenda item's status and outcome are stored as until it is decided: INTERIM, or OPEN for a voting period (PR 8b-ii). */
  stored?: "INTERIM" | "OPEN";
}

/**
 * Open a pending row at conduct, store the agenda item as INTERIM (OPEN for a
 * voting period) and write its event, in one transaction. Refused when the item is already pending
 * (a second insert for the same item fails on its unique key too).
 */
export async function openPendingResolution(input: OpenPendingInput): Promise<RepoResult> {
  return db.transaction(async (tx) => {
    await setLockTimeout(tx);
    const item = await tx.orm.public.AgendaItem
      .where((a) => and(a.id.eq(input.itemId), a.meetingId.eq(input.meetingId)))
      .forNoKeyUpdate()
      .first();
    if (!item) return { error: "Agenda item not found." };
    if (LIVE_ITEM_STATUSES.includes(String(item.status))) return { error: "This item is already decided later. Nothing was saved." };
    const existing = await tx.orm.public.PendingResolution.where((p) => p.agendaItemId.eq(input.itemId)).first();
    if (existing) return { error: "This item is already decided later. Nothing was saved." };
    const row = await tx.orm.public.PendingResolution.create({
      schemeId: input.schemeId,
      meetingId: input.meetingId,
      agendaItemId: input.itemId,
      state: input.state,
      kind: input.kind,
      category: input.category,
      takesEffectAs: input.takesEffectAs,
      status: "PENDING",
      madeOn: input.dates.madeOn as never,
      windowClosesOn: input.dates.windowClosesOn as never,
      noticeDueOn: input.dates.noticeDueOn as never,
      meetingVotes: input.meetingVotes as never,
      rule: input.rule as never,
      rulePack: input.rulePack,
      recordedBy: input.actorId,
    });
    await tx.orm.public.AgendaItem
      .where((a) => and(a.id.eq(input.itemId), a.meetingId.eq(input.meetingId)))
      .update({ outcome: input.stored ?? "INTERIM", status: input.stored ?? "INTERIM" });
    await recordMeetingEvent(
      {
        meetingId: input.meetingId,
        actorId: input.actorId,
        eventType: "AGENDA_OUTCOME_RECORDED",
        payload: { ...input.eventPayload, pendingId: row.id },
      },
      tx.orm,
    );
    return { ok: true as const };
  });
}

// ─── Deciding ──────────────────────────────────────────────────────────────

export interface SettleInput {
  status: "CARRIED" | "LOST";
  endedBy: string;
  effectiveOn: string | null;
  /** Other fields written with the decision (the petition day, the confirming meeting and item). */
  extra?: Record<string, unknown>;
  /** The lots that signed a petition, written with the decision. */
  petitionLots?: { lotIds: string[]; receivedOn: string };
  /** More for the PENDING_RESOLUTION_SETTLED event. */
  eventDetail?: Record<string, unknown>;
}

/**
 * Decide a pending row in one transaction: lock it, check it is still
 * PENDING, update it, set the agenda item to the outcome (only while it is
 * INTERIM or OPEN, or the transaction is rolled back), and append the event.
 * `actorId` is null for the daily run. False when it was already decided.
 */
export async function settlePendingResolution(id: string, s: SettleInput, actorId: string | null, now: Date = new Date()): Promise<boolean> {
  return db.transaction(async (tx) => {
    await setLockTimeout(tx);
    const row = await tx.orm.public.PendingResolution.where((p) => p.id.eq(id)).forNoKeyUpdate().first();
    if (!row || row.status !== "PENDING") return false;
    await writeSettlement(tx, row, s, actorId, now);
    return true;
  });
}

/** Victoria s 78: the special general meeting linked to a row, as the decision reads it (undefined where none is linked). */
async function linkedMeetingFacts(orm: Orm, row: NonNullable<PendingRow>, tz: string): Promise<PendingFacts> {
  if (!row.meetingNoticeMeetingId) return {};
  const linkedId = row.meetingNoticeMeetingId;
  const m = await orm.public.Meeting.where((x) => x.id.eq(linkedId)).first();
  return { linkedMeeting: m && m.schemeId === row.schemeId ? { openedOn: m.openedAt ? dayIn(tz, String(m.openedAt)) : null } : null };
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Western Australia's voting period (PR 8b-ii): what the close counts, from
 * the row (the meeting's votes and tally, and the category's rule, as kept
 * when it was opened) and its written votes, each weighed by its lot's
 * entitlement where the meeting's votes were (the schedule the category's
 * test reads). Null where the meeting's votes cannot be read; an entitlement
 * that cannot be read is null, and the count then refuses.
 */
async function votingPeriodFacts(orm: Orm, row: NonNullable<PendingRow>): Promise<VotingPeriodFacts | null> {
  const snapshot = isRecord(row.rule) ? (row.rule as unknown as Partial<PendingRuleSnapshot>) : {};
  const votes = isRecord(row.meetingVotes) ? row.meetingVotes : {};
  const lotIds = (list: unknown): string[] | null =>
    Array.isArray(list) && list.every((v) => isRecord(v) && typeof v.lotId === "string") ? list.map((v) => String((v as { lotId: string }).lotId)) : null;
  const counted = lotIds(votes.counted);
  const notCounted = lotIds(votes.notCounted);
  const tally = isRecord(votes.tally) && typeof votes.tally.forCount === "number" && typeof votes.tally.againstCount === "number" ? (votes.tally as unknown as ResolutionTally) : null;
  if (!counted || !notCounted || !tally) return null;
  const resolution = isRecord(snapshot.resolution) ? snapshot.resolution : null;
  const entries = (
    await orm.public.PendingResolutionLot.where((l) => and(l.pendingResolutionId.eq(row.id), l.entry.eq("LATE_VOTE"))).all()
  ).filter((e) => e.vote === "FOR" || e.vote === "AGAINST");
  // Weighed only where the meeting's votes were, by the schedule the category's test reads.
  const use = resolution && (tally.forUE != null || tally.againstUE != null) ? countEntitlementUse(resolution) : null;
  let weigh: (lotId: string) => number | null = () => null;
  if (use && entries.length > 0) {
    const lots = await orm.public.Lot.where((l) => l.id.in(entries.map((e) => e.lotId))).all();
    let rules: ReturnType<typeof rulesForState>["rules"] | null = null;
    try {
      rules = rulesForState(row.state).rules;
    } catch {
      rules = null;
    }
    weigh = (lotId) => {
      const lot = lots.find((l) => l.id === lotId && l.schemeId === row.schemeId);
      if (!lot || !rules) return null;
      try {
        return lotEntitlementFor(rules, lot, use);
      } catch {
        return null;
      }
    };
  }
  const lateVotes: LateVote[] = entries.map((e) => ({ lotId: e.lotId, vote: e.vote as LateVote["vote"], receivedOn: day(e.receivedOn)!, entitlement: weigh(e.lotId) }));
  // The building's lots at the meeting (review M), kept with the row since PR 8b-ii's review; null where not kept.
  const meetingLotIds = Array.isArray(votes.lotIds) && votes.lotIds.every((x) => typeof x === "string") ? (votes.lotIds as string[]) : null;
  return { category: row.category, resolution, meetingTally: tally, enteredLotIds: [...counted, ...notCounted], meetingLotIds, lateVotes };
}

/** What the decision needs beyond the row, read with `orm`: the linked meeting (Victoria s 78), the votes at the close (Western Australia). */
async function factsFor(orm: Orm, row: NonNullable<PendingRow>, tz: string): Promise<PendingFacts> {
  const facts = await linkedMeetingFacts(orm, row, tz);
  return row.kind === "VOTING_PERIOD" ? { ...facts, votingPeriod: await votingPeriodFacts(orm, row) } : facts;
}

/** The settlement a decision to settle writes, with the count at the close for a voting period. */
function settlementOf(decision: Extract<PendingDecision, { settle: true }>): SettleInput {
  return {
    status: decision.status,
    endedBy: decision.endedBy,
    effectiveOn: decision.effectiveOn,
    ...(decision.endedBy === "VOTES_AT_CLOSE" ? { eventDetail: { close: { tally: decision.tally, evaluation: decision.evaluation } } } : {}),
  };
}

/**
 * The daily run and the meeting page (review M3): decide a row at the end of
 * its period only if, once it is locked, pendingDecision on the locked row
 * and the facts as read then (the linked meeting, the written votes) still
 * says to settle, with the same `endedBy` and status. Otherwise it is left as
 * it is (a petition, notice or written vote recorded in the meantime). True
 * when it was decided.
 */
async function settleIfStillDue(id: string, tz: string, expected: { endedBy: string; status: string }, now: Date): Promise<boolean> {
  return db.transaction(async (tx) => {
    await setLockTimeout(tx);
    const row = await tx.orm.public.PendingResolution.where((p) => p.id.eq(id)).forNoKeyUpdate().first();
    if (!row || row.status !== "PENDING") return false;
    const decision = pendingDecision(pendingView(row), todayIn(tz, now), await factsFor(tx.orm, row, tz));
    if (!decision.settle || decision.endedBy !== expected.endedBy || decision.status !== expected.status) return false;
    await writeSettlement(tx, row, settlementOf(decision), null, now);
    return true;
  });
}

/** Write a decision on a row locked and checked PENDING in `tx`: the row, the lots of a petition, the agenda item and the event. */
async function writeSettlement(tx: Tx, row: NonNullable<PendingRow>, s: SettleInput, actorId: string | null, now: Date): Promise<void> {
  const id = row.id;
  await tx.orm.public.PendingResolution.where((p) => and(p.id.eq(id), p.status.eq("PENDING"))).update({
    ...(s.extra ?? {}),
    status: s.status,
    endedBy: s.endedBy,
    effectiveOn: s.effectiveOn as never,
    decidedAt: now.toISOString() as never,
    decidedBy: actorId,
  });
  if (s.petitionLots?.lotIds.length) {
    await tx.orm.public.PendingResolutionLot.createAll(
      s.petitionLots.lotIds.map((lotId) => ({
        pendingResolutionId: id,
        lotId,
        entry: "PETITION",
        vote: null,
        receivedOn: s.petitionLots!.receivedOn as never,
        recordedBy: actorId!,
      })),
    );
  }
  const carried = s.status === "CARRIED";
  const updated = await tx.orm.public.AgendaItem
    .where((a) => and(a.id.eq(row.agendaItemId), a.meetingId.eq(row.meetingId), a.status.in(LIVE_ITEM_STATUSES)))
    .updateAndCount({ outcome: carried ? "RESOLVED" : "MOTION_LOST", status: carried ? "CARRIED" : "LOST" });
  // The item must still be pending: anything else is a fault, and nothing is written.
  if (updated !== 1) throw new Error(`Pending resolution ${id}: its agenda item is no longer pending.`);
  await recordMeetingEvent(
    {
      meetingId: row.meetingId,
      actorId,
      eventType: "PENDING_RESOLUTION_SETTLED",
      payload: {
        pendingId: id,
        itemId: row.agendaItemId,
        kind: row.kind,
        status: s.status,
        endedBy: s.endedBy,
        effectiveOn: s.effectiveOn,
        ...(s.eventDetail ?? {}),
      },
    },
    tx.orm,
  );
}

/** Record a fact on a pending row (still PENDING and not yet recorded), with its event, in one transaction. */
async function recordFact(
  id: string,
  isUnset: (row: NonNullable<PendingRow>) => boolean,
  fields: Record<string, unknown>,
  event: { actorId: string; eventType: string; payload: Record<string, unknown> },
): Promise<RepoResult> {
  return db.transaction(async (tx) => {
    await setLockTimeout(tx);
    const row = await tx.orm.public.PendingResolution.where((p) => p.id.eq(id)).forNoKeyUpdate().first();
    if (!row || row.status !== "PENDING") return { error: "This resolution is already decided. Nothing was saved." };
    if (!isUnset(row)) return { error: "This is already recorded and cannot be changed. Nothing was saved." };
    await tx.orm.public.PendingResolution.where((p) => and(p.id.eq(id), p.status.eq("PENDING"))).update(fields);
    await recordMeetingEvent({ meetingId: row.meetingId, actorId: event.actorId, eventType: event.eventType, payload: { pendingId: id, itemId: row.agendaItemId, ...event.payload } }, tx.orm);
    return { ok: true as const };
  });
}

// ─── The daily run and the meeting page ────────────────────────────────────

export interface SettleRunResult {
  settled: number;
  waiting: number;
  blocked: { id: string; blocker: string }[];
  failed: number;
}

/** Rows read a page at a time by the daily run. */
const SETTLE_PAGE = 500;

/**
 * The pending rows that could be due on `now` (review, low (c)), earliest
 * window first, read a page at a time: those whose window closed before the
 * latest today of any building (StrataVerze's own day plus one, since a
 * building's today can be ahead of it), and those with a special general
 * meeting notice (Victoria s 78), whatever their window. No grace is assumed
 * here, so a row is never left out for want of one: each row's own grace is
 * applied by pendingDecision.
 */
async function pendingRowsThatCouldBeDue(filter: { meetingId?: string }, now: Date) {
  const before = addDays(platformToday(now), 1);
  // A switched off scheme's rows are left as they are, by the daily run and for one meeting alike.
  const inactive = await inactiveSchemeIds();
  const out: NonNullable<PendingRow>[] = [];
  for (let offset = 0; ; offset += SETTLE_PAGE) {
    const page = await db.orm.public.PendingResolution
      .where((p) => {
        const due = and(p.status.eq("PENDING"), or(p.windowClosesOn.lt(before), p.meetingNoticeGivenOn.isNotNull()));
        return and(due, ...(filter.meetingId ? [p.meetingId.eq(filter.meetingId)] : []), ...activeSchemesOnly(p.schemeId, inactive));
      })
      .orderBy([(p) => p.windowClosesOn.asc(), (p) => p.id.asc()])
      .offset(offset)
      .limit(SETTLE_PAGE)
      .all();
    out.push(...page);
    if (page.length < SETTLE_PAGE) break;
  }
  return out;
}

/**
 * Decide every pending row that is due, through pendingDecision: the daily
 * run (/api/cron/pending-resolutions, no filter) and the meeting page (one
 * meeting). Each row is judged on today in its building's time zone, and
 * decided in its own transaction, where it is judged again once locked
 * (review M3: a petition or notice recorded since it was read leaves it as it
 * is); a failure is logged and counted, and never stops the others.
 */
export async function settleDuePendingResolutions(filter: { meetingId?: string } = {}, now: Date = new Date()): Promise<SettleRunResult> {
  const rows = await pendingRowsThatCouldBeDue(filter, now);
  const result: SettleRunResult = { settled: 0, waiting: 0, blocked: [], failed: 0 };
  if (rows.length === 0) return result;
  const zones = await schemeTimeZones(rows.map((r) => r.schemeId));
  // Victoria s 78: the special general meetings called, read only where one is linked.
  const linkedIds = [...new Set(rows.map((r) => r.meetingNoticeMeetingId).filter((x): x is string => !!x))];
  const linked = linkedIds.length ? await db.orm.public.Meeting.where((m) => m.id.in(linkedIds)).limit(linkedIds.length).all() : [];
  for (const row of rows) {
    try {
      const tz = zones.get(row.schemeId);
      if (!tz) throw new Error(`Pending resolution ${row.id}: its building is not found.`);
      const today = todayIn(tz, now);
      const facts: PendingFacts = {};
      if (row.meetingNoticeMeetingId) {
        const m = linked.find((x) => x.id === row.meetingNoticeMeetingId && x.schemeId === row.schemeId);
        facts.linkedMeeting = m ? { openedOn: m.openedAt ? dayIn(tz, String(m.openedAt)) : null } : null;
      }
      // Western Australia's voting period (PR 8b-ii): the votes, read only once its period has closed.
      if (row.kind === "VOTING_PERIOD" && today > day(row.windowClosesOn)!) facts.votingPeriod = await votingPeriodFacts(db.orm, row);
      const decision = pendingDecision(pendingView(row), today, facts);
      if (decision.settle) {
        // Judged again under the row lock: left as it is when it no longer says the same.
        if (await settleIfStillDue(row.id, tz, { endedBy: decision.endedBy, status: decision.status }, now)) result.settled++;
      } else if (decision.blocker) {
        result.blocked.push({ id: row.id, blocker: decision.blocker });
      } else {
        result.waiting++;
      }
    } catch (err) {
      logError("[pending resolutions] a pending resolution could not be decided:", err);
      result.failed++;
    }
  }
  return result;
}

/** The status of an agenda item's pending row (PENDING, CARRIED or LOST), or null where it has none (D10, review M2). Read only for a pack that records them. */
export async function pendingStatusForItem(itemId: string): Promise<string | null> {
  const row = await db.orm.public.PendingResolution.where((p) => p.agendaItemId.eq(itemId)).first();
  return row ? String(row.status) : null;
}

/** A meeting's pending rows (every status), with the lots that signed a petition. */
export async function pendingResolutionsForMeeting(meetingId: string) {
  const rows = await db.orm.public.PendingResolution.where((p) => p.meetingId.eq(meetingId)).limit(500).all();
  if (rows.length === 0) return [];
  const lots = await db.orm.public.PendingResolutionLot.where((l) => l.pendingResolutionId.in(rows.map((r) => r.id))).all();
  return rows.map((r) => ({ row: r, lots: lots.filter((l) => l.pendingResolutionId === r.id && l.entry === "PETITION") }));
}

/**
 * A meeting's pending rows (every status) as the minutes read them (VIC, ACT
 * and WA stage 2, PR 8b-iv). Read only for a pack whose minutes give the
 * later effect.
 */
export async function pendingRowsForMinutes(meetingId: string): Promise<PendingPanelRow[]> {
  const rows = await db.orm.public.PendingResolution.where((p) => p.meetingId.eq(meetingId)).limit(500).all();
  return rows.map((row) => ({
    ...pendingView(row),
    id: row.id,
    agendaItemId: row.agendaItemId,
    petitionReceivedOn: day(row.petitionReceivedOn),
    effectiveOn: day(row.effectiveOn),
    endedBy: row.endedBy ?? null,
  }));
}

// ─── What an adviser records ───────────────────────────────────────────────

/** The building as these records need it. */
export interface PendingScheme {
  id: string;
  timeZone: string;
  totalLots: number | null;
  lots: readonly { id: string; lotNumber: string | number; lotType?: string | null }[];
}

/** A pending row of this building and meeting, or why not. */
async function rowOf(schemeId: string, meetingId: string, pendingId: string): Promise<{ error: string } | { row: NonNullable<PendingRow> }> {
  const row = await readPending(pendingId);
  if (!row || row.schemeId !== schemeId || row.meetingId !== meetingId) return { error: "That resolution is not found on this meeting." };
  if (row.status !== "PENDING") return { error: "This resolution is already decided. Nothing was saved." };
  return { row };
}

/** D3: record the day the owners were given notice of it. A late notice is flagged, not moved. Then decide it if it is due (after its grace, review M1). */
export async function recordPendingNotice(p: { scheme: PendingScheme; meetingId: string; pendingId: string; givenOn: string; actorId: string; now?: Date }): Promise<RepoResult> {
  const found = await rowOf(p.scheme.id, p.meetingId, p.pendingId);
  if ("error" in found) return { error: found.error };
  const view = pendingView(found.row);
  const today = todayIn(p.scheme.timeZone, p.now);
  const problem = dayProblem(p.givenOn, view.madeOn, null, today, "the notice was given");
  if (problem) return { error: problem };
  const late = !!view.noticeDueOn && p.givenOn > view.noticeDueOn;
  // Western Australia's outcome notice (PR 8b-ii review L1): given after the voting period closed is flagged, not refused.
  const afterClose = view.kind === "VOTING_PERIOD" && p.givenOn > view.windowClosesOn;
  const saved = await recordFact(p.pendingId, (r) => r.noticeGivenOn == null, { noticeGivenOn: p.givenOn }, {
    actorId: p.actorId,
    eventType: "PENDING_NOTICE_RECORDED",
    payload: {
      givenOn: p.givenOn,
      ...(late ? { late: true, dueOn: view.noticeDueOn } : {}),
      ...(afterClose ? { late: true, closedOn: view.windowClosesOn } : {}),
    },
  });
  if ("error" in saved) return saved;
  // Due already (its period and its grace ended while the notice was missing): decided now.
  await settleDuePendingResolutions({ meetingId: p.meetingId }, p.now);
  if (afterClose) {
    return {
      ok: true,
      notice: `Recorded. The notice was given after ${formatDay(view.windowClosesOn)}, the day its voting period closed. This is flagged, and the dates of the resolution do not move.`,
    };
  }
  return late
    ? { ok: true, notice: `Recorded. The notice was given after ${formatDay(view.noticeDueOn!)}, the day it was due. This is flagged, and the dates of the resolution do not move.` }
    : { ok: true };
}

/** Victoria s 78: record notice of a special general meeting given within the period, with that meeting (also during the grace after it, review M1). */
export async function recordSpecialMeetingNotice(p: {
  scheme: PendingScheme;
  meetingId: string;
  pendingId: string;
  givenOn: string;
  calledMeetingId: string;
  actorId: string;
  now?: Date;
}): Promise<RepoResult> {
  const found = await rowOf(p.scheme.id, p.meetingId, p.pendingId);
  if ("error" in found) return { error: found.error };
  const view = pendingView(found.row);
  const rule = view.rule.meetingNotice;
  if (view.kind !== "INTERIM_NO_QUORUM" || !rule) return { error: "A special general meeting is not called for this resolution." };
  const problem = dayProblem(p.givenOn, view.madeOn, view.windowClosesOn, todayIn(p.scheme.timeZone, p.now), "the meeting notice was given");
  if (problem) return { error: problem };
  const called = p.calledMeetingId ? await db.orm.public.Meeting.where((m) => m.id.eq(p.calledMeetingId)).first() : null;
  if (!called || called.schemeId !== p.scheme.id || called.id === p.meetingId || !SPECIAL_GENERAL_MEETINGS.includes(String(called.meetingType))) {
    return { error: "Choose the special general meeting of this building that the notice called." };
  }
  const heldBy = addDays(p.givenOn, rule.meetingHeldWithinDays);
  return recordFact(
    p.pendingId,
    (r) => r.meetingNoticeGivenOn == null,
    { meetingNoticeGivenOn: p.givenOn, meetingHeldBy: heldBy, meetingNoticeMeetingId: called.id },
    { actorId: p.actorId, eventType: "PENDING_MEETING_NOTICE_RECORDED", payload: { givenOn: p.givenOn, calledMeetingId: called.id, heldBy } },
  ).then((r) => ("error" in r ? r : { ok: true as const, notice: `Recorded. The special general meeting must be held by ${formatDay(heldBy)}.` }));
}

/**
 * D4, D5: record a petition received within the period, with the lots that
 * signed it. Valid only with strictly more than the pack's share of all the
 * lots (Victoria) or of the lots entitled to vote on the day it was received
 * (the ACT, leaving out lots barred for money owed, `barredLotIds`), and
 * counted only where the lots entered match the building's number of lots
 * (both, review low (b)). A petition received within the window can be
 * recorded during the grace after it (review M1). A
 * petition that is not enough is refused and not stored. A valid one decides
 * the resolution as lost, with the lots, in one transaction.
 */
export async function recordPendingPetition(p: {
  scheme: PendingScheme;
  meetingId: string;
  pendingId: string;
  receivedOn: string;
  lotIds: readonly string[];
  /** The lots barred for money owed on `receivedOn` from voting on `category`, worked out by the caller (the ACT only). */
  barredLotIds?: (receivedOn: string, category: string) => Promise<ReadonlySet<string>>;
  actorId: string;
  now?: Date;
}): Promise<RepoResult> {
  const found = await rowOf(p.scheme.id, p.meetingId, p.pendingId);
  if ("error" in found) return { error: found.error };
  const view = pendingView(found.row);
  const petition = view.rule.petition;
  if (!petition) return { error: "A petition does not stop this resolution." };
  const problem = dayProblem(p.receivedOn, view.madeOn, view.windowClosesOn, todayIn(p.scheme.timeZone, p.now), "the petition was received");
  if (problem) return { error: problem };
  const lots = p.scheme.lots.filter((l) => String(l.lotType ?? "").toUpperCase() !== "COMMON");
  const ids = [...new Set(p.lotIds)];
  if (ids.length === 0) return { error: "Choose the lots that signed the petition." };
  if (ids.some((id) => !lots.some((l) => l.id === id))) return { error: "Choose only lots of this building that signed the petition." };
  // Victoria and the ACT alike: counted only where the lots entered match the building's number of lots.
  if (p.scheme.totalLots == null || p.scheme.totalLots !== lots.length) {
    return { error: `The lots entered (${lots.length}) do not match the building's number of lots (${p.scheme.totalLots ?? "not recorded"}), so the petition cannot be counted. Check the lots first.` };
  }
  let outOf = lots.length;
  let counted = ids;
  if (petition.of !== "ALL_LOTS") {
    const barred = p.barredLotIds ? await p.barredLotIds(p.receivedOn, found.row.category) : new Set<string>();
    outOf = lots.filter((l) => !barred.has(l.id)).length;
    counted = ids.filter((id) => !barred.has(id));
  }
  if (!petitionStops(view.rule, counted.length, outOf)) {
    const share = `${Number((petition.moreThanFractionOf * 100).toFixed(1))}%`;
    return {
      error: `The petition has ${counted.length} of the ${outOf} lots${petition.of === "ALL_LOTS" ? "" : " entitled to vote on that day"}, which is not more than ${share}, so it does not stop the resolution. Nothing was saved.`,
    };
  }
  const done = await settlePendingResolution(
    p.pendingId,
    {
      status: "LOST",
      endedBy: "PETITION",
      effectiveOn: null,
      extra: { petitionReceivedOn: p.receivedOn },
      petitionLots: { lotIds: ids, receivedOn: p.receivedOn },
      eventDetail: { petition: { receivedOn: p.receivedOn, lotIds: ids, counted: counted.length, outOf } },
    },
    p.actorId,
    p.now,
  );
  return done ? { ok: true, notice: "Recorded. The petition stops the resolution, so it is recorded as lost." } : { error: "This resolution is already decided. Nothing was saved." };
}

/**
 * Western Australia s 121(2) (PR 8b-ii, decision D8): record a written vote
 * received after the meeting, FOR or AGAINST, from one of the building's lots
 * at the meeting (review M) with nothing entered at the item and no written
 * vote yet, received from the day it was made to the day its period closes
 * (also during the grace after it). A lot owing money on the day it was
 * received may not vote on the item's category (s 120(2)): judged by the
 * debtor rule kept with the row from the meeting (review L2, `owingLotIds`),
 * or, for a row kept without it, by the current pack (`barredLotIds`), both
 * worked out by the caller. Refused, and nothing is stored. Written under the
 * row lock, with its event.
 */
export async function recordLateVote(p: {
  scheme: PendingScheme;
  meetingId: string;
  pendingId: string;
  lotId: string;
  vote: string;
  receivedOn: string;
  /** For a row kept without the meeting's debtor rule: the lots barred for money owed on `receivedOn` from voting on `category`, by the current pack. */
  barredLotIds: (receivedOn: string, category: string) => Promise<ReadonlySet<string>>;
  /** The building's lots owing money on `receivedOn`, read only where the meeting's debtor rule bars the item's category. */
  owingLotIds: (receivedOn: string) => Promise<ReadonlySet<string>>;
  actorId: string;
  now?: Date;
}): Promise<RepoResult> {
  const found = await rowOf(p.scheme.id, p.meetingId, p.pendingId);
  if ("error" in found) return { error: found.error };
  const view = pendingView(found.row);
  if (view.kind !== "VOTING_PERIOD" || !view.rule.lateVotes) return { error: "Written votes after the meeting are not taken on this resolution. Nothing was saved." };
  const facts = await votingPeriodFacts(db.orm, found.row);
  if (!facts) return { error: "The votes recorded at the meeting cannot be read, so a written vote cannot be added. Nothing was saved." };
  const lot = p.scheme.lots.find((l) => l.id === p.lotId && String(l.lotType ?? "").toUpperCase() !== "COMMON");
  const lotNumber = lot ? String(lot.lotNumber) : null;
  const problem = lateVoteProblem(view, {
    lotId: p.lotId,
    lotNumber,
    vote: p.vote,
    receivedOn: p.receivedOn,
    today: todayIn(p.scheme.timeZone, p.now),
    enteredLotIds: facts.enteredLotIds,
    lateLotIds: facts.lateVotes.map((v) => v.lotId),
    meetingLotIds: facts.meetingLotIds,
  });
  if (problem) return { error: problem };
  // D8: a debt is judged on the day the written vote was received (s 120(2)), by the rule kept from the meeting (review L2).
  const kept = isRecord(found.row.rule) ? (found.row.rule as Record<string, unknown>).debtorsMayVoteOn : undefined;
  const category = found.row.category;
  const barred = Array.isArray(kept)
    ? !kept.includes(category) && (await p.owingLotIds(p.receivedOn)).has(p.lotId)
    : kept === null
      ? false
      : (await p.barredLotIds(p.receivedOn, category)).has(p.lotId);
  if (barred) {
    return {
      error: `Lot ${lotNumber} had an amount owing on ${formatDay(p.receivedOn)}, the day its written vote was received, so it cannot vote on this resolution. Nothing was saved.`,
    };
  }
  return db.transaction(async (tx) => {
    await setLockTimeout(tx);
    const row = await tx.orm.public.PendingResolution.where((r) => r.id.eq(p.pendingId)).forNoKeyUpdate().first();
    if (!row || row.status !== "PENDING") return { error: "This resolution is already decided. Nothing was saved." };
    const existing = await tx.orm.public.PendingResolutionLot
      .where((l) => and(l.pendingResolutionId.eq(row.id), l.lotId.eq(p.lotId), l.entry.eq("LATE_VOTE")))
      .first();
    if (existing) return { error: `A written vote for lot ${lotNumber} is already recorded. Each lot votes once. Nothing was saved.` };
    await tx.orm.public.PendingResolutionLot.create({
      pendingResolutionId: row.id,
      lotId: p.lotId,
      entry: "LATE_VOTE",
      vote: p.vote,
      receivedOn: p.receivedOn as never,
      recordedBy: p.actorId,
    });
    await recordMeetingEvent(
      {
        meetingId: row.meetingId,
        actorId: p.actorId,
        eventType: "PENDING_LATE_VOTE_RECORDED",
        payload: { pendingId: row.id, itemId: row.agendaItemId, lotId: p.lotId, vote: p.vote, receivedOn: p.receivedOn },
      },
      tx.orm,
    );
    return { ok: true as const, notice: `Recorded. Lot ${lotNumber} voted ${p.vote === "FOR" ? "for" : "against"} in writing.` };
  });
}

/**
 * Record a later meeting's decision on it (Victoria s 78: the special general
 * meeting called; the ACT s 3.11: a meeting with a standard quorum confirming
 * it sooner), from that meeting's item as recorded.
 */
export async function recordPendingConfirmation(p: {
  scheme: PendingScheme;
  meetingId: string;
  pendingId: string;
  confirmingMeetingId: string;
  confirmingItemId: string;
  actorId: string;
  now?: Date;
}): Promise<RepoResult> {
  const found = await rowOf(p.scheme.id, p.meetingId, p.pendingId);
  if ("error" in found) return { error: found.error };
  const view = pendingView(found.row);
  const meeting = p.confirmingMeetingId ? await db.orm.public.Meeting.where((m) => m.id.eq(p.confirmingMeetingId)).first() : null;
  if (!meeting || meeting.schemeId !== p.scheme.id || meeting.id === p.meetingId || !GENERAL_MEETINGS.includes(String(meeting.meetingType))) {
    return { error: "Choose a later general meeting of this building." };
  }
  const item = p.confirmingItemId ? await db.orm.public.AgendaItem.where((a) => and(a.id.eq(p.confirmingItemId), a.meetingId.eq(meeting.id))).first() : null;
  if (!item) return { error: "Choose a motion from that meeting." };
  // The ACT: the chair's standard quorum answer for that item, from its latest recorded outcome.
  let standardQuorum: boolean | null = null;
  if (view.rule.confirmedSoonerBy === "STANDARD_QUORUM_MEETING") {
    const events = await db.orm.public.MeetingEvent
      .where((e) => and(e.meetingId.eq(meeting.id), e.eventType.eq("AGENDA_OUTCOME_RECORDED")))
      .orderBy((e) => e.createdAt.asc())
      .all();
    const latest = events.filter((e) => (e.payload as { itemId?: unknown } | null)?.itemId === item.id).at(-1);
    const answer = (latest?.payload as { attestation?: { quorumPresent?: unknown } } | null)?.attestation?.quorumPresent;
    standardQuorum = typeof answer === "boolean" ? answer : null;
  }
  const result = confirmationResult(view, {
    meetingDay: dayIn(p.scheme.timeZone, String(meeting.startTime ?? meeting.scheduledAt)),
    // Victoria s 78: held on the day it was opened, the test D7 uses.
    openedOn: meeting.openedAt ? dayIn(p.scheme.timeZone, String(meeting.openedAt)) : null,
    isLinkedMeeting: view.meetingNoticeMeetingId === meeting.id,
    itemStatus: String(item.status),
    standardQuorum,
  });
  if ("error" in result) return { error: result.error };
  const done = await settlePendingResolution(
    p.pendingId,
    {
      status: result.status,
      endedBy: result.endedBy,
      effectiveOn: result.effectiveOn,
      extra: { confirmedMeetingId: meeting.id, confirmedItemId: item.id },
      eventDetail: { confirmedMeetingId: meeting.id, confirmedItemId: item.id },
    },
    p.actorId,
    p.now,
  );
  if (!done) return { error: "This resolution is already decided. Nothing was saved." };
  return {
    ok: true,
    notice: result.status === "CARRIED" ? `Recorded. It took effect on ${formatDay(result.effectiveOn)}.` : "Recorded. It was not confirmed, so it is recorded as lost.",
  };
}

// ─── The meeting page's "Decided later" panel ──────────────────────────────

/** A meeting and the motions offered to confirm a resolution with. */
export interface ConfirmChoice {
  meetingId: string;
  label: string;
  items: { id: string; label: string }[];
}

/** One panel item with the meetings it may be confirmed at. */
export type PendingPanelEntry = PendingPanelItem & { confirmChoices: ConfirmChoice[] };

export interface PendingPanelData {
  items: PendingPanelEntry[];
  /** The building's lots (common property left out), for a petition. */
  lots: { id: string; lotNumber: string }[];
  /** The building's special general meetings other than this one (Victoria s 78). */
  specialMeetings: { id: string; label: string }[];
}

/**
 * What the meeting page shows of the meeting's resolutions decided later, or
 * null where it has none. Read only for a building whose pack records them.
 */
export async function pendingPanelData(p: {
  scheme: PendingScheme;
  meetingId: string;
  /** Each agenda item of the meeting, as named on the page ("3. Repaint the foyer"). */
  itemLabels: ReadonlyMap<string, string>;
  now?: Date;
}): Promise<PendingPanelData | null> {
  const found = await pendingResolutionsForMeeting(p.meetingId);
  if (found.length === 0) return null;
  const tz = p.scheme.timeZone;
  const today = todayIn(tz, p.now);
  const meetings = (await db.orm.public.Meeting.where((m) => m.schemeId.eq(p.scheme.id)).limit(200).all()).filter((m) => !m.deletedAt);
  const label = (m: (typeof meetings)[number]) => `${m.title} (${formatDateIn(tz, String(m.startTime ?? m.scheduledAt))})`;
  const others = meetings.filter((m) => m.id !== p.meetingId && GENERAL_MEETINGS.includes(String(m.meetingType)));
  const decided = others.length
    ? await db.orm.public.AgendaItem.where((a) => and(a.meetingId.in(others.map((m) => m.id)), a.status.in(["CARRIED", "LOST"]))).limit(5000).all()
    : [];
  const lotNumber = new Map(p.scheme.lots.map((l) => [l.id, String(l.lotNumber)]));
  const choicesFor = (ids: readonly string[], statuses: readonly string[]): ConfirmChoice[] =>
    others
      .filter((m) => ids.includes(m.id))
      .map((m) => ({
        meetingId: m.id,
        label: label(m),
        items: decided
          .filter((a) => a.meetingId === m.id && statuses.includes(String(a.status)))
          .sort((a, b) => a.position - b.position)
          .map((a) => ({ id: a.id, label: `${a.position}. ${a.title} (${a.status === "CARRIED" ? "carried" : "lost"})` })),
      }))
      .filter((c) => c.items.length > 0);

  const buildingLots = p.scheme.lots
    .filter((l) => String(l.lotType ?? "").toUpperCase() !== "COMMON")
    .map((l) => ({ id: l.id, lotNumber: String(l.lotNumber) }))
    .sort((a, b) => a.lotNumber.localeCompare(b.lotNumber, undefined, { numeric: true }));
  // Western Australia's voting period (PR 8b-ii): the votes at the meeting and the written votes, read only for its rows.
  const voting = new Map<string, VotingPeriodFacts | null>();
  for (const { row } of found) if (row.kind === "VOTING_PERIOD") voting.set(row.id, await votingPeriodFacts(db.orm, row));
  const items = found.map(({ row, lots }) => {
    const view = pendingView(row);
    const called = row.meetingNoticeMeetingId ? meetings.find((m) => m.id === row.meetingNoticeMeetingId) : undefined;
    const facts: PendingFacts = {
      ...(row.meetingNoticeMeetingId ? { linkedMeeting: called ? { openedOn: called.openedAt ? dayIn(tz, String(called.openedAt)) : null } : null } : {}),
      ...(voting.has(row.id) ? { votingPeriod: voting.get(row.id) } : {}),
    };
    const confirmed = row.confirmedMeetingId ? meetings.find((m) => m.id === row.confirmedMeetingId) : undefined;
    const confirmedItem = row.confirmedItemId ? decided.find((a) => a.id === row.confirmedItemId) : undefined;
    const panel = pendingPanelItem(
      { ...view, id: row.id, agendaItemId: row.agendaItemId, petitionReceivedOn: day(row.petitionReceivedOn), effectiveOn: day(row.effectiveOn), endedBy: row.endedBy ?? null },
      {
        itemLabel: p.itemLabels.get(row.agendaItemId) ?? "An agenda item",
        today,
        facts,
        petitionLots: lots.map((l) => lotNumber.get(l.lotId) ?? "?"),
        calledMeeting: called ? label(called) : null,
        confirmedBy: confirmed ? `${label(confirmed)}${confirmedItem ? `, motion ${confirmedItem.position}` : ""}` : null,
        ...(row.kind === "VOTING_PERIOD" ? { lots: buildingLots } : {}),
      },
    );
    // Victoria s 78: the meeting called only, its motions carried or lost. The ACT: any later general meeting's carried motions.
    const confirmChoices = !panel.canConfirm
      ? []
      : row.kind === "INTERIM_NO_QUORUM"
        ? choicesFor(row.meetingNoticeMeetingId ? [row.meetingNoticeMeetingId] : [], ["CARRIED", "LOST"])
        : choicesFor(others.map((m) => m.id), ["CARRIED"]);
    return { ...panel, confirmChoices };
  });
  return {
    items,
    lots: buildingLots,
    specialMeetings: meetings
      .filter((m) => m.id !== p.meetingId && SPECIAL_GENERAL_MEETINGS.includes(String(m.meetingType)))
      .map((m) => ({ id: m.id, label: label(m) })),
  };
}
