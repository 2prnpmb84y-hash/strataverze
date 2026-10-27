/**
 * Notice assembly (pure).
 *
 * Builds the structured content of a meeting notice from the meeting, its
 * agenda and the scheme. Notice-period compliance is computed separately with
 * `validateNoticePeriod` from the rules layer at issue time. The committee and
 * the owners corporation are named from the building's TERMINOLOGY.
 */
import { bodyCorporateShortName, type Terms } from "@/lib/jurisdiction/wording";

export interface NoticeAgendaItem {
  position: number;
  title: string;
  resolutionText: string | null;
  explanatoryNote: string | null;
  resolutionCategory: string | null;
}

export interface NoticeContentParams {
  scheme: {
    name: string;
    planNumber: string;
    address: string;
    suburb: string;
    state: string;
    postcode: string;
  };
  meeting: {
    title: string;
    meetingType: string;
    startTime: string; // ISO
    format: string | null;
    location: string | null;
    joinUrl: string | null;
    joinDetails: string | null;
    timezone: string | null;
  };
  items: NoticeAgendaItem[];
}

export interface NoticeContent {
  heading: string;
  scheme: NoticeContentParams["scheme"];
  meeting: {
    title: string;
    meetingType: string;
    startTime: string;
    format: string | null;
    location: string | null;
    joinUrl: string | null;
    joinDetails: string | null;
    timezone: string | null;
  };
  items: NoticeAgendaItem[];
  generatedAt: string;
}

/** The building's words a notice heading uses (`rules.TERMINOLOGY`). */
export type MeetingHeadingTerms = Pick<Terms, "committee" | "bodyCorporateShortName">;

const headings = (terms: MeetingHeadingTerms): Record<string, string> => ({
  AGM: "NOTICE OF ANNUAL GENERAL MEETING",
  FIRST_AGM: "NOTICE OF FIRST ANNUAL GENERAL MEETING",
  EGM: "NOTICE OF GENERAL MEETING",
  SGM: "NOTICE OF GENERAL MEETING",
  COMMITTEE: `NOTICE OF ${terms.committee.toUpperCase()} MEETING`,
});

/** Assemble the structured content for a meeting notice. */
export function assembleNoticeContent(
  params: NoticeContentParams,
  terms: MeetingHeadingTerms,
): NoticeContent {
  const heading = headings(terms)[params.meeting.meetingType] ?? "NOTICE OF MEETING";
  const entity = bodyCorporateShortName(terms, params.scheme, { upperCase: true });
  return {
    heading: `${heading} — ${entity}`,
    scheme: params.scheme,
    meeting: {
      title: params.meeting.title,
      meetingType: params.meeting.meetingType,
      startTime: params.meeting.startTime,
      format: params.meeting.format,
      location: params.meeting.location,
      joinUrl: params.meeting.joinUrl,
      joinDetails: params.meeting.joinDetails,
      timezone: params.meeting.timezone,
    },
    items: params.items,
    generatedAt: new Date().toISOString(),
  };
}
