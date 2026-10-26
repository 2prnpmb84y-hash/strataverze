/**
 * Meeting lifecycle state machine (pure).
 *
 * Every stage transition keys off an explicit status. The legacy default
 * "SCHEDULED" (from the pre-wizard CRUD) is treated as equivalent to DRAFT at
 * the start of the flow.
 */

export type MeetingStatus =
  | "SCHEDULED" // legacy start state
  | "DRAFT"
  | "NOTICE_ISSUED"
  | "IN_PROGRESS"
  | "MINUTES_DRAFT"
  | "PUBLISHED"
  | "CANCELLED"
  | "ADJOURNED";

export const MEETING_STATUSES: MeetingStatus[] = [
  "SCHEDULED",
  "DRAFT",
  "NOTICE_ISSUED",
  "IN_PROGRESS",
  "MINUTES_DRAFT",
  "PUBLISHED",
  "CANCELLED",
  "ADJOURNED",
];

const TRANSITIONS: Record<MeetingStatus, MeetingStatus[]> = {
  SCHEDULED: ["DRAFT", "NOTICE_ISSUED", "CANCELLED"],
  DRAFT: ["NOTICE_ISSUED", "CANCELLED"],
  NOTICE_ISSUED: ["NOTICE_ISSUED", "IN_PROGRESS", "ADJOURNED", "CANCELLED"],
  IN_PROGRESS: ["MINUTES_DRAFT", "ADJOURNED"],
  MINUTES_DRAFT: ["PUBLISHED"],
  ADJOURNED: ["NOTICE_ISSUED", "CANCELLED"],
  PUBLISHED: [],
  CANCELLED: [],
};

export function isMeetingStatus(value: string): value is MeetingStatus {
  return (MEETING_STATUSES as string[]).includes(value);
}

/** Whether a transition from `from` to `to` is permitted. */
export function canTransition(from: string, to: string): boolean {
  if (!isMeetingStatus(from) || !isMeetingStatus(to)) return false;
  return TRANSITIONS[from].includes(to);
}

/** The statuses reachable from `from`. */
export function allowedTransitions(from: string): MeetingStatus[] {
  return isMeetingStatus(from) ? [...TRANSITIONS[from]] : [];
}

export class MeetingTransitionError extends Error {
  constructor(
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`Cannot move a meeting from ${from} to ${to}`);
    this.name = "MeetingTransitionError";
  }
}

/** Throw unless the transition is permitted. */
export function assertTransition(from: string, to: string): void {
  if (!canTransition(from, to)) {
    throw new MeetingTransitionError(from, to);
  }
}

export function isTerminal(status: string): boolean {
  return status === "PUBLISHED" || status === "CANCELLED";
}

/**
 * Before notice: the meeting's details (title, type, time, place) can still
 * be changed. Meetings start at DRAFT; old rows start at SCHEDULED.
 */
export function isBeforeNotice(status: string): boolean {
  return status === "DRAFT" || status === "SCHEDULED";
}

/**
 * The meeting's details (time, place, format, title) can be changed: before
 * notice, or while adjourned, when the meeting is given a new time and place
 * before its notice is issued again.
 */
export function canEditDetails(status: string): boolean {
  return isBeforeNotice(status) || status === "ADJOURNED";
}

/**
 * Finished meetings: minutes published, cancelled, or (old rows) completed.
 * Every other status is a current meeting, whether or not notice is out.
 */
export function isFinishedMeeting(status: string): boolean {
  return status === "PUBLISHED" || status === "CANCELLED" || status === "COMPLETED";
}

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Scheduled",
  DRAFT: "Notice not yet issued",
  NOTICE_ISSUED: "Notice issued",
  IN_PROGRESS: "In progress",
  ADJOURNED: "Adjourned",
  MINUTES_DRAFT: "Minutes being prepared",
  PUBLISHED: "Minutes published",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/** A meeting status in plain words. */
export function meetingStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ");
}

/** Status filter choices for meeting lists, in the order a meeting moves through them. */
export const MEETING_STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  "DRAFT", "SCHEDULED", "NOTICE_ISSUED", "IN_PROGRESS", "ADJOURNED", "MINUTES_DRAFT", "PUBLISHED", "COMPLETED", "CANCELLED",
].map((value) => ({ value, label: STATUS_LABELS[value] }));

/** Upcoming: not finished, and either under way now or not yet started. */
export function isUpcomingMeeting(status: string, startsAt: Date, now: Date = new Date()): boolean {
  if (isFinishedMeeting(status)) return false;
  return status === "IN_PROGRESS" || startsAt.getTime() >= now.getTime();
}

/**
 * Owners may vote on a meeting's motions only once its notice is out (or, for
 * old rows, while it is scheduled), and until it closes.
 */
export function isOpenForVoting(status: string): boolean {
  return status === "SCHEDULED" || status === "NOTICE_ISSUED" || status === "IN_PROGRESS";
}
