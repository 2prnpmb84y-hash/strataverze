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
