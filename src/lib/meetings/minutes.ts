/**
 * Minutes assembly (pure).
 *
 * Builds the structured minutes from the meeting record and the agenda
 * outcomes. Attendance is a placeholder until Stage C (attendance and quorum)
 * is built. The retention and distribution-deadline helpers read the rule set.
 */
import { minutesDeadline, type MeetingRuleSet, type MeetingType } from "./rules";

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

const HEADINGS: Record<string, string> = {
  AGM: "MINUTES OF ANNUAL GENERAL MEETING",
  FIRST_AGM: "MINUTES OF FIRST ANNUAL GENERAL MEETING",
  EGM: "MINUTES OF GENERAL MEETING",
  SGM: "MINUTES OF GENERAL MEETING",
  COMMITTEE: "MINUTES OF STRATA COMMITTEE MEETING",
};

/** Assemble the structured minutes content from the meeting record. */
export function assembleMinutesContent(
  params: MinutesContentParams,
): MinutesContent {
  const heading = HEADINGS[params.meeting.meetingType] ?? "MINUTES OF MEETING";
  return {
    heading: `${heading} — THE OWNERS - STRATA PLAN ${params.scheme.planNumber}`,
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

/** The retention cut-off for the meeting record (meeting date + retention years). */
export function retentionUntil(ruleSet: MeetingRuleSet, from: Date): Date {
  const result = new Date(from);
  result.setUTCFullYear(result.getUTCFullYear() + ruleSet.retention.generalYears);
  return result;
}
