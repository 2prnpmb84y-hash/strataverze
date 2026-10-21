import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";

/** All agenda items for a meeting, in position order. */
export async function getAgendaItemsForMeeting(meetingId: string) {
  return db.orm.public.AgendaItem
    .where((a) => a.meetingId.eq(meetingId))
    .orderBy((a) => a.position.asc())
    .all();
}

/** The next free position (1-based) for a meeting's agenda. */
export async function getNextAgendaPosition(meetingId: string): Promise<number> {
  const items = await db.orm.public.AgendaItem
    .where((a) => a.meetingId.eq(meetingId))
    .orderBy((a) => a.position.desc())
    .limit(1)
    .all();
  const top = items[0];
  return top ? top.position + 1 : 1;
}

export interface CreateAgendaItemData {
  meetingId: string;
  position: number;
  title: string;
  resolutionText?: string | null;
  explanatoryNote?: string | null;
  resolutionCategory?: string | null;
  submitterId?: string | null;
  motionLibraryEntryId?: string | null;
}

export async function createAgendaItem(data: CreateAgendaItemData) {
  return db.orm.public.AgendaItem.create({
    meetingId: data.meetingId,
    position: data.position,
    title: data.title,
    resolutionText: data.resolutionText ?? null,
    explanatoryNote: data.explanatoryNote ?? null,
    resolutionCategory: data.resolutionCategory ?? null,
    submitterId: data.submitterId ?? null,
    motionLibraryEntryId: data.motionLibraryEntryId ?? null,
    status: "PENDING",
  });
}

export async function updateAgendaItem(
  id: string,
  data: Partial<{
    title: string;
    resolutionText: string | null;
    explanatoryNote: string | null;
    resolutionCategory: string | null;
    position: number;
    outcome: string | null;
    status: string;
  }>,
) {
  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) update[k] = v;
  }
  return db.orm.public.AgendaItem.where({ id }).update(update);
}

export async function deleteAgendaItem(id: string) {
  return db.orm.public.AgendaItem.where({ id }).delete();
}

/** Fetch a single agenda item scoped to its meeting. */
export async function getAgendaItem(meetingId: string, id: string) {
  return db.orm.public.AgendaItem
    .where((a) => and(a.id.eq(id), a.meetingId.eq(meetingId)))
    .first();
}
