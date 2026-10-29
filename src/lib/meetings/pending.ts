/**
 * Resolutions decided or taking effect after their meeting (pure; VIC, ACT
 * and WA stage 2, PR 8b-i, 29 Oct 2026).
 *
 * A count at conduct that gives a pending kind the building's pack records
 * (`MeetingRuleSet.pendingResolutions`: Victoria's interim special resolution
 * and interim resolution without a quorum, the ACT's reduced quorum decision)
 * is stored as pending, and decided here later. Matthew Wrigley's decisions
 * of 29 Oct 2026, each kept in the packs' FOR_REVIEW for legal confirmation:
 * - D1: a petition or notice can arrive up to and including `windowClosesOn`
 *   (made on + the pack's days), and it takes effect the next day;
 * - D2: it is made on the later of the meeting's day and the day it is
 *   recorded, in the building's time zone;
 * - D3: it does not take effect until its notice to the owners is recorded
 *   as given (a late notice is flagged, not moved, and a notice given after
 *   the window makes it take effect on that day, never before);
 * - D4, D5: a valid petition (more than the pack's share of all lots, or of
 *   the lots entitled to vote on its day) decides it as lost;
 * - D7: Victoria s 78: where the special general meeting was held within its
 *   days but its decision is not recorded, it never takes effect on its own.
 *   It is held when it was opened (its openedAt day) on or after the day its
 *   notice was given and by the day it must be held by, the same test for a
 *   confirmation;
 * - review M1: the daily run records it as having taken effect at the end of
 *   its period only after the rule's days of grace (settleAfterGraceDays, 7)
 *   after the window closes, or after the day the special general meeting
 *   must be held by. The day it takes effect does not move, and a petition or
 *   notice received within the window can still be recorded during the
 *   grace. A confirmation or a petition decides it at once.
 *
 * Western Australia's voting period (STA s 121; PR 8b-ii, 29 Oct 2026), with
 * Matthew Wrigley's decisions of the same day: D1 and D2 as above (a written
 * vote can arrive up to and including the day the 28 days end, and it is
 * decided the next day); D8: the late voters are the lots with nothing
 * entered at the item, FOR or AGAINST only, a debt (s 120(2)) judged on the
 * day the vote was received, and where such a lot exists the written notice
 * of the outcome (s 121(2)) must be recorded as given before the close is
 * decided; D9: decided only at the close, even if every lot has voted; the
 * same 7 days of grace before the daily run records it, the day it is
 * decided unchanged. At the close the votes at the meeting and the written
 * votes are counted with the category's test as it was at the meeting
 * (evaluateResolution with atClose): CARRIED or LOST, ended by
 * VOTES_AT_CLOSE. A count that cannot be made, or a missing outcome notice,
 * leaves it pending with what stops it.
 *
 * Every day is a calendar day (YYYY-MM-DD) in the building's time zone. The
 * row's own snapshot of the pack's rule is used, never the pack as it is now,
 * so a later pack change never moves its dates or tests.
 */
import { addDays } from "@/lib/levies/notice-plan";
import { isCalendarDay } from "@/lib/jurisdiction/time-zone";
import {
  evaluateResolution,
  type PendingKind,
  type PendingResolutionRule,
  type ResolutionCategory,
  type ResolutionOutcome,
  type ResolutionRule,
  type ResolutionTally,
} from "./rules";

/** The kinds recorded (Western Australia's voting period from PR 8b-ii). */
export const PENDING_KINDS: readonly PendingKind[] = ["INTERIM_SPECIAL", "INTERIM_NO_QUORUM", "REDUCED_QUORUM", "VOTING_PERIOD"];

/** What a pending row stores of the rules at the meeting (`pending_resolutions.rule`). */
export interface PendingRuleSnapshot {
  pending: PendingResolutionRule;
  /** The rule of the item's category at the meeting. */
  resolution: ResolutionRule | null;
  /**
   * Western Australia's voting period (PR 8b-ii review L2): the categories a
   * lot owing money may still vote on, as the pack held them at the meeting
   * (null where it recorded no such rule). Left out of rows kept before it,
   * and of the other kinds: the current pack is then read.
   */
  debtorsMayVoteOn?: readonly string[] | null;
}

/** The later of two days. */
const later = (a: string, b: string) => (a >= b ? a : b);

/** D2: the day a pending resolution is made: the later of the meeting's day and the day it is recorded. */
export function madeOnDay(meetingDay: string, recordingDay: string): string {
  return later(meetingDay, recordingDay);
}

export interface PendingDates {
  madeOn: string;
  /** D1: the last day a petition or notice can arrive. */
  windowClosesOn: string;
  /** The last day its notice to the owners may be given, or null where none is required. */
  noticeDueOn: string | null;
}

/** The dates of a pending resolution made on `madeOn`, under its rule. */
export function pendingDates(rule: Pick<PendingResolutionRule, "windowDays" | "noticeWithinDays">, madeOn: string): PendingDates {
  return {
    madeOn,
    windowClosesOn: addDays(madeOn, rule.windowDays),
    noticeDueOn: rule.noticeWithinDays == null ? null : addDays(madeOn, rule.noticeWithinDays),
  };
}

/** A pending row as the decision reads it (the dates as YYYY-MM-DD). */
export interface PendingRowView {
  kind: string;
  status: string;
  madeOn: string;
  windowClosesOn: string;
  noticeDueOn: string | null;
  noticeGivenOn: string | null;
  meetingNoticeGivenOn: string | null;
  meetingNoticeMeetingId: string | null;
  meetingHeldBy: string | null;
  rule: PendingResolutionRule;
}

/** What the decision needs beyond the row. */
export interface PendingFacts {
  /**
   * Victoria s 78: the special general meeting linked to the notice: the day
   * it was opened in the building's time zone, or null when it was not.
   * Undefined when not read, null when it is not found.
   */
  linkedMeeting?: { openedOn: string | null } | null;
  /**
   * Western Australia's voting period (PR 8b-ii): the votes to count at the
   * close. Undefined when not read, null when they cannot be read.
   */
  votingPeriod?: VotingPeriodFacts | null;
}

/** A written vote received after the meeting (Western Australia s 121(2), PR 8b-ii). */
export interface LateVote {
  lotId: string;
  vote: "FOR" | "AGAINST";
  receivedOn: string;
  /** The lot's entitlement by the schedule the count weighs votes by, where it weighs them; null where it cannot be read. */
  entitlement: number | null;
}

/** What the close of a voting period counts (Western Australia, PR 8b-ii). */
export interface VotingPeriodFacts {
  /** The item's category. */
  category: string;
  /** The category's rule at the meeting (the row's snapshot), or null where it was not kept. */
  resolution: ResolutionRule | null;
  /** The meeting's tally as stored with the row, or null where it cannot be read. */
  meetingTally: ResolutionTally | null;
  /** The lots with a vote or an abstention entered at the item at the meeting, counted or not counted for money owed. */
  enteredLotIds: readonly string[];
  /**
   * The building's lots at the meeting, those its count was made over (PR
   * 8b-ii review M), or null where they were not kept: only these may vote in
   * writing, and with null none may (it fails closed).
   */
  meetingLotIds: readonly string[] | null;
  /** The written votes received since, one per lot. */
  lateVotes: readonly LateVote[];
}

export type PendingDecision =
  | { settle: true; status: "CARRIED"; endedBy: "PERIOD_ENDED" | "MEETING_NOT_HELD"; effectiveOn: string }
  | {
      settle: true;
      status: "CARRIED" | "LOST";
      endedBy: "VOTES_AT_CLOSE";
      effectiveOn: string | null;
      /** The count at the close: the tally of the votes at the meeting and the written votes, and its evaluation. */
      tally: ResolutionTally;
      evaluation: ResolutionOutcome;
    }
  | { settle: false; waitUntil: string | null; blocker: string | null };

const wait = (until: string): PendingDecision => ({ settle: false, waitUntil: until, blocker: null });

/** Review M1: the rule's days of grace before the end of a period is recorded (none in a snapshot without it). */
export function settleGraceDays(rule: Pick<PendingResolutionRule, "settleAfterGraceDays">): number {
  const days = (rule as { settleAfterGraceDays?: unknown }).settleAfterGraceDays;
  return typeof days === "number" && Number.isInteger(days) && days > 0 ? days : 0;
}

/** Review M1: the last day of the grace after `lastDay` (the window's close, or the day a meeting must be held by). */
export function graceEndsOn(rule: Pick<PendingResolutionRule, "settleAfterGraceDays">, lastDay: string): string {
  return addDays(lastDay, settleGraceDays(rule));
}

/**
 * D7 and its confirmation (Victoria s 78): whether the special general meeting
 * called was held in time, by the day it was opened in the building's time
 * zone: on or after the day its notice was given, and by the day it must be
 * held by. One test for both.
 */
export function heldInTime(row: Pick<PendingRowView, "meetingNoticeGivenOn" | "meetingHeldBy">, openedOn: string | null): boolean {
  return !!openedOn && !!row.meetingNoticeGivenOn && !!row.meetingHeldBy && openedOn >= row.meetingNoticeGivenOn && openedOn <= row.meetingHeldBy;
}
const blocked = (blocker: string): PendingDecision => ({ settle: false, waitUntil: null, blocker });

/** D3: why it cannot take effect yet for want of its notice, or null. */
function noticeBlocker(row: PendingRowView): string | null {
  if (!row.rule.noticeRequiredBeforeEffect || row.noticeGivenOn) return null;
  return "Its notice to the owners is not recorded as given, so it cannot take effect. Record the day the notice was given.";
}

/** D3: the day it takes effect: `from`, or the day its notice was given where that is later. */
const effectiveFrom = (row: PendingRowView, from: string) => (row.noticeGivenOn ? later(from, row.noticeGivenOn) : from);

/**
 * What the daily run does with a pending row on `today`: decide it (CARRIED,
 * with the day it took effect), or leave it, with the day to look again or
 * what stops it. A petition, a special general meeting notice and a
 * confirmation are recorded by an adviser, not decided here. Review M1: the
 * end of a period is decided only after the rule's days of grace (`today`
 * later than the window's close, or the day the meeting must be held by, plus
 * the grace), while the day it takes effect stays the day after.
 */
export function pendingDecision(row: PendingRowView, today: string, facts: PendingFacts = {}): PendingDecision {
  if (row.status !== "PENDING") return { settle: false, waitUntil: null, blocker: null };
  // Western Australia's voting period (PR 8b-ii): decided only after it closes (D9), on the votes then, after the grace.
  if (row.kind === "VOTING_PERIOD") {
    const settleFrom = addDays(graceEndsOn(row.rule, row.windowClosesOn), 1);
    if (today <= row.windowClosesOn) return wait(settleFrom);
    const close = votingPeriodClose(row, facts.votingPeriod);
    if ("blocker" in close) return blocked(close.blocker);
    if (today < settleFrom) return wait(settleFrom);
    return { settle: true, ...close };
  }
  // Victoria s 78: once a special general meeting is called, it waits for that meeting.
  if (row.kind === "INTERIM_NO_QUORUM" && row.meetingNoticeGivenOn) {
    const heldBy = row.meetingHeldBy;
    if (!heldBy) return blocked("The day the special general meeting must be held by is not recorded.");
    const settleFrom = addDays(graceEndsOn(row.rule, heldBy), 1);
    if (today <= heldBy) return wait(settleFrom);
    if (!row.meetingNoticeMeetingId || facts.linkedMeeting === undefined) {
      return blocked("The special general meeting called for it is not linked, so StrataVerze cannot tell whether it was held.");
    }
    // D7: held in time, but its decision is not recorded: never takes effect on its own.
    if (heldInTime(row, facts.linkedMeeting?.openedOn ?? null)) {
      return blocked("The special general meeting called for it was held. Record whether it confirmed the resolution.");
    }
    const notice = noticeBlocker(row);
    if (notice) return blocked(notice);
    if (today < settleFrom) return wait(settleFrom);
    return { settle: true, status: "CARRIED", endedBy: "MEETING_NOT_HELD", effectiveOn: effectiveFrom(row, addDays(heldBy, 1)) };
  }
  const settleFrom = addDays(graceEndsOn(row.rule, row.windowClosesOn), 1);
  if (today <= row.windowClosesOn) return wait(settleFrom);
  const notice = noticeBlocker(row);
  if (notice) return blocked(notice);
  if (today < settleFrom) return wait(settleFrom);
  return { settle: true, status: "CARRIED", endedBy: "PERIOD_ENDED", effectiveOn: effectiveFrom(row, addDays(row.windowClosesOn, 1)) };
}

// ─── Western Australia's voting period (STA s 121; PR 8b-ii) ──────────────

/**
 * The lots with nothing entered at the item at the meeting (D8), by number:
 * the lots of the scheme at the meeting less those with a vote or an
 * abstention entered. Null where the number of lots was not kept.
 */
export function absentLotCount(facts: Pick<VotingPeriodFacts, "meetingTally" | "enteredLotIds">): number | null {
  const total = facts.meetingTally?.totalLots;
  if (total == null) return null;
  return Math.max(0, total - new Set(facts.enteredLotIds).size);
}

/**
 * The tally at the close: the meeting's tally with each written vote added,
 * weighed by its lot's entitlement where the meeting's votes were. A count
 * the written votes cannot be added to (a poll, the votes present, the lots
 * entitled to vote), or a written vote whose entitlement is missing where it
 * is needed, is refused: it fails closed.
 */
export function closeTally(
  meeting: ResolutionTally,
  late: readonly (Pick<LateVote, "vote" | "entitlement"> & { lotId?: string })[],
  /**
   * The lots of the meeting (PR 8b-ii review M): where given, every written
   * vote must be from one of `meetingLotIds` (null: none kept) with nothing
   * entered at the meeting, one per lot, and the lots voting can never be
   * more than the lots of the meeting. Otherwise it fails closed.
   */
  lots?: { meetingLotIds: readonly string[] | null; enteredLotIds: readonly string[] },
): { tally: ResolutionTally } | { error: string } {
  if (meeting.poll || meeting.votesPresentCount != null || meeting.votesPresentEntitlement != null || meeting.eligibleLots != null) {
    return { error: "The votes at the meeting were counted in a way the written votes cannot be added to, so it cannot be decided here." };
  }
  if (lots && late.length > 0) {
    const ids = late.map((v) => v.lotId ?? null);
    const entered = new Set(lots.enteredLotIds);
    const meetingLots = lots.meetingLotIds ? new Set(lots.meetingLotIds) : null;
    const outside =
      !meetingLots ||
      ids.some((id) => id == null || !meetingLots.has(id) || entered.has(id)) ||
      new Set(ids).size !== ids.length ||
      (meeting.totalLots != null && entered.size + ids.length > meeting.totalLots);
    if (outside) {
      return { error: "A written vote is recorded for a lot that was not one of the lots at the meeting with nothing entered, so the votes cannot be counted. Check the written votes." };
    }
  }
  const tally: ResolutionTally = { ...meeting };
  const weighs = meeting.forUE != null || meeting.againstUE != null;
  for (const v of late) {
    if (v.vote === "FOR") tally.forCount += 1;
    else tally.againstCount += 1;
    if (!weighs) continue;
    if (v.entitlement == null) {
      return { error: "The entitlement of a lot with a written vote is not recorded, so the votes cannot be counted. Record it in the building's lots." };
    }
    if (v.vote === "FOR") tally.forUE = (tally.forUE ?? 0) + v.entitlement;
    else tally.againstUE = (tally.againstUE ?? 0) + v.entitlement;
  }
  if (tally.lotsRecorded != null) tally.lotsRecorded += late.length;
  return { tally };
}

/** A voting period decided at its close: the decision without `settle`. */
type CloseResult = Omit<Extract<PendingDecision, { endedBy: "VOTES_AT_CLOSE" }>, "settle">;

/**
 * The count when a voting period has closed (D8, D9): the outcome notice
 * first, where the pack requires it and a lot had nothing entered at the
 * meeting (or that cannot be told), then the votes at the meeting and the
 * written votes, by the category's test as it was at the meeting. Carried
 * takes effect the day after the close; lost has no day. What stops it
 * otherwise is the blocker.
 */
export function votingPeriodClose(row: PendingRowView, facts: VotingPeriodFacts | null | undefined): CloseResult | { blocker: string } {
  if (!facts || !facts.meetingTally || !facts.resolution) {
    return { blocker: "The votes recorded at the meeting cannot be read, so it cannot be decided. Nothing is recorded until they are checked." };
  }
  const late = row.rule.lateVotes;
  if (late?.outcomeNoticeRequired && !row.noticeGivenOn) {
    const absent = absentLotCount(facts);
    if (absent == null || absent > 0) {
      return { blocker: `The ${late.noticeWords} is not recorded as given, so it cannot be decided. Record the day it was given.` };
    }
  }
  const counted = closeTally(facts.meetingTally, facts.lateVotes, { meetingLotIds: facts.meetingLotIds, enteredLotIds: facts.enteredLotIds });
  if ("error" in counted) return { blocker: counted.error };
  const category = facts.category as ResolutionCategory;
  const evaluation = evaluateResolution({ resolutionCategories: { [category]: facts.resolution } }, category, counted.tally, "unit entitlement", { atClose: true });
  if (evaluation.result) return { blocker: `The votes when its voting period closed cannot decide it. ${evaluation.reason}.` };
  return evaluation.passed
    ? { status: "CARRIED", endedBy: "VOTES_AT_CLOSE", effectiveOn: addDays(row.windowClosesOn, 1), tally: counted.tally, evaluation }
    : { status: "LOST", endedBy: "VOTES_AT_CLOSE", effectiveOn: null, tally: counted.tally, evaluation };
}

/**
 * Why a written vote received after the meeting cannot be recorded, or null
 * (D8): only under a rule that takes them, FOR or AGAINST, from one of the
 * building's lots at the meeting (review M: none where they were not kept)
 * with nothing entered at the item and no written vote yet, received
 * from the day it was made to the day the period closes, and never after
 * today. A debt is judged by the caller, on the day it was received.
 */
export function lateVoteProblem(
  row: PendingRowView,
  c: {
    lotId: string;
    /** The lot's number, or null where it is not a lot of the building (common property is not a lot). */
    lotNumber: string | null;
    vote: string;
    receivedOn: string;
    today: string;
    enteredLotIds: readonly string[];
    lateLotIds: readonly string[];
    /** The building's lots at the meeting, or null where they were not kept. */
    meetingLotIds: readonly string[] | null;
  },
): string | null {
  if (row.status !== "PENDING") return "This resolution is already decided. Nothing was saved.";
  if (!row.rule.lateVotes) return "Written votes after the meeting are not taken on this resolution. Nothing was saved.";
  if (c.vote !== "FOR" && c.vote !== "AGAINST") return "Choose For or Against. Nothing was saved.";
  if (c.lotNumber == null) return "Choose a lot of this building. Nothing was saved.";
  if (!c.meetingLotIds) return "The lots of the meeting were not kept with this resolution, so a written vote cannot be recorded. Nothing was saved.";
  if (!c.meetingLotIds.includes(c.lotId)) {
    return `Lot ${c.lotNumber} was not one of the building's lots at the meeting, so it cannot vote in writing on this resolution. Nothing was saved.`;
  }
  if (c.enteredLotIds.includes(c.lotId)) {
    return `Lot ${c.lotNumber} had a vote or an abstention entered at the meeting, so it cannot vote again in writing. Nothing was saved.`;
  }
  if (c.lateLotIds.includes(c.lotId)) return `A written vote for lot ${c.lotNumber} is already recorded. Each lot votes once. Nothing was saved.`;
  return dayProblem(c.receivedOn, row.madeOn, row.windowClosesOn, c.today, "the written vote was received");
}

/** Why a day an adviser records is refused, or null. `from` and `to` bound it (inclusive); it is never after today. */
export function dayProblem(day: string, from: string, to: string | null, today: string, what: string): string | null {
  if (!isCalendarDay(day)) return `Enter the day ${what} as a date.`;
  if (day > today) return `The day ${what} cannot be after today.`;
  if (day < from) return `The day ${what} cannot be before ${formatDay(from)}, the day the resolution was made.`;
  if (to && day > to) return `The day ${what} must be on or before ${formatDay(to)}, the last day of its period.`;
  return null;
}

/** D4, D5: whether a petition with `signatures` valid signatures stops it: strictly more than the pack's share of `outOf`. */
export function petitionStops(rule: PendingResolutionRule, signatures: number, outOf: number): boolean {
  const share = rule.petition?.moreThanFractionOf;
  if (share == null || outOf <= 0) return false;
  return signatures > share * outOf + 1e-9;
}

/** The facts of a confirmation an adviser records (Victoria s 78, the ACT s 3.11). */
export interface ConfirmationFacts {
  /** The confirming meeting's day (its start, or the day it was scheduled), in the building's time zone. */
  meetingDay: string;
  /**
   * The day the confirming meeting was opened, in the building's time zone,
   * or null when it was not (Victoria s 78 reads this, the test D7 uses).
   */
  openedOn: string | null;
  /** Whether it is the special general meeting linked to the notice (Victoria). */
  isLinkedMeeting: boolean;
  /** The confirming item's status: CARRIED or LOST. */
  itemStatus: string;
  /** Whether the chair answered that the confirming meeting had a standard quorum for the item (the ACT), or null when not recorded. */
  standardQuorum: boolean | null;
}

export type ConfirmationResult =
  | { status: "CARRIED"; endedBy: "CONFIRMED"; effectiveOn: string }
  | { status: "LOST"; endedBy: "NOT_CONFIRMED"; effectiveOn: null }
  | { error: string };

/**
 * What a confirmation by a later meeting decides, or why it is refused.
 * Victoria s 78: the special general meeting called is held on the day it
 * was opened, on or after the day its notice was given and by the day it must
 * be held by (heldInTime, the test D7 uses).
 */
export function confirmationResult(row: PendingRowView, c: ConfirmationFacts): ConfirmationResult {
  if (row.status !== "PENDING") return { error: "This resolution is already decided." };
  const heldOn = row.kind === "INTERIM_NO_QUORUM" ? c.openedOn : c.meetingDay;
  if (row.kind === "INTERIM_NO_QUORUM" && !heldOn) {
    return { error: "That meeting is not recorded as opened, so it is not recorded as held and cannot confirm the resolution." };
  }
  if (!heldOn || heldOn <= row.madeOn) return { error: `The confirming meeting must be held after ${formatDay(row.madeOn)}, the day the resolution was made.` };
  if (c.itemStatus !== "CARRIED" && c.itemStatus !== "LOST") {
    return { error: "Choose a motion recorded as carried or lost at that meeting." };
  }
  const notice = c.itemStatus === "CARRIED" ? noticeBlocker(row) : null;
  if (row.kind === "INTERIM_NO_QUORUM") {
    if (!row.meetingNoticeGivenOn || !row.meetingHeldBy) return { error: "Record the notice of the special general meeting first." };
    if (!c.isLinkedMeeting) return { error: "Choose the special general meeting the notice called." };
    if (heldOn < row.meetingNoticeGivenOn) {
      return { error: `That meeting was held before ${formatDay(row.meetingNoticeGivenOn)}, the day its notice was given, so it cannot confirm the resolution.` };
    }
    if (!heldInTime(row, heldOn)) {
      return { error: `That meeting was not held by ${formatDay(row.meetingHeldBy)}, so it cannot confirm the resolution.` };
    }
    if (c.itemStatus === "LOST") return { status: "LOST", endedBy: "NOT_CONFIRMED", effectiveOn: null };
    if (notice) return { error: notice };
    return { status: "CARRIED", endedBy: "CONFIRMED", effectiveOn: effectiveFrom(row, heldOn) };
  }
  if (row.kind === "REDUCED_QUORUM" && row.rule.confirmedSoonerBy === "STANDARD_QUORUM_MEETING") {
    if (heldOn > row.windowClosesOn) {
      return { error: `A confirming meeting must be held by ${formatDay(row.windowClosesOn)}, the last day of its period.` };
    }
    if (c.standardQuorum !== true) return { error: "Choose a motion recorded with a standard quorum present." };
    if (c.itemStatus !== "CARRIED") return { error: "Only a motion recorded as carried can confirm it." };
    if (notice) return { error: notice };
    return { status: "CARRIED", endedBy: "CONFIRMED", effectiveOn: effectiveFrom(row, heldOn) };
  }
  return { error: "This resolution is not confirmed by a later meeting." };
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** A day (YYYY-MM-DD) as people read it: "2 November 2026". */
export function formatDay(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** "a" or "an" before a name, by its first sound. */
const article = (text: string) => (/^[aeiou]/i.test(text) && !/^(?:unan|uni|use|usu)/i.test(text) ? `an ${text}` : `a ${text}`);

/**
 * What the chair is told when a count is recorded as pending, with its dates.
 * Plain words with no dashes or semicolons.
 */
export function pendingRecordedNotice(
  rule: PendingResolutionRule,
  dates: PendingDates,
  /** Western Australia (PR 8b-ii review L4): whether a lot had nothing entered at the item, so the outcome notice is needed. Taken as yes where not given. */
  opts: { someLotAbsent?: boolean } = {},
): string {
  // Western Australia's voting period (PR 8b-ii): open until it closes, then decided on the votes then.
  if (rule.lateVotes) {
    const needed = rule.lateVotes.outcomeNoticeRequired && opts.someLotAbsent !== false;
    const notice = needed ? ` Give the ${rule.lateVotes.noticeWords} and record the day it was given.` : "";
    const written = opts.someLotAbsent === false ? "" : " Record each written vote under Decided later on this page.";
    return `Recorded. Its voting period is open until ${formatDay(dates.windowClosesOn)}. It is decided as at ${formatDay(addDays(dates.windowClosesOn, 1))} on the votes at the meeting and the written votes received by then.${notice}${written}`;
  }
  const name = rule.label.toLowerCase();
  const notice = dates.noticeDueOn ? ` Give the owners notice of it by ${formatDay(dates.noticeDueOn)} and record the day it was given.` : "";
  return `Recorded as ${article(name)}, decided later. It was made on ${formatDay(dates.madeOn)}.${notice} Unless it is stopped sooner, it takes effect on ${formatDay(addDays(dates.windowClosesOn, 1))} at the earliest. See Decided later on this page.`;
}

/** Agenda item statuses of an item decided later (INTERIM; OPEN from PR 8b-ii, Western Australia). */
export const PENDING_ITEM_STATUSES: readonly string[] = ["INTERIM", "OPEN"];

/** Whether an agenda item is decided later, by its stored status. */
export function isPendingItem(item: { status?: string | null }): boolean {
  return PENDING_ITEM_STATUSES.includes(String(item.status ?? ""));
}

/** D10: why a pending item cannot be recorded again, deferred or deleted. */
export const PENDING_ITEM_REFUSAL =
  "This item is decided later, so it cannot be recorded again, deferred or removed. Nothing was saved. See Decided later on this page.";

/**
 * D10 (review M2): why an item whose resolution was decided later, and is now
 * recorded as carried or lost, cannot be recorded again, deferred or deleted.
 */
export const DECIDED_LATER_ITEM_REFUSAL =
  "This item's resolution was decided after the meeting, so it cannot be recorded again, deferred or removed. Nothing was saved. See Decided later on this page.";

/** Why the chair cannot record as lost a count that makes the motion a resolution decided later. */
export function laterLostRefusal(rule: PendingResolutionRule, reason: string): string {
  // Western Australia's voting period (PR 8b-ii): neither carried nor lost at the meeting.
  if (rule.lateVotes) {
    return `The votes at the meeting cannot decide this motion. ${reason}. Nothing was saved. Record the votes to start its voting period, or check the votes entered.`;
  }
  return `The votes recorded make this motion ${article(rule.label.toLowerCase())}, decided later, not lost. ${reason}. Nothing was saved. Record it as resolved to start its period, or check the votes entered.`;
}

/** A pending row with what the meeting page shows of it beyond the decision's view. */
export interface PendingPanelRow extends PendingRowView {
  id: string;
  agendaItemId: string;
  petitionReceivedOn: string | null;
  effectiveOn: string | null;
  endedBy: string | null;
}

/**
 * One resolution decided later as the meeting page shows it (VIC, ACT and WA
 * stage 2, PR 8b-i): plain words and days only, worked out on the server, so
 * the browser takes no pack value. What can be recorded is offered only
 * while it is pending.
 */
export interface PendingPanelItem {
  id: string;
  itemId: string;
  itemLabel: string;
  kindLabel: string;
  help: string;
  status: "PENDING" | "CARRIED" | "LOST";
  /** Where it stands, in one or two sentences. */
  standing: string;
  /** What is recorded, one sentence each. */
  facts: string[];
  /** What stops it taking effect, where something does. */
  blocker: string | null;
  canRecordNotice: boolean;
  /** The petition's words, where one can be recorded. */
  petitionWords: string | null;
  /** The special general meeting notice's words, where one can be recorded (Victoria s 78). */
  meetingNoticeWords: string | null;
  canConfirm: boolean;
  /** Bounds for the date fields (YYYY-MM-DD). */
  madeOn: string;
  windowClosesOn: string;
  today: string;
  /** Where the notice recorded is not the usual one (Western Australia's outcome notice, PR 8b-ii): the question for its day. */
  noticeLabel?: string;
  /**
   * Western Australia's written votes after the meeting (PR 8b-ii), while
   * one can be recorded: who may vote and until when, and the lots that may.
   * Left out otherwise.
   */
  lateVote?: { words: string; lots: { id: string; lotNumber: string }[] };
}

/**
 * Where a pending row stands before its period's end is recorded (review M1):
 * the day it takes effect, unless what stops it, received within the window,
 * is recorded by the last day of the grace. Plain words with no dashes or
 * semicolons.
 */
function pendingStanding(row: PendingRowView): string {
  const rule = row.rule;
  const awaitsNotice = rule.noticeRequiredBeforeEffect && !row.noticeGivenOn;
  const takesEffect = `It takes effect on ${formatDay(effectiveFrom(row, addDays(row.windowClosesOn, 1)))}${awaitsNotice ? " at the earliest" : ""}`;
  const stoppers = [rule.petition ? "a petition received" : null, rule.meetingNotice ? "notice of a special general meeting given" : null].filter((x): x is string => !!x);
  if (stoppers.length === 0) return `Pending. ${takesEffect}.`;
  const by = `${stoppers.join(" or ")} by ${formatDay(row.windowClosesOn)}`;
  const graceEnd = graceEndsOn(rule, row.windowClosesOn);
  return graceEnd > row.windowClosesOn
    ? `Pending. ${takesEffect} unless ${by} is recorded by ${formatDay(graceEnd)}.`
    : `Pending. ${takesEffect} unless ${by} is recorded.`;
}

/**
 * Where a voting period stands while it is open or in its grace (Western
 * Australia, PR 8b-ii). Plain words with no dashes or semicolons.
 */
function votingStanding(row: PendingRowView): string {
  const decidedOn = formatDay(addDays(row.windowClosesOn, 1));
  const recordedOn = addDays(graceEndsOn(row.rule, row.windowClosesOn), 1);
  const grace = recordedOn > addDays(row.windowClosesOn, 1) ? ` StrataVerze records the decision on ${formatDay(recordedOn)}, so a written vote received in time can still be recorded.` : "";
  return `Voting is open until ${formatDay(row.windowClosesOn)}. It is decided as at ${decidedOn} on the votes at the meeting and the written votes received by then.${grace}`;
}

const lotWords = (numbers: readonly string[]) =>
  numbers.length > 1 ? `lots ${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]}` : `lot ${numbers[0] ?? ""}`;

/** The panel's view of one pending row, on `today` in the building's time zone. */
export function pendingPanelItem(
  row: PendingPanelRow,
  ctx: {
    itemLabel: string;
    today: string;
    facts?: PendingFacts;
    /** The lot numbers that signed a petition. */
    petitionLots?: readonly string[];
    /** The special general meeting called (Victoria s 78), as named on the page. */
    calledMeeting?: string | null;
    /** The meeting and motion that confirmed it or not, as named on the page. */
    confirmedBy?: string | null;
    /** The building's lots (common property left out), for the written votes after the meeting (Western Australia, PR 8b-ii). */
    lots?: readonly { id: string; lotNumber: string }[];
  },
): PendingPanelItem {
  const rule = row.rule;
  const status = (["CARRIED", "LOST"].includes(row.status) ? row.status : "PENDING") as PendingPanelItem["status"];
  const pending = status === "PENDING";
  const facts: string[] = [`Made on ${formatDay(row.madeOn)}.`, `Its period ends on ${formatDay(row.windowClosesOn)}.`];
  // Western Australia's voting period (PR 8b-ii): the votes at the meeting, the outcome notice and the written votes since.
  const voting = row.kind === "VOTING_PERIOD" ? ctx.facts?.votingPeriod : undefined;
  const lateRule = row.kind === "VOTING_PERIOD" ? rule.lateVotes : undefined;
  const absent = voting ? absentLotCount(voting) : null;
  const noticeWanted = !!lateRule?.outcomeNoticeRequired && (absent == null || absent > 0);
  if (row.kind === "VOTING_PERIOD") {
    const t = voting?.meetingTally;
    if (t) facts.push(`Votes at the meeting: ${t.forCount} for, ${t.againstCount} against${t.abstainCount ? `, ${t.abstainCount} abstaining` : ""}.`);
    if (lateRule && row.noticeGivenOn) {
      const after = row.noticeGivenOn > row.windowClosesOn ? ", after its voting period closed" : "";
      facts.push(`The ${lateRule.noticeWords} was given on ${formatDay(row.noticeGivenOn)}${after}.`);
    } else if (lateRule && noticeWanted) {
      facts.push(`The ${lateRule.noticeWords} is not recorded yet.`);
    }
    const number = new Map((ctx.lots ?? []).map((l) => [l.id, l.lotNumber]));
    for (const v of voting?.lateVotes ?? []) {
      facts.push(`Lot ${number.get(v.lotId) ?? "?"} voted ${v.vote === "FOR" ? "for" : "against"} in writing, received on ${formatDay(v.receivedOn)}.`);
    }
  }
  if (row.noticeDueOn) {
    if (row.noticeGivenOn) {
      const late = row.noticeGivenOn > row.noticeDueOn;
      facts.push(`Notice to the owners given on ${formatDay(row.noticeGivenOn)}${late ? `, after it was due on ${formatDay(row.noticeDueOn)}` : ""}.`);
    } else {
      facts.push(`Notice to the owners due by ${formatDay(row.noticeDueOn)}, not recorded yet.`);
    }
  }
  if (row.meetingNoticeGivenOn && row.meetingHeldBy) {
    facts.push(`Special general meeting called on ${formatDay(row.meetingNoticeGivenOn)}${ctx.calledMeeting ? ` (${ctx.calledMeeting})` : ""}, to be held by ${formatDay(row.meetingHeldBy)}.`);
  }
  if (row.petitionReceivedOn) {
    const lots = ctx.petitionLots ?? [];
    facts.push(`Petition received on ${formatDay(row.petitionReceivedOn)}${lots.length ? `, signed for ${lotWords(lots)}` : ""}.`);
  }
  if (ctx.confirmedBy && (row.endedBy === "CONFIRMED" || row.endedBy === "NOT_CONFIRMED")) {
    facts.push(`${row.endedBy === "CONFIRMED" ? "Confirmed" : "Not confirmed"} at ${ctx.confirmedBy}.`);
  }

  let standing: string;
  let blocker: string | null = null;
  if (status === "CARRIED") {
    const how: Record<string, string> = {
      PERIOD_ENDED: "after its period ended",
      CONFIRMED: "when a later meeting confirmed it",
      MEETING_NOT_HELD: "because the special general meeting was not held in time",
      VOTES_AT_CLOSE: "on the votes when its voting period closed",
    };
    const as = rule.takesEffectAs !== "SAME" ? ` as a ${rule.takesEffectAs.toLowerCase()} resolution` : "";
    standing = `Took effect${as} on ${row.effectiveOn ? formatDay(row.effectiveOn) : "a day not recorded"}, ${how[row.endedBy ?? ""] ?? "as recorded"}.`;
  } else if (status === "LOST") {
    standing =
      row.endedBy === "PETITION"
        ? "Stopped by a petition, so it is recorded as lost."
        : row.endedBy === "NOT_CONFIRMED"
          ? "Not confirmed at the special general meeting, so it is recorded as lost."
          : row.endedBy === "VOTES_AT_CLOSE"
            ? "Lost on the votes when its voting period closed."
            : "Recorded as lost.";
  } else {
    const decision = pendingDecision(row, ctx.today, ctx.facts ?? {});
    if (!decision.settle && decision.blocker) {
      standing = `Waiting for something to be recorded before it can ${row.kind === "VOTING_PERIOD" ? "be decided" : "take effect"}.`;
      blocker = decision.blocker;
    } else if (row.kind === "VOTING_PERIOD") {
      standing = votingStanding(row);
    } else if (row.kind === "INTERIM_NO_QUORUM" && row.meetingHeldBy) {
      standing =
        ctx.today <= row.meetingHeldBy
          ? `Waiting for the special general meeting, which must be held by ${formatDay(row.meetingHeldBy)}.`
          : `It takes effect on ${formatDay(effectiveFrom(row, addDays(row.meetingHeldBy, 1)))}, as the special general meeting called for it is not recorded as held by ${formatDay(row.meetingHeldBy)}. StrataVerze records this on ${formatDay(addDays(graceEndsOn(rule, row.meetingHeldBy), 1))}.`;
    } else {
      standing = pendingStanding(row);
    }
  }

  // The lots that may still vote in writing (D8): nothing entered at the meeting and no written vote yet.
  // Review M: only the building's lots at the meeting, none where they were not kept.
  const taken = new Set([...(voting?.enteredLotIds ?? []), ...(voting?.lateVotes ?? []).map((v) => v.lotId)]);
  const meetingLots = new Set(voting?.meetingLotIds ?? []);
  const lateLots = lateRule && voting && pending ? (ctx.lots ?? []).filter((l) => meetingLots.has(l.id) && !taken.has(l.id)) : [];
  return {
    id: row.id,
    itemId: row.agendaItemId,
    itemLabel: ctx.itemLabel,
    kindLabel: rule.label,
    help: rule.help,
    status,
    standing,
    facts,
    blocker,
    canRecordNotice: pending && !row.noticeGivenOn && (rule.noticeWithinDays != null || noticeWanted),
    petitionWords: pending && rule.petition ? rule.petition.words : null,
    meetingNoticeWords: pending && row.kind === "INTERIM_NO_QUORUM" && rule.meetingNotice && !row.meetingNoticeGivenOn ? rule.meetingNotice.words : null,
    canConfirm:
      pending && ((row.kind === "INTERIM_NO_QUORUM" && !!row.meetingNoticeGivenOn) || (row.kind === "REDUCED_QUORUM" && rule.confirmedSoonerBy === "STANDARD_QUORUM_MEETING")),
    madeOn: row.madeOn,
    windowClosesOn: row.windowClosesOn,
    today: ctx.today,
    ...(lateRule ? { noticeLabel: lateRule.noticeLabel } : {}),
    ...(lateRule && lateLots.length > 0 ? { lateVote: { words: lateRule.words, lots: lateLots.map((l) => ({ id: l.id, lotNumber: l.lotNumber })) } } : {}),
  };
}

/**
 * What the minutes say of an item decided later (VIC, ACT and WA stage 2,
 * PR 8b-iv, 29 Oct 2026): its kind, the day its period ends, the day it took
 * or may take effect, where it stands and one or two plain sentences, as at
 * the day the minutes are assembled. No dashes or semicolons.
 */
export interface MinutesLaterEffect {
  kind: string;
  label: string;
  status: "PENDING" | "CARRIED" | "LOST";
  windowClosesOn: string;
  /**
   * The day it took effect (CARRIED); while pending, the day it takes effect
   * if nothing recorded stops or decides it sooner (for a voting period, the
   * day it is decided as at), or null where that depends on a special general
   * meeting called for it; null once lost.
   */
  effectiveOn: string | null;
  words: string;
}

/**
 * The later effect of one pending row, for the minutes, as at `today` (the
 * day they are assembled, in the building's time zone): a period that has
 * ended is told in the past tense (review L4).
 */
export function minutesLaterEffect(row: PendingPanelRow, today: string): MinutesLaterEffect {
  const rule = row.rule;
  const status = (["CARRIED", "LOST"].includes(row.status) ? row.status : "PENDING") as MinutesLaterEffect["status"];
  const ended = today > row.windowClosesOn;
  const closes = formatDay(row.windowClosesOn);
  const next = addDays(row.windowClosesOn, 1);
  const base = { kind: row.kind, label: rule.label, status, windowClosesOn: row.windowClosesOn };
  if (row.kind === "VOTING_PERIOD") {
    if (status === "CARRIED") {
      return { ...base, effectiveOn: row.effectiveOn, words: `${rule.label}. Voting closed on ${closes}. Carried on the votes at the close, as at ${row.effectiveOn ? formatDay(row.effectiveOn) : "a day not recorded"}.` };
    }
    if (status === "LOST") return { ...base, effectiveOn: null, words: `${rule.label}. Voting closed on ${closes}. Lost on the votes at the close.` };
    // Review L4: during the days of grace the period has closed, and the result is recorded by the day after the grace.
    const recordedBy = addDays(graceEndsOn(rule, row.windowClosesOn), 1);
    return {
      ...base,
      effectiveOn: next,
      words: ended
        ? `${rule.label}. Voting closed on ${closes}. It is decided as at ${formatDay(next)} on the votes at the meeting and the written votes received by then. The result is recorded by ${formatDay(recordedBy)}.`
        : `${rule.label}. Voting is open until ${closes}. It is decided as at ${formatDay(next)} on the votes at the meeting and the written votes received by then.`,
    };
  }
  const head = `${rule.label}, decided later. Its period ${ended || status !== "PENDING" ? "ended" : "ends"} on ${closes}.`;
  if (status === "CARRIED") {
    const as = rule.takesEffectAs !== "SAME" ? ` as a ${rule.takesEffectAs.toLowerCase()} resolution` : "";
    return { ...base, effectiveOn: row.effectiveOn, words: `${head} Took effect${as} on ${row.effectiveOn ? formatDay(row.effectiveOn) : "a day not recorded"}.` };
  }
  if (status === "LOST") {
    const why =
      row.endedBy === "PETITION"
        ? "Stopped by a petition, so it is recorded as lost."
        : row.endedBy === "NOT_CONFIRMED"
          ? "Not confirmed at the special general meeting, so it is recorded as lost."
          : "Recorded as lost.";
    return { ...base, effectiveOn: null, words: `${head} ${why}` };
  }
  if (row.meetingNoticeGivenOn && row.meetingHeldBy) {
    return {
      ...base,
      effectiveOn: null,
      words: `${head} Pending. A special general meeting was called for it on ${formatDay(row.meetingNoticeGivenOn)}, to be held by ${formatDay(row.meetingHeldBy)}.`,
    };
  }
  const effectiveOn = effectiveFrom(row, next);
  const awaitsNotice = rule.noticeRequiredBeforeEffect && !row.noticeGivenOn;
  const as = rule.takesEffectAs !== "SAME" ? ` as a ${rule.takesEffectAs.toLowerCase()} resolution` : "";
  // Review L4: a petition stops it, notice of a special general meeting (Victoria s 78(4)) makes it depend on that
  // meeting, and a later meeting that confirms it (the ACT) brings it forward. Separate sentences, no semicolons.
  const notice = awaitsNotice ? " at the earliest, once its notice to the owners is recorded as given" : "";
  const petition = rule.petition ? ", unless a petition stops it first" : "";
  const meeting = rule.meetingNotice ? ` If notice of a special general meeting is given by ${closes}, it depends on that meeting instead.` : "";
  const confirmed = rule.confirmedSoonerBy ? " A later meeting that confirms it brings it forward to that meeting's day." : "";
  return {
    ...base,
    effectiveOn,
    words: `${head} Pending. It takes effect${as} on ${formatDay(effectiveOn)}${notice}${petition}.${meeting}${confirmed}`,
  };
}
