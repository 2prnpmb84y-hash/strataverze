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
 *
 * Every day is a calendar day (YYYY-MM-DD) in the building's time zone. The
 * row's own snapshot of the pack's rule is used, never the pack as it is now,
 * so a later pack change never moves its dates or tests.
 */
import { addDays } from "@/lib/levies/notice-plan";
import { isCalendarDay } from "@/lib/jurisdiction/time-zone";
import type { PendingKind, PendingResolutionRule, ResolutionRule } from "./rules";

/** The kinds this PR records (Western Australia's voting period is PR 8b-ii). */
export const PENDING_KINDS: readonly PendingKind[] = ["INTERIM_SPECIAL", "INTERIM_NO_QUORUM", "REDUCED_QUORUM"];

/** What a pending row stores of the rules at the meeting (`pending_resolutions.rule`). */
export interface PendingRuleSnapshot {
  pending: PendingResolutionRule;
  /** The rule of the item's category at the meeting. */
  resolution: ResolutionRule | null;
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
}

export type PendingDecision =
  | { settle: true; status: "CARRIED"; endedBy: "PERIOD_ENDED" | "MEETING_NOT_HELD"; effectiveOn: string }
  | { settle: false; waitUntil: string | null; blocker: string | null };

const wait = (until: string): PendingDecision => ({ settle: false, waitUntil: until, blocker: null });
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
 * confirmation are recorded by an adviser, not decided here.
 */
export function pendingDecision(row: PendingRowView, today: string, facts: PendingFacts = {}): PendingDecision {
  if (row.status !== "PENDING") return { settle: false, waitUntil: null, blocker: null };
  // Victoria s 78: once a special general meeting is called, it waits for that meeting.
  if (row.kind === "INTERIM_NO_QUORUM" && row.meetingNoticeGivenOn) {
    const heldBy = row.meetingHeldBy;
    if (!heldBy) return blocked("The day the special general meeting must be held by is not recorded.");
    if (today <= heldBy) return wait(addDays(heldBy, 1));
    if (!row.meetingNoticeMeetingId || facts.linkedMeeting === undefined) {
      return blocked("The special general meeting called for it is not linked, so StrataVerze cannot tell whether it was held.");
    }
    const opened = facts.linkedMeeting?.openedOn ?? null;
    // D7: held in time, but its decision is not recorded: never takes effect on its own.
    if (opened && opened <= heldBy) {
      return blocked("The special general meeting called for it was held. Record whether it confirmed the resolution.");
    }
    const notice = noticeBlocker(row);
    if (notice) return blocked(notice);
    return { settle: true, status: "CARRIED", endedBy: "MEETING_NOT_HELD", effectiveOn: effectiveFrom(row, addDays(heldBy, 1)) };
  }
  if (today <= row.windowClosesOn) return wait(addDays(row.windowClosesOn, 1));
  const notice = noticeBlocker(row);
  if (notice) return blocked(notice);
  return { settle: true, status: "CARRIED", endedBy: "PERIOD_ENDED", effectiveOn: effectiveFrom(row, addDays(row.windowClosesOn, 1)) };
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
  /** The confirming meeting's day, in the building's time zone. */
  meetingDay: string;
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

/** What a confirmation by a later meeting decides, or why it is refused. */
export function confirmationResult(row: PendingRowView, c: ConfirmationFacts): ConfirmationResult {
  if (row.status !== "PENDING") return { error: "This resolution is already decided." };
  if (c.meetingDay <= row.madeOn) return { error: `The confirming meeting must be held after ${formatDay(row.madeOn)}, the day the resolution was made.` };
  if (c.itemStatus !== "CARRIED" && c.itemStatus !== "LOST") {
    return { error: "Choose a motion recorded as carried or lost at that meeting." };
  }
  const notice = c.itemStatus === "CARRIED" ? noticeBlocker(row) : null;
  if (row.kind === "INTERIM_NO_QUORUM") {
    if (!row.meetingNoticeGivenOn || !row.meetingHeldBy) return { error: "Record the notice of the special general meeting first." };
    if (!c.isLinkedMeeting) return { error: "Choose the special general meeting the notice called." };
    if (c.meetingDay > row.meetingHeldBy) {
      return { error: `That meeting was not held by ${formatDay(row.meetingHeldBy)}, so it cannot confirm the resolution.` };
    }
    if (c.itemStatus === "LOST") return { status: "LOST", endedBy: "NOT_CONFIRMED", effectiveOn: null };
    if (notice) return { error: notice };
    return { status: "CARRIED", endedBy: "CONFIRMED", effectiveOn: effectiveFrom(row, c.meetingDay) };
  }
  if (row.kind === "REDUCED_QUORUM" && row.rule.confirmedSoonerBy === "STANDARD_QUORUM_MEETING") {
    if (c.meetingDay > row.windowClosesOn) {
      return { error: `A confirming meeting must be held by ${formatDay(row.windowClosesOn)}, the last day of its period.` };
    }
    if (c.standardQuorum !== true) return { error: "Choose a motion recorded with a standard quorum present." };
    if (c.itemStatus !== "CARRIED") return { error: "Only a motion recorded as carried can confirm it." };
    if (notice) return { error: notice };
    return { status: "CARRIED", endedBy: "CONFIRMED", effectiveOn: effectiveFrom(row, c.meetingDay) };
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
export function pendingRecordedNotice(rule: PendingResolutionRule, dates: PendingDates): string {
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

/** Why the chair cannot record as lost a count that makes the motion a resolution decided later. */
export function laterLostRefusal(rule: PendingResolutionRule, reason: string): string {
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
  },
): PendingPanelItem {
  const rule = row.rule;
  const status = (["CARRIED", "LOST"].includes(row.status) ? row.status : "PENDING") as PendingPanelItem["status"];
  const pending = status === "PENDING";
  const facts: string[] = [`Made on ${formatDay(row.madeOn)}.`, `Its period ends on ${formatDay(row.windowClosesOn)}.`];
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
    };
    const as = rule.takesEffectAs !== "SAME" ? ` as a ${rule.takesEffectAs.toLowerCase()} resolution` : "";
    standing = `Took effect${as} on ${row.effectiveOn ? formatDay(row.effectiveOn) : "a day not recorded"}, ${how[row.endedBy ?? ""] ?? "as recorded"}.`;
  } else if (status === "LOST") {
    standing =
      row.endedBy === "PETITION"
        ? "Stopped by a petition, so it is recorded as lost."
        : row.endedBy === "NOT_CONFIRMED"
          ? "Not confirmed at the special general meeting, so it is recorded as lost."
          : "Recorded as lost.";
  } else {
    const decision = pendingDecision(row, ctx.today, ctx.facts ?? {});
    if (!decision.settle && decision.blocker) {
      standing = "Waiting for something to be recorded before it can take effect.";
      blocker = decision.blocker;
    } else if (row.kind === "INTERIM_NO_QUORUM" && row.meetingHeldBy) {
      standing = `Waiting for the special general meeting, which must be held by ${formatDay(row.meetingHeldBy)}.`;
    } else {
      standing = `Pending. Unless it is stopped sooner, it takes effect on ${formatDay(addDays(row.windowClosesOn, 1))} at the earliest.`;
    }
  }

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
    canRecordNotice: pending && rule.noticeWithinDays != null && !row.noticeGivenOn,
    petitionWords: pending && rule.petition ? rule.petition.words : null,
    meetingNoticeWords: pending && row.kind === "INTERIM_NO_QUORUM" && rule.meetingNotice && !row.meetingNoticeGivenOn ? rule.meetingNotice.words : null,
    canConfirm:
      pending && ((row.kind === "INTERIM_NO_QUORUM" && !!row.meetingNoticeGivenOn) || (row.kind === "REDUCED_QUORUM" && rule.confirmedSoonerBy === "STANDARD_QUORUM_MEETING")),
    madeOn: row.madeOn,
    windowClosesOn: row.windowClosesOn,
    today: ctx.today,
  };
}
