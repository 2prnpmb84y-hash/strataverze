/**
 * Append-only meeting event log.
 *
 * Every change during a meeting is recorded here and never updated or deleted,
 * mirroring the append-only discipline of the financial ledger. This is the
 * auditable record of what happened during conduct.
 */
import { db } from "@/prisma/db";

export interface MeetingEventInput {
  meetingId: string;
  actorId?: string | null;
  eventType: string;
  payload?: Record<string, unknown> | null;
}

/** Append an event. There is deliberately no update or delete counterpart. */
export async function recordMeetingEvent(input: MeetingEventInput) {
  return db.orm.public.MeetingEvent.create({
    meetingId: input.meetingId,
    actorId: input.actorId ?? null,
    eventType: input.eventType,
    payload: (input.payload ?? null) as never,
  });
}

/** Read the event log for a meeting, oldest first. */
export async function getMeetingEvents(meetingId: string) {
  return db.orm.public.MeetingEvent
    .where((e) => e.meetingId.eq(meetingId))
    .orderBy((e) => e.createdAt.asc())
    .all();
}
