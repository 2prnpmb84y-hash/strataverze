/**
 * Resolutions decided or taking effect after their meeting (DB access; VIC,
 * ACT and WA stage 2, PR 8b-i, 29 Oct 2026). See ./pending.ts for the rules.
 *
 * A pending row is opened at conduct, in one transaction with the agenda item
 * stored as INTERIM and its AGENDA_OUTCOME_RECORDED event. It is decided once,
 * in one transaction: the row is locked and checked still PENDING, updated,
 * the agenda item set to CARRIED/RESOLVED or LOST/MOTION_LOST (only while it
 * is INTERIM or OPEN), and a PENDING_RESOLUTION_SETTLED event appended to the
 * original meeting. The first writer wins, and a repeat does nothing. A fact
 * an adviser records (the notice, a special general meeting notice) is
 * written the same way, with its own event. Meeting events are append-only.
 *
 * Nothing here is read for an NSW or Queensland building: their packs record
 * no pending resolutions, so no row is ever opened for them.
 */
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import { recordMeetingEvent } from "./events";
import { schemeTimeZones } from "@/lib/jurisdiction/scheme-time";
import { dayIn, todayIn } from "@/lib/jurisdiction/time-zone";
import { logError } from "@/lib/log";
import { addDays } from "@/lib/levies/notice-plan";
import {
  confirmationResult,
  dayProblem,
  formatDay,
  pendingDecision,
  petitionStops,
  type PendingDates,
  type PendingFacts,
  type PendingRowView,
  type PendingRuleSnapshot,
} from "./pending";
import type { PendingKind } from "./rules";

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
}

/**
 * Open a pending row at conduct, store the agenda item as INTERIM and write
 * its event, in one transaction. Refused when the item is already pending
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
      .update({ outcome: "INTERIM", status: "INTERIM" });
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
    return true;
  });
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

/**
 * Decide every pending row that is due, through pendingDecision: the daily
 * run (/api/cron/pending-resolutions, no filter) and the meeting page (one
 * meeting). Each row is judged on today in its building's time zone, and
 * decided in its own transaction; a failure is logged and counted, and never
 * stops the others.
 */
export async function settleDuePendingResolutions(filter: { meetingId?: string } = {}, now: Date = new Date()): Promise<SettleRunResult> {
  const rows = await db.orm.public.PendingResolution
    .where((p) => (filter.meetingId ? and(p.status.eq("PENDING"), p.meetingId.eq(filter.meetingId)) : p.status.eq("PENDING")))
    .limit(2000)
    .all();
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
      const decision = pendingDecision(pendingView(row), today, facts);
      if (decision.settle) {
        const done = await settlePendingResolution(row.id, { status: decision.status, endedBy: decision.endedBy, effectiveOn: decision.effectiveOn }, null, now);
        if (done) result.settled++;
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

/** A meeting's pending rows (every status), with the lots that signed a petition. */
export async function pendingResolutionsForMeeting(meetingId: string) {
  const rows = await db.orm.public.PendingResolution.where((p) => p.meetingId.eq(meetingId)).limit(500).all();
  if (rows.length === 0) return [];
  const lots = await db.orm.public.PendingResolutionLot.where((l) => l.pendingResolutionId.in(rows.map((r) => r.id))).all();
  return rows.map((r) => ({ row: r, lots: lots.filter((l) => l.pendingResolutionId === r.id) }));
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

/** D3: record the day the owners were given notice of it. A late notice is flagged, not moved. Then decide it if it is due. */
export async function recordPendingNotice(p: { scheme: PendingScheme; meetingId: string; pendingId: string; givenOn: string; actorId: string; now?: Date }): Promise<RepoResult> {
  const found = await rowOf(p.scheme.id, p.meetingId, p.pendingId);
  if ("error" in found) return { error: found.error };
  const view = pendingView(found.row);
  const today = todayIn(p.scheme.timeZone, p.now);
  const problem = dayProblem(p.givenOn, view.madeOn, null, today, "the notice was given");
  if (problem) return { error: problem };
  const late = !!view.noticeDueOn && p.givenOn > view.noticeDueOn;
  const saved = await recordFact(p.pendingId, (r) => r.noticeGivenOn == null, { noticeGivenOn: p.givenOn }, {
    actorId: p.actorId,
    eventType: "PENDING_NOTICE_RECORDED",
    payload: { givenOn: p.givenOn, ...(late ? { late: true, dueOn: view.noticeDueOn } : {}) },
  });
  if ("error" in saved) return saved;
  // Due already (its period ended while the notice was missing): decided now.
  await settleDuePendingResolutions({ meetingId: p.meetingId }, p.now);
  return late
    ? { ok: true, notice: `Recorded. The notice was given after ${formatDay(view.noticeDueOn!)}, the day it was due. This is flagged, and the dates of the resolution do not move.` }
    : { ok: true };
}

/** Victoria s 78: record notice of a special general meeting given within the period, with that meeting. */
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
 * (the ACT, leaving out lots barred for money owed, `barredLotIds`). A
 * petition that is not enough is refused and not stored. A valid one decides
 * the resolution as lost, with the lots, in one transaction.
 */
export async function recordPendingPetition(p: {
  scheme: PendingScheme;
  meetingId: string;
  pendingId: string;
  receivedOn: string;
  lotIds: readonly string[];
  /** The lots barred for money owed on `receivedOn`, worked out by the caller (the ACT only). */
  barredLotIds?: (receivedOn: string) => Promise<ReadonlySet<string>>;
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
  let outOf = lots.length;
  let counted = ids;
  if (petition.of === "ALL_LOTS") {
    if (p.scheme.totalLots == null || p.scheme.totalLots !== lots.length) {
      return { error: `The lots entered (${lots.length}) do not match the building's number of lots (${p.scheme.totalLots ?? "not recorded"}), so the petition cannot be counted. Check the lots first.` };
    }
  } else {
    const barred = p.barredLotIds ? await p.barredLotIds(p.receivedOn) : new Set<string>();
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
