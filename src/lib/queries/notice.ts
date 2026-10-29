import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";

export interface CreateNoticeData {
  meetingId: string;
  version: number;
  issuedById?: string | null;
  noticePeriodDays?: number | null;
  compliant: boolean;
  content: unknown;
}

export async function createNotice(data: CreateNoticeData) {
  return db.orm.public.Notice.create({
    meetingId: data.meetingId,
    version: data.version,
    status: "ISSUED",
    issuedById: data.issuedById ?? null,
    noticePeriodDays: data.noticePeriodDays ?? null,
    compliant: data.compliant,
    content: data.content as never,
  });
}

/** Notices for a meeting, newest version first, with recipients. */
export async function getNoticesForMeeting(meetingId: string) {
  return db.orm.public.Notice
    .where((n) => n.meetingId.eq(meetingId))
    .include("recipients")
    .orderBy((n) => n.version.desc())
    .all();
}

export async function getLatestNoticeVersion(meetingId: string): Promise<number> {
  const rows = await db.orm.public.Notice
    .where((n) => n.meetingId.eq(meetingId))
    .orderBy((n) => n.version.desc())
    .limit(1)
    .all();
  return rows[0]?.version ?? 0;
}

/**
 * The latest notice issued for a meeting and still in force (status ISSUED,
 * the highest version), or null. Read where a resolution needs a longer
 * notice (the draft packs only; VIC, ACT and WA stage 2, PR 8b-iii).
 */
export async function getLatestIssuedNotice(meetingId: string) {
  return db.orm.public.Notice
    .where((n) => and(n.meetingId.eq(meetingId), n.status.eq("ISSUED")))
    .orderBy((n) => n.version.desc())
    .first();
}

/** Mark all existing notices for a meeting as superseded. */
export async function supersedeNotices(meetingId: string) {
  return db.orm.public.Notice
    .where((n) => n.meetingId.eq(meetingId))
    .updateAndCount({ status: "SUPERSEDED" });
}

export interface CreateNoticeRecipientData {
  noticeId: string;
  lotId?: string | null;
  profileId?: string | null;
  name?: string | null;
  email?: string | null;
  method?: string;
  deliveryOutcome?: string;
  sentAt?: string | null;
}

export async function createNoticeRecipient(data: CreateNoticeRecipientData) {
  return db.orm.public.NoticeRecipient.create({
    noticeId: data.noticeId,
    lotId: data.lotId ?? null,
    profileId: data.profileId ?? null,
    name: data.name ?? null,
    email: data.email ?? null,
    method: data.method ?? "EMAIL",
    deliveryOutcome: data.deliveryOutcome ?? "PENDING",
    sentAt: data.sentAt ? (data.sentAt as never) : null,
  });
}
