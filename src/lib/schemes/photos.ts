import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import { signDownloads } from "@/lib/storage/server-storage";
import { consumeUpload, verifyUpload } from "@/lib/storage/uploads";
import { schemeStoragePathProblem, toStoragePath } from "@/lib/queries/document-url";
import { recordSecurityEvent } from "@/lib/audit/security-audit";
import { logActivity } from "@/lib/queries/activity-log";

/**
 * Property photos (25 Oct 2026), server side. A photo is a scheme_images
 * row whose url is its path in the private documents bucket, under the
 * building's own folder. Pages show them through short-lived signed links
 * made here, never the path itself. Callers check the person may see the
 * building first.
 */

/** How long a signed photo link lasts. Pages are rendered per request. */
export const PHOTO_LINK_SECONDS = 15 * 60;

type StoredImage = { id: string; url: string; caption?: string | null };

/** The stored path of a photo, only if it is inside this building's folder. */
export function photoPathFor(schemeId: string, url: string): string | null {
  const path = toStoragePath(url);
  if (!path || schemeStoragePathProblem(schemeId, path)) return null;
  return path;
}

/** A building's photos with signed links, in their order. Photos that cannot be signed are left out. */
export async function signedSchemeImages(schemeId: string, images: readonly StoredImage[]): Promise<Array<{ id: string; url: string; caption: string | null }>> {
  const usable = images.map((img) => ({ img, path: photoPathFor(schemeId, img.url) })).filter((x): x is { img: StoredImage; path: string } => !!x.path);
  const links = await signDownloads(usable.map((x) => x.path), PHOTO_LINK_SECONDS);
  return usable.flatMap((x, i) => (links[i] ? [{ id: x.img.id, url: links[i]!, caption: x.img.caption ?? null }] : []));
}

/**
 * The first photo of each building, signed in one request, for lists.
 * A building without a usable photo maps to null.
 */
export async function schemeThumbnails(schemes: ReadonlyArray<{ id: string; images?: readonly StoredImage[] | null }>): Promise<Record<string, string | null>> {
  const firsts = schemes.map((s) => {
    const first = (s.images ?? []).map((img) => photoPathFor(s.id, img.url)).find((p): p is string => !!p) ?? null;
    return { id: s.id, path: first };
  });
  const withPath = firsts.filter((f): f is { id: string; path: string } => !!f.path);
  const links = await signDownloads(withPath.map((f) => f.path), PHOTO_LINK_SECONDS);
  const out: Record<string, string | null> = Object.fromEntries(firsts.map((f) => [f.id, null]));
  withPath.forEach((f, i) => {
    out[f.id] = links[i] ?? null;
  });
  return out;
}

/**
 * Make a verified upload the building's main photo. Earlier photos stay in
 * the photo area, after it. The upload must be this person's, for this
 * building and the scheme_photo purpose (verifyUpload checks all three).
 */
export async function setSchemePhoto(input: { schemeId: string; uploadId: string; actorId: string; actorRole: string }) {
  const upload = await verifyUpload({ uploadId: input.uploadId, schemeId: input.schemeId, purpose: "scheme_photo", profileId: input.actorId });
  const existing = await db.orm.public.SchemeImage.where((i) => i.schemeId.eq(input.schemeId)).all();
  const sortOrder = existing.length ? Math.min(...existing.map((e) => Number(e.sortOrder))) - 1 : 0;
  const image = await consumeUpload(
    upload.uploadId,
    () => db.orm.public.SchemeImage.create({ schemeId: input.schemeId, url: upload.path, caption: null, sortOrder }),
    (img) => `SchemeImage:${img.id}`,
  );
  await recordSecurityEvent({
    action: "scheme.photo_set",
    outcome: "allowed",
    actorProfileId: input.actorId,
    actorRole: input.actorRole,
    schemeId: input.schemeId,
    resourceType: "SchemeImage",
    resourceId: image.id,
  });
  await logActivity({
    schemeId: input.schemeId,
    actorId: input.actorId,
    action: "SCHEME_UPDATED",
    entityType: "Scheme",
    entityId: input.schemeId,
    metadata: { change: "property photo", fileName: upload.fileName },
  });
  return image;
}

/**
 * Remove a property photo (25 Oct 2026): the one the page shows first. The
 * next earlier photo, if any, takes its place. The record is removed; the
 * file stays in the private bucket with no link to it. The photo must be
 * this building's.
 */
export async function removeSchemePhoto(input: { schemeId: string; imageId: string; actorId: string; actorRole: string }): Promise<{ removed: boolean; remaining: number }> {
  const images = await db.orm.public.SchemeImage.where((i) => i.schemeId.eq(input.schemeId)).all();
  const target = images.find((i) => i.id === input.imageId);
  if (!target) return { removed: false, remaining: images.length };
  await db.orm.public.SchemeImage.where((i) => and(i.id.eq(target.id), i.schemeId.eq(input.schemeId))).delete();
  await recordSecurityEvent({
    action: "scheme.photo_removed",
    outcome: "allowed",
    actorProfileId: input.actorId,
    actorRole: input.actorRole,
    schemeId: input.schemeId,
    resourceType: "SchemeImage",
    resourceId: target.id,
  });
  await logActivity({
    schemeId: input.schemeId,
    actorId: input.actorId,
    action: "SCHEME_UPDATED",
    entityType: "Scheme",
    entityId: input.schemeId,
    metadata: { change: "property photo removed" },
  });
  return { removed: true, remaining: images.length - 1 };
}
