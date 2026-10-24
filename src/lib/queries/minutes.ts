import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";

export interface CreateMinutesData {
  meetingId: string;
  version: number;
  state?: string;
  content: unknown;
  preparedById?: string | null;
}

export async function createMinutes(data: CreateMinutesData) {
  return db.orm.public.Minutes.create({
    meetingId: data.meetingId,
    version: data.version,
    state: data.state ?? "DRAFT",
    content: data.content as never,
    preparedById: data.preparedById ?? null,
  });
}

export async function getMinutesForMeeting(meetingId: string) {
  return db.orm.public.Minutes
    .where((m) => m.meetingId.eq(meetingId))
    .orderBy((m) => m.version.desc())
    .all();
}

export async function getLatestMinutes(meetingId: string) {
  const rows = await db.orm.public.Minutes
    .where((m) => m.meetingId.eq(meetingId))
    .orderBy((m) => m.version.desc())
    .limit(1)
    .all();
  return rows[0] ?? null;
}

/** Meeting-scoped: minutes of another meeting match nothing. */
export async function updateMinutes(
  meetingId: string,
  id: string,
  data: Partial<{
    state: string;
    content: unknown;
    confirmedAt: string | null;
    confirmedById: string | null;
    distributedAt: string | null;
    retentionUntil: string | null;
    documentUrl: string | null;
  }>,
) {
  const update: Record<string, unknown> = {};
  if (data.state !== undefined) update.state = data.state;
  if (data.content !== undefined) update.content = data.content;
  if (data.confirmedAt !== undefined) update.confirmedAt = data.confirmedAt;
  if (data.confirmedById !== undefined) update.confirmedById = data.confirmedById;
  if (data.distributedAt !== undefined) update.distributedAt = data.distributedAt;
  if (data.retentionUntil !== undefined)
    update.retentionUntil = data.retentionUntil;
  if (data.documentUrl !== undefined) update.documentUrl = data.documentUrl;
  return db.orm.public.Minutes
    .where((m) => and(m.id.eq(id), m.meetingId.eq(meetingId)))
    .update(update);
}
