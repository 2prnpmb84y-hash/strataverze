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

/**
 * Update a meeting.
 */
export async function updateMeeting(
  meetingId: string,
  data: Partial<{
    title: string;
    meetingType: string;
    scheduledAt: string;
    location: string | null;
    agenda: string | null;
    minutesUrl: string | null;
    status: string;
    openedAt: string;
    closedAt: string;
  }>,
) {
  const updateData: Record<string, unknown> = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.meetingType !== undefined) updateData.meetingType = data.meetingType;
  if (data.scheduledAt !== undefined) updateData.scheduledAt = toTimestamp(data.scheduledAt);
  if (data.location !== undefined) updateData.location = data.location;
  if (data.agenda !== undefined) updateData.agenda = data.agenda;
  if (data.minutesUrl !== undefined) updateData.minutesUrl = data.minutesUrl;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.openedAt !== undefined) updateData.openedAt = toTimestamp(data.openedAt);
  if (data.closedAt !== undefined) updateData.closedAt = toTimestamp(data.closedAt);

  return db.orm.public.Meeting.where({ id: meetingId }).update(updateData);
}

/**
 * Soft-delete a meeting.
 */
export async function deleteMeeting(meetingId: string) {
  return db.orm.public.Meeting
    .where({ id: meetingId })
    .update({ deletedAt: toTimestamp(new Date().toISOString()) });
}

/**
 * Get upcoming meetings for an owner's schemes, including motions with votes.
 */
export async function getUpcomingMeetingsForOwner(schemeIds: string[], limit = 200) {
  if (schemeIds.length === 0) return [];

  return db.orm.public.Meeting
    .where((m) => and(m.schemeId.in(schemeIds), m.deletedAt.eq(null)))
    .include("motions", (mot) =>
      mot
        .include("votes")
        .orderBy((m) => m.createdAt.asc()),
    )
    .orderBy((m) => m.scheduledAt.asc())
    .limit(limit)
    .all();
}
