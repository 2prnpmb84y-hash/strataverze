import { db } from "@/prisma/db";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";

/** Cast an ISO string to the Prisma 8 TimestampString branded type. */
function toTimestamp(value: string): TimestampString<3> {
  return value as unknown as TimestampString<3>;
}

/**
 * Fetch all announcements for given scheme IDs, newest first.
 * Optionally excludes expired announcements.
 */
export async function getAnnouncementsForSchemes(
  schemeIds: string[],
  options?: { includeExpired?: boolean },
) {
  if (schemeIds.length === 0) return [];

  const all = await db.orm.public.Announcement
    .where((a) => a.schemeId.in(schemeIds))
    .include("author")
    .include("scheme")
    .orderBy((a) => a.publishedAt.desc())
    .all();

  // Sort pinned first (boolean ordering not supported in Prisma 8 ORM)
  const sorted = all.sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return 0;
  });

  if (options?.includeExpired) return sorted;

  const now = new Date();
  return sorted.filter(
    (a) => !a.expiresAt || new Date(String(a.expiresAt)) > now,
  );
}

/**
 * Fetch announcements for a single scheme.
 */
export async function getAnnouncementsForScheme(
  schemeId: string,
  options?: { includeExpired?: boolean },
) {
  return getAnnouncementsForSchemes([schemeId], options);
}

/**
 * Fetch a single announcement by ID.
 */
export async function getAnnouncementById(announcementId: string) {
  return db.orm.public.Announcement
    .include("author")
    .include("scheme")
    .first({ id: announcementId });
}

/**
 * Create a new announcement.
 */
export async function createAnnouncement(data: {
  schemeId: string;
  authorId: string;
  title: string;
  body: string;
  priority?: string;
  isPinned?: boolean;
  expiresAt?: string;
}) {
  return db.orm.public.Announcement.create({
    schemeId: data.schemeId,
    authorId: data.authorId,
    title: data.title,
    body: data.body,
    priority: data.priority ?? "NORMAL",
    isPinned: data.isPinned ?? false,
    expiresAt: data.expiresAt ? toTimestamp(data.expiresAt) : null,
  });
}

/**
 * Update an existing announcement.
 */
export async function updateAnnouncement(
  announcementId: string,
  data: Partial<{
    title: string;
    body: string;
    priority: string;
    isPinned: boolean;
    expiresAt: string | null;
  }>,
) {
  const update: Record<string, unknown> = {};
  if (data.title !== undefined) update.title = data.title;
  if (data.body !== undefined) update.body = data.body;
  if (data.priority !== undefined) update.priority = data.priority;
  if (data.isPinned !== undefined) update.isPinned = data.isPinned;
  if (data.expiresAt !== undefined)
    update.expiresAt = data.expiresAt ? toTimestamp(data.expiresAt) : null;

  return db.orm.public.Announcement
    .where({ id: announcementId })
    .update(update);
}

/**
 * Delete an announcement.
 */
export async function deleteAnnouncement(announcementId: string) {
  return db.orm.public.Announcement
    .where({ id: announcementId })
    .delete();
}
