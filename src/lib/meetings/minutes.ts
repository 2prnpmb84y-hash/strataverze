/**
 * Minutes assembly (pure).
 *
 * Builds the structured minutes from the meeting record and the agenda
 * outcomes. Attendance is a placeholder until Stage C (attendance and quorum)
 * is built. The retention and distribution-deadline helpers read the rule set.
 *
 * Where the building's pack asks for more (`MeetingRuleSet.minutesContents`,
 * the draft packs only, VIC, ACT and WA stage 2, PR 8b-iv, 29 Oct 2026), each
 * item also gives the kind of resolution (the ACT), the votes counted at the
 * meeting (Victoria, decision D18) and, for an item decided later, its later
 * effect. NSW and Queensland have none of it, so their items are as before.
 */
import { minutesDeadline, type MeetingRuleSet, type MeetingType, type MinutesContentsRule, type ResolutionCategory } from "./rules";
import { bodyCorporateShortName } from "@/lib/jurisdiction/wording";
import type { MeetingHeadingTerms } from "./notice";
import { minutesLaterEffect, type MinutesLaterEffect, type PendingPanelRow } from "./pending";

/** The votes counted at an item at the meeting, from the count recorded (Victoria s 81). */
export interface MinutesVoting {
  for: number;
  against: number;
  abstain: number;
  /** Whether a poll was taken (counted by lot entitlement). */
  poll: boolean;
  /** On a poll: the lot entitlement for and against. */
  forEntitlement?: number;
  againstEntitlement?: number;
  /** The votes entered but not counted (a lot owing money). */
  notCounted: number;
}

export interface MinutesAgendaItem {
  position: number;
  title: string;
  resolutionText: string | null;
  explanatoryNote: string | null;
  outcome: string | null;
  /*
   * The draft packs only (PR 8b-iv), each where the pack asks for it and the
   * item has it. Left out otherwise.
   */
  /** The kind of resolution, as the pack names it ("Special Resolution"). */
  kind?: string;
  voting?: MinutesVoting;
  laterEffect?: MinutesLaterEffect;
}

/** An agenda item as the extras read it. */
export interface MinutesItemSource {
  id: string;
  resolutionCategory: string | null;
}

/** A meeting event as the extras read it (oldest first). */
export interface MinutesEventSource {
  eventType: string;
  payload: unknown;
}

const count = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** The votes of a recorded count, or null where the event holds no count. */
export function minutesVoting(payload: unknown): MinutesVoting | null {
  const p = (payload ?? {}) as { tally?: unknown; notCounted?: unknown };
  const tally = p.tally as Record<string, unknown> | null | undefined;
  if (!tally || typeof tally !== "object" || typeof tally.forCount !== "number" || typeof tally.againstCount !== "number") return null;
  const poll = tally.poll === true;
  return {
    for: count(tally.forCount),
    against: count(tally.againstCount),
    abstain: count(tally.abstainCount),
    poll,
    ...(poll && typeof tally.forUE === "number" ? { forEntitlement: tally.forUE } : {}),
    ...(poll && typeof tally.againstUE === "number" ? { againstEntitlement: tally.againstUE } : {}),
    notCounted: Array.isArray(p.notCounted) ? p.notCounted.length : 0,
  };
}

/**
 * What the pack asks the minutes to give for each item beyond its title, text
 * and outcome, by item id: the kind of resolution for the categories listed,
 * the votes of the latest count recorded for the item, and the later effect
 * of its pending row. Only the parts the pack asks for are given.
 */
export function minutesItemExtras(
  contents: MinutesContentsRule,
  labels: MeetingRuleSet["resolutionLabels"],
  items: readonly MinutesItemSource[],
  events: readonly MinutesEventSource[],
  pending: readonly PendingPanelRow[],
): Map<string, Pick<MinutesAgendaItem, "kind" | "voting" | "laterEffect">> {
  const latestCount = new Map<string, MinutesVoting | null>();
  if (contents.voting) {
    for (const e of events) {
      if (e.eventType !== "AGENDA_OUTCOME_RECORDED") continue;
      const itemId = (e.payload as { itemId?: unknown } | null)?.itemId;
      if (typeof itemId === "string") latestCount.set(itemId, minutesVoting(e.payload));
    }
  }
  const rows = new Map(contents.laterEffect ? pending.map((r) => [r.agendaItemId, r]) : []);
  const out = new Map<string, Pick<MinutesAgendaItem, "kind" | "voting" | "laterEffect">>();
  for (const item of items) {
    const category = item.resolutionCategory as ResolutionCategory | null;
    const kind = category && contents.kindFor?.includes(category) ? labels[category]?.full ?? null : null;
    const voting = latestCount.get(item.id) ?? null;
    const row = rows.get(item.id);
    out.set(item.id, {
      ...(kind ? { kind } : {}),
      ...(voting ? { voting } : {}),
      ...(row ? { laterEffect: minutesLaterEffect(row) } : {}),
    });
  }
  return out;
}

export interface MinutesContentParams {
  scheme: { name: string; planNumber: string };
  meeting: {
    title: string;
    meetingType: string;
    startTime: string;
    openedAt: string | null;
    closedAt: string | null;
  };
  items: MinutesAgendaItem[];
}

export interface MinutesContent {
  heading: string;
  scheme: MinutesContentParams["scheme"];
  meeting: MinutesContentParams["meeting"];
  items: MinutesAgendaItem[];
  generatedAt: string;
}

const headings = (terms: MeetingHeadingTerms): Record<string, string> => ({
  AGM: "MINUTES OF ANNUAL GENERAL MEETING",
  FIRST_AGM: "MINUTES OF FIRST ANNUAL GENERAL MEETING",
  EGM: "MINUTES OF GENERAL MEETING",
  SGM: "MINUTES OF GENERAL MEETING",
  COMMITTEE: `MINUTES OF ${terms.committee.toUpperCase()} MEETING`,
});

/** Assemble the structured minutes content from the meeting record. The committee and owners corporation are named from `terms` (`rules.TERMINOLOGY`). */
export function assembleMinutesContent(
  params: MinutesContentParams,
  terms: MeetingHeadingTerms,
): MinutesContent {
  const heading = headings(terms)[params.meeting.meetingType] ?? "MINUTES OF MEETING";
  const entity = bodyCorporateShortName(terms, params.scheme, { upperCase: true });
  return {
    heading: `${heading} — ${entity}`,
    scheme: params.scheme,
    meeting: params.meeting,
    items: params.items,
    generatedAt: new Date().toISOString(),
  };
}

/** The date by which minutes must be distributed after the meeting. */
export function minutesDistributionDeadline(
  ruleSet: MeetingRuleSet,
  meetingType: MeetingType,
  meetingDate: Date,
): Date | null {
  return minutesDeadline(ruleSet, meetingType, meetingDate);
}

/**
 * The retention cut-off for the meeting record (meeting date + retention
 * years), or null where the rule set keeps it without a limit (Queensland).
 */
export function retentionUntil(ruleSet: MeetingRuleSet, from: Date): Date | null {
  const years = ruleSet.retention.generalYears;
  if (years == null) return null;
  const result = new Date(from);
  result.setUTCFullYear(result.getUTCFullYear() + years);
  return result;
}
