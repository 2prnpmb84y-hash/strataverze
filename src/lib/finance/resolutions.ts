/**
 * General meeting resolutions (server side): finding the carried motions a
 * decision can rely on, and checking a chosen meeting and motion.
 */
import { db } from "@/prisma/db";
import { formatDateIn, isTimeZone, storedDayIn } from "@/lib/jurisdiction/time-zone";
import { schemeTimeZone } from "@/lib/jurisdiction/scheme-time";
import { and } from "@prisma/orm-postgres/orm-client";

export const GENERAL_MEETING_TYPES = ["AGM", "EGM", "SGM", "FIRST_AGM"];

export interface ResolutionMeeting {
  id: string;
  label: string;
  meetingType: string;
  motions: { id: string; label: string }[];
}

const carried = (a: { status: string; outcome: string | null }) => a.status === "CARRIED" || a.outcome === "RESOLVED";

/** General meetings of the scheme with their carried motions, newest first. `types` narrows to AGMs, for example. */
export async function resolutionMeetings(schemeId: string, types: string[] = GENERAL_MEETING_TYPES): Promise<ResolutionMeeting[]> {
  const meetings = await db.orm.public.Meeting
    .where((m) => and(m.schemeId.eq(schemeId), m.meetingType.in(types)))
    .orderBy((m) => m.scheduledAt.desc())
    .limit(100)
    .all();
  if (meetings.length === 0) return [];
  const tz = await schemeTimeZone(schemeId);
  const items = await db.orm.public.AgendaItem
    .where((a) => a.meetingId.in(meetings.map((m) => m.id)))
    .orderBy((a) => a.position.asc())
    .limit(5000)
    .all();
  return meetings
    .map((m) => ({
      id: m.id,
      meetingType: m.meetingType,
      // The meeting's date in its own time zone (the building's if none is recorded).
      label: `${m.title} (${formatDateIn(isTimeZone(m.timezone) ? String(m.timezone) : tz, String(m.scheduledAt))})`,
      motions: items.filter((a) => a.meetingId === m.id && carried(a)).map((a) => ({ id: a.id, label: `${a.position}. ${a.title}` })),
    }))
    .filter((m) => m.motions.length > 0);
}

/** Null when the meeting is a general meeting of the scheme and the motion was carried at it; otherwise why not. */
export async function generalMeetingResolutionProblem(
  schemeId: string,
  meetingId: string | null,
  motionId: string | null,
  types: string[] = GENERAL_MEETING_TYPES,
): Promise<string | null> {
  if (!meetingId || !motionId) return "Choose the general meeting and the motion carried at it.";
  const meeting = await db.orm.public.Meeting.where((m) => m.id.eq(meetingId)).first();
  if (!meeting || meeting.schemeId !== schemeId || !types.includes(meeting.meetingType)) {
    return types.length === 2 && types.includes("AGM") ? "Choose an annual general meeting of this scheme." : "Choose a general meeting of this scheme.";
  }
  const motion = await db.orm.public.AgendaItem.where((a) => a.id.eq(motionId)).first();
  if (!motion || motion.meetingId !== meeting.id) return "Choose a motion from that meeting.";
  if (!carried(motion)) return "That motion was not carried, so it cannot be relied on.";
  return null;
}

/** The kind of resolution a decision needs (a pack's `LateChargeResolution`): any carried motion at a general meeting, or one recorded as a category. */
export interface ResolutionKind {
  kind: "GENERAL_MEETING" | "ORDINARY" | "SPECIAL";
  /** "special resolution" */
  words: string;
}

/**
 * Null when the motion was carried at a general meeting of the scheme and,
 * for an ORDINARY or SPECIAL kind, is recorded as that category
 * (`agenda_items.resolution_category`); otherwise why not (VIC, ACT and WA
 * stage 2, PR 5). A motion with no category recorded is refused for a kind
 * that names one, rather than taken to be it.
 */
export async function resolutionOfKindProblem(schemeId: string, meetingId: string | null, motionId: string | null, kind: ResolutionKind): Promise<string | null> {
  const problem = await generalMeetingResolutionProblem(schemeId, meetingId, motionId);
  if (problem || kind.kind === "GENERAL_MEETING") return problem;
  const motion = await db.orm.public.AgendaItem.where((a) => a.id.eq(motionId!)).first();
  if (motion?.resolutionCategory !== kind.kind) return `That motion is not recorded as a ${kind.words}. Choose a motion carried as a ${kind.words}.`;
  return null;
}

/** The day a meeting was held, in its own time zone (the building's if none is recorded), or null if it is not found. */
export async function meetingDay(schemeId: string, meetingId: string): Promise<string | null> {
  const meeting = await db.orm.public.Meeting.where((m) => m.id.eq(meetingId)).first();
  if (!meeting || meeting.schemeId !== schemeId) return null;
  const tz = isTimeZone(meeting.timezone) ? String(meeting.timezone) : await schemeTimeZone(schemeId);
  return storedDayIn(tz, meeting.scheduledAt) || null;
}
