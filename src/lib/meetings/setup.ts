/**
 * Stage A — meeting setup (shared by the adviser and committee portals).
 *
 * Pure validation and preview helpers plus the create path that snapshots the
 * governing rule set onto the meeting and records the opening audit event.
 */
import { getActiveRuleSet, applyRuleSetToMeeting } from "./rule-set-repo";
import { recordMeetingEvent } from "./events";
import {
  earliestCompliantMeetingDate,
  validateNoticePeriod,
  type MeetingRuleSet,
  type MeetingType,
} from "./rules";
import { createMeeting } from "@/lib/queries/meetings";

export const MEETING_TYPES: MeetingType[] = [
  "AGM",
  "EGM",
  "COMMITTEE",
  "FIRST_AGM",
];

export const MEETING_FORMATS = ["IN_PERSON", "VIRTUAL", "HYBRID"] as const;
export type MeetingFormat = (typeof MEETING_FORMATS)[number];

export const DEFAULT_TIMEZONE = "Australia/Sydney";

/** Map a legacy or alias meeting type to the canonical rule type. */
export function normaliseMeetingType(value: string): MeetingType | null {
  const v = (value ?? "").toUpperCase();
  if (v === "SGM") return "EGM"; // legacy label
  if ((MEETING_TYPES as string[]).includes(v)) return v as MeetingType;
  return null;
}

export interface MeetingSetupInput {
  schemeId: string;
  title: string;
  meetingType: string;
  startTime: string; // ISO
  endTime?: string | null;
  timezone?: string | null;
  format?: string | null;
  location?: string | null;
  convenorId?: string | null;
  chairpersonId?: string | null;
  financialPeriodId?: string | null;
  joinUrl?: string | null;
  joinDetails?: string | null;
}

export interface SetupValidation {
  errors: Record<string, string>;
  warnings: Record<string, string>;
}

/** Pure validation of a setup payload against a rule set. */
export function validateMeetingSetup(
  input: MeetingSetupInput,
  ruleSet: MeetingRuleSet,
  now: Date = new Date(),
): SetupValidation {
  const errors: Record<string, string> = {};
  const warnings: Record<string, string> = {};

  if (!input.title?.trim()) errors.title = "Title is required.";

  const type = normaliseMeetingType(input.meetingType);
  if (!type) errors.meetingType = "Select a valid meeting type.";

  if (!input.startTime) errors.startTime = "Date and start time are required.";

  const start = input.startTime ? new Date(input.startTime) : null;
  const end = input.endTime ? new Date(input.endTime) : null;
  if (start && Number.isNaN(start.getTime()))
    errors.startTime = "Invalid start time.";
  if (end && start && !Number.isNaN(start.getTime()) && end <= start)
    errors.endTime = "End time must be after the start time.";

  const format = input.format ?? null;
  if (format === "VIRTUAL" || format === "HYBRID") {
    if (!input.joinUrl?.trim())
      errors.joinUrl = "A join link is required for a virtual or hybrid meeting.";
  }
  if (format === "IN_PERSON" || format === "HYBRID") {
    if (!input.location?.trim())
      errors.location =
        "A location is required for an in-person or hybrid meeting.";
  }

  if (type && start && !Number.isNaN(start.getTime())) {
    const v = validateNoticePeriod(ruleSet, type, now, start);
    if (!v.compliant && v.requiredDays != null) {
      warnings.startTime = `This is short of the ${v.requiredDays}-day notice period for this meeting type (currently ${v.actualDays} day(s) away).`;
    }
  }

  return { errors, warnings };
}

export interface SetupPreviewRow {
  meetingType: MeetingType;
  noticeDays: number | null;
  earliestDate: string | null;
}

/** The earliest compliant meeting date for each meeting type, for the UI preview. */
export function buildSetupPreview(
  ruleSet: MeetingRuleSet,
  now: Date = new Date(),
): SetupPreviewRow[] {
  return MEETING_TYPES.map((t) => {
    const earliest = earliestCompliantMeetingDate(ruleSet, t, now);
    return {
      meetingType: t,
      noticeDays: ruleSet.noticePeriods[t] ?? null,
      earliestDate: earliest ? earliest.toISOString() : null,
    };
  });
}

/**
 * Create a meeting at DRAFT, snapshot the rule set that governs it, and record
 * the opening event. The scheme's state selects the rule set.
 */
export async function createMeetingWithRuleSnapshot(
  input: MeetingSetupInput,
  opts: { state: string; actorId: string },
) {
  const meeting = await createMeeting({
    schemeId: input.schemeId,
    title: input.title.trim(),
    meetingType: input.meetingType,
    scheduledAt: input.startTime,
    startTime: input.startTime,
    endTime: input.endTime ?? undefined,
    timezone: input.timezone ?? DEFAULT_TIMEZONE,
    format: input.format ?? undefined,
    location: input.location?.trim() || undefined,
    convenorId: input.convenorId ?? undefined,
    chairpersonId: input.chairpersonId ?? undefined,
    financialPeriodId: input.financialPeriodId ?? undefined,
    joinUrl: input.joinUrl?.trim() || undefined,
    joinDetails: input.joinDetails?.trim() || undefined,
    status: "DRAFT",
  });

  const ruleSet = await getActiveRuleSet(opts.state);
  await applyRuleSetToMeeting(meeting.id, ruleSet);
  await recordMeetingEvent({
    meetingId: meeting.id,
    actorId: opts.actorId,
    eventType: "MEETING_CREATED",
    payload: {
      meetingType: input.meetingType,
      ruleSetVersion: ruleSet.version,
    },
  });

  return meeting;
}
