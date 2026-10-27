/**
 * Minutes assembly (pure).
 *
 * Builds the structured minutes from the meeting record and the agenda
 * outcomes. Attendance is a placeholder until Stage C (attendance and quorum)
 * is built. The retention and distribution-deadline helpers read the rule set.
 */
import { minutesDeadline, type MeetingRuleSet, type MeetingType } from "./rules";
import { bodyCorporateShortName } from "@/lib/jurisdiction/wording";
import type { MeetingHeadingTerms } from "./notice";

export interface MinutesAgendaItem {
  position: number;
  title: string;
  resolutionText: string | null;
  explanatoryNote: string | null;
  outcome: string | null;
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
