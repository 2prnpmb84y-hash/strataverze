import { db } from "@/prisma/db";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";

/** Cast an ISO string to the Prisma 8 TimestampString branded type. */
function toTimestamp(value: string): TimestampString<3> {
  return value as unknown as TimestampString<3>;
}

/**
 * Fetch all meetings for a scheme, newest first.
 */
export async function getMeetingsForScheme(schemeId: string) {
  return db.orm.public.Meeting
    .where((m) => m.schemeId.eq(schemeId))
    .include("motions")
    .orderBy((m) => m.scheduledAt.desc())
    .all();
}

/**
 * Fetch a single meeting by ID with its motions, votes and profiles.
 */
export async function getMeetingById(meetingId: string) {
  return db.orm.public.Meeting
    .include("motions", (mot) =>
      mot
        .include("raisedBy")
        .include("votes", (v) => v.include("profile"))
        .orderBy((m) => m.createdAt.asc()),
    )
    .first({ id: meetingId });
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
}) {
  return db.orm.public.Meeting.create({
    schemeId: data.schemeId,
    title: data.title,
    meetingType: data.meetingType,
    scheduledAt: toTimestamp(data.scheduledAt),
    location: data.location ?? null,
    agenda: data.agenda ?? null,
    status: "SCHEDULED",
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

  return db.orm.public.Meeting.where({ id: meetingId }).update(updateData);
}

/**
 * Delete a meeting.
 */
export async function deleteMeeting(meetingId: string) {
  return db.orm.public.Meeting.where({ id: meetingId }).delete();
}

/**
 * Get upcoming meetings for an owner's schemes.
 */
export async function getUpcomingMeetingsForOwner(schemeIds: string[]) {
  if (schemeIds.length === 0) return [];

  return db.orm.public.Meeting
    .where((m) => m.schemeId.in(schemeIds))
    .include("motions")
    .orderBy((m) => m.scheduledAt.asc())
    .all();
}
