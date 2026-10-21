/**
 * Notice assembly (pure).
 *
 * Builds the structured content of a meeting notice from the meeting, its
 * agenda and the scheme. Notice-period compliance is computed separately with
 * `validateNoticePeriod` from the rules layer at issue time.
 */

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

const HEADINGS: Record<string, string> = {
  AGM: "NOTICE OF ANNUAL GENERAL MEETING",
  FIRST_AGM: "NOTICE OF FIRST ANNUAL GENERAL MEETING",
  EGM: "NOTICE OF GENERAL MEETING",
  SGM: "NOTICE OF GENERAL MEETING",
  COMMITTEE: "NOTICE OF STRATA COMMITTEE MEETING",
};

/** Assemble the structured content for a meeting notice. */
export function assembleNoticeContent(
  params: NoticeContentParams,
): NoticeContent {
  const heading = HEADINGS[params.meeting.meetingType] ?? "NOTICE OF MEETING";
  return {
    heading: `${heading} — THE OWNERS - STRATA PLAN ${params.scheme.planNumber}`,
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
