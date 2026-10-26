import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";

/** Cast an ISO string to the Prisma 8 TimestampString branded type. */
function toTimestamp(value: string): TimestampString<3> {
  return value as unknown as TimestampString<3>;
}

/**
 * Fetch all meetings for a scheme, newest first.
 */
export async function getMeetingsForScheme(schemeId: string, limit = 200) {
  return db.orm.public.Meeting
    .where((m) => and(m.schemeId.eq(schemeId), m.deletedAt.eq(null)))
    .include("motions")
    .orderBy((m) => m.scheduledAt.desc())
    .limit(limit)
    .all();
}

/**
 * Fetch a single meeting by ID with its motions, votes and profiles.
 */
export async function getMeetingById(meetingId: string) {
  return db.orm.public.Meeting
    .where((m) => and(m.id.eq(meetingId), m.deletedAt.eq(null)))
    .include("motions", (mot) =>
      mot
        .include("raisedBy")
        .include("votes", (v) => v.include("profile"))
        .orderBy((m) => m.createdAt.asc()),
    )
    .first();
}

/**
 * Create a meeting within a scheme.
 */
export async function createMeeting(data: {
  schemeId: string;
  title: string;
  meetingType: string;
  scheduledAt: string;
  location?: string;
  agenda?: string;
  status?: string;
  startTime?: string;
  endTime?: string;
  timezone?: string;
  format?: string;
  convenorId?: string;
  chairpersonId?: string;
  financialPeriodId?: string;
  joinUrl?: string;
  joinDetails?: string;
}) {
  return db.orm.public.Meeting.create({
    schemeId: data.schemeId,
    title: data.title,
    meetingType: data.meetingType,
    scheduledAt: toTimestamp(data.scheduledAt),
    location: data.location ?? null,
    agenda: data.agenda ?? null,
    status: data.status ?? "SCHEDULED",
    startTime: data.startTime ? toTimestamp(data.startTime) : null,
    endTime: data.endTime ? toTimestamp(data.endTime) : null,
    timezone: data.timezone ?? null,
    format: data.format ?? null,
    convenorId: data.convenorId ?? null,
    chairpersonId: data.chairpersonId ?? null,
    financialPeriodId: data.financialPeriodId ?? null,
    joinUrl: data.joinUrl ?? null,
    joinDetails: data.joinDetails ?? null,
  });
}

type MeetingUpdate = Partial<{
  title: string;
  meetingType: string;
  scheduledAt: string;
  startTime: string;
  endTime: string | null;
  timezone: string;
  location: string | null;
  agenda: string | null;
  minutesUrl: string | null;
  status: string;
  openedAt: string;
  closedAt: string;
  format: string | null;
  joinUrl: string | null;
  joinDetails: string | null;
}>;

function meetingUpdateData(data: MeetingUpdate): Record<string, unknown> {
  const updateData: Record<string, unknown> = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.meetingType !== undefined) updateData.meetingType = data.meetingType;
  if (data.scheduledAt !== undefined) updateData.scheduledAt = toTimestamp(data.scheduledAt);
  if (data.startTime !== undefined) updateData.startTime = toTimestamp(data.startTime);
  if (data.endTime !== undefined) updateData.endTime = data.endTime ? toTimestamp(data.endTime) : null;
  if (data.timezone !== undefined) updateData.timezone = data.timezone;
  if (data.location !== undefined) updateData.location = data.location;
  if (data.agenda !== undefined) updateData.agenda = data.agenda;
  if (data.minutesUrl !== undefined) updateData.minutesUrl = data.minutesUrl;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.openedAt !== undefined) updateData.openedAt = toTimestamp(data.openedAt);
  if (data.closedAt !== undefined) updateData.closedAt = toTimestamp(data.closedAt);
  if (data.format !== undefined) updateData.format = data.format;
  if (data.joinUrl !== undefined) updateData.joinUrl = data.joinUrl;
  if (data.joinDetails !== undefined) updateData.joinDetails = data.joinDetails;
  return updateData;
}

/**
 * Update a meeting only while its status is one of `statuses`. Returns how
 * many rows changed (0 when the status moved on, or the meeting is not in the
 * scheme or is deleted), so a stale page cannot change a meeting after notice.
 */
export async function updateMeetingWhileStatus(
  schemeId: string,
  meetingId: string,
  statuses: readonly string[],
  data: MeetingUpdate,
  orm: typeof db.orm = db.orm,
): Promise<number> {
  return orm.public.Meeting
    .where((m) => and(m.id.eq(meetingId), m.schemeId.eq(schemeId), m.deletedAt.eq(null), m.status.in([...statuses])))
    .updateAndCount(meetingUpdateData(data));
}

/**
 * Update a meeting. Scheme-scoped: a meeting from another scheme matches nothing.
 */
export async function updateMeeting(
  schemeId: string,
  meetingId: string,
  data: MeetingUpdate,
  orm: typeof db.orm = db.orm,
) {
  const updateData = meetingUpdateData(data);
  return orm.public.Meeting
    .where((m) => and(m.id.eq(meetingId), m.schemeId.eq(schemeId)))
    .update(updateData);
}

/**
 * Soft-delete a meeting. Scheme-scoped: a meeting from another scheme matches nothing.
 */
export async function deleteMeeting(schemeId: string, meetingId: string) {
  return db.orm.public.Meeting
    .where((m) => and(m.id.eq(meetingId), m.schemeId.eq(schemeId)))
    .update({ deletedAt: toTimestamp(new Date().toISOString()) });
}

/**
 * Get upcoming meetings for an owner's schemes, including motions with votes.
 */
export async function getUpcomingMeetingsForOwner(schemeIds: string[], limit = 200) {
  if (schemeIds.length === 0) return [];

  // The latest meetings (so the upcoming ones are never cut off by a long
  // history), returned earliest first.
  const rows = await db.orm.public.Meeting
    .where((m) => and(m.schemeId.in(schemeIds), m.deletedAt.eq(null)))
    .include("motions", (mot) =>
      mot
        .include("votes")
        .orderBy((m) => m.createdAt.asc()),
    )
    .orderBy((m) => m.scheduledAt.desc())
    .limit(limit)
    .all();
  return rows.reverse();
}
