/**
 * Works requests raised by owners and the committee (server side,
 * 25 Oct 2026). Callers authorise first (works.request) and pass the
 * signed-in profile. A request goes straight to the committee (SUBMITTED);
 * one the committee returns can be changed and sent back by whoever raised it.
 */
import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString, Varchar } from "@prisma/orm-postgres/target/codec-types";
import { db } from "@/prisma/db";
import { isWorksTrade, WORKS_PHOTOS_MAX } from "@/config/works";
import { consumeUpload, verifyUpload, type VerifiedUpload } from "@/lib/storage/uploads";
import { signDownloads } from "@/lib/storage/server-storage";
import { schemeStoragePathProblem, toStoragePath } from "@/lib/queries/document-url";
import { logError } from "@/lib/log";

const ts = (v: string) => v as unknown as TimestampString<3>;
const vc = <N extends number>(v: string) => v as unknown as Varchar<N>;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export interface RequestInput {
  title: string;
  trade: string;
  location: string | null;
  description: string;
  isEmergency: boolean;
  photoUploadIds: string[];
}

export type RequestCheck = { ok: true; value: RequestInput } | { ok: false; fieldErrors: Record<string, string> };

/** Check the request form (pure). */
export function checkRequest(raw: { title?: unknown; trade?: unknown; location?: unknown; description?: unknown; isEmergency?: unknown; photoUploadIds?: unknown }): RequestCheck {
  const fieldErrors: Record<string, string> = {};
  const text = (v: unknown) => String(v ?? "").trim();
  const title = text(raw.title);
  if (!title) fieldErrors.title = "Say in a few words what needs fixing.";
  else if (title.length > 120) fieldErrors.title = "Keep the title to 120 characters.";
  else if (CONTROL.test(title) || /[\r\n]/.test(title)) fieldErrors.title = "The title cannot contain line breaks.";
  const trade = text(raw.trade);
  if (!isWorksTrade(trade)) fieldErrors.trade = "Choose the kind of work. If unsure, choose Other.";
  const location = text(raw.location) || null;
  if (location && location.length > 300) fieldErrors.location = "Keep the location to 300 characters.";
  const description = text(raw.description);
  if (description.length < 10) fieldErrors.description = "Describe the problem: what you saw, where, and since when.";
  else if (description.length > 5000) fieldErrors.description = "Keep the description to 5,000 characters.";
  else if (CONTROL.test(description)) fieldErrors.description = "The description contains characters that cannot be saved.";
  const ids = (Array.isArray(raw.photoUploadIds) ? raw.photoUploadIds : []).map(String).filter(Boolean);
  if (ids.length > WORKS_PHOTOS_MAX) fieldErrors.photos = `Attach up to ${WORKS_PHOTOS_MAX} photos.`;
  if (new Set(ids).size !== ids.length) fieldErrors.photos = "The same photo is attached twice.";
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };
  const isEmergency = raw.isEmergency === true || raw.isEmergency === "on" || raw.isEmergency === "yes";
  return { ok: true, value: { title, trade, location, description, isEmergency, photoUploadIds: ids } };
}

/**
 * The next request number for the building: WR-0001 and up. Read afresh on
 * each attempt; the (scheme, number) unique index decides between two
 * requests raised at the same moment, and the loser tries the next number.
 */
async function nextRequestNumber(schemeId: string): Promise<string> {
  const rows = await db.orm.public.WorksRequest.where((r) => r.schemeId.eq(schemeId)).limit(100000).all();
  const max = rows.reduce((m, r) => Math.max(m, Number(String(r.requestNumber).match(/(\d+)$/)?.[1] ?? 0)), 0);
  return `WR-${String(max + 1).padStart(4, "0")}`;
}

function isUniqueViolation(err: unknown): boolean {
  const text = err instanceof Error ? `${err.message} ${JSON.stringify((err as { cause?: unknown }).cause ?? "")}` : String(err);
  return /23505|unique|duplicate key/i.test(text);
}

export class WorksRequestError extends Error {
  constructor(message: string, readonly fieldErrors?: Record<string, string>) {
    super(message);
  }
}

async function verifyPhotos(schemeId: string, profileId: string, ids: string[]): Promise<VerifiedUpload[]> {
  const out: VerifiedUpload[] = [];
  for (const id of ids) out.push(await verifyUpload({ uploadId: id, schemeId, purpose: "works_photo", profileId }));
  return out;
}

/**
 * Attach checked photos to a request that is already saved. A photo that
 * cannot be attached (used twice at the same moment, say) does not undo the
 * request: the owner is told, so they do not raise it again.
 */
async function attachPhotos(schemeId: string, requestId: string, profileId: string, photos: VerifiedUpload[]): Promise<string | null> {
  let failed = 0;
  for (const p of photos) {
    try {
      await attachPhoto(schemeId, requestId, profileId, p);
    } catch (err) {
      failed++;
      logError("[works] photo not attached:", err);
    }
  }
  return failed ? `${failed} photo${failed === 1 ? " was" : "s were"} not attached. Open the request to see it, and tell the committee if the photo matters.` : null;
}

async function attachPhoto(schemeId: string, requestId: string, profileId: string, p: VerifiedUpload) {
  {
    await consumeUpload(
      p.uploadId,
      () =>
        db.orm.public.WorksDocument.create({
          schemeId,
          requestId,
          documentType: "PHOTO",
          title: vc<300>("Photo"),
          fileName: vc<500>(p.fileName.slice(0, 500)),
          fileUrl: p.path,
          fileSize: p.size,
          mimeType: vc<100>(p.mimeType),
          uploadedById: profileId,
          accessLevel: "RESTRICTED",
        }),
      (d) => `WorksDocument:${d.id}`,
    );
  }
}

/** Raise a request and send it to the committee. Photos are checked before anything is saved. */
export async function submitRequest(schemeId: string, profileId: string, input: RequestInput) {
  const photos = await verifyPhotos(schemeId, profileId, input.photoUploadIds);
  const now = new Date().toISOString();
  let request: { id: string; requestNumber: string } | null = null;
  for (let attempt = 0; attempt < 10 && !request; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 10 + Math.floor(Math.random() * 40)));
    const requestNumber = await nextRequestNumber(schemeId);
    try {
      request = await db.transaction(async (tx) => {
        const r = await tx.orm.public.WorksRequest.create({
          schemeId,
          requestNumber: vc<30>(requestNumber),
          raisedById: profileId,
          trade: vc<60>(input.trade),
          title: vc<300>(input.title),
          description: input.description,
          location: input.location ? vc<500>(input.location) : null,
          priority: input.isEmergency ? "CRITICAL" : "MEDIUM",
          isEmergency: input.isEmergency,
          isUrgent: input.isEmergency,
          status: "SUBMITTED",
          submittedAt: ts(now),
          currentVersion: 1,
        });
        await tx.orm.public.WorksRequestVersion.create({
          requestId: r.id,
          versionNumber: 1,
          title: vc<300>(input.title),
          description: input.description,
          location: input.location ? vc<500>(input.location) : null,
          priority: input.isEmergency ? "CRITICAL" : "MEDIUM",
          changeReason: "Raised",
          createdById: profileId,
        });
        return { id: r.id, requestNumber };
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  if (!request) throw new WorksRequestError("The request could not be numbered. Please try again.");
  const photoProblem = await attachPhotos(schemeId, request.id, profileId, photos);
  return { ...request, photoProblem };
}

/** Change a returned request and send it back to the committee. Only whoever raised it. */
export async function resubmitRequest(schemeId: string, requestId: string, profileId: string, input: RequestInput) {
  const existing = await db.orm.public.WorksRequest.where((r) => and(r.id.eq(requestId), r.schemeId.eq(schemeId))).first();
  if (!existing || existing.raisedById !== profileId) throw new WorksRequestError("Request not found.");
  if (existing.status !== "DRAFT" || !existing.returnReason) throw new WorksRequestError("Only a request the committee returned can be changed and sent again.");
  const existingPhotos = await db.orm.public.WorksDocument.where((d) => and(d.requestId.eq(requestId), d.documentType.eq("PHOTO"), d.deletedAt.isNull())).limit(50).all();
  if (existingPhotos.length + input.photoUploadIds.length > WORKS_PHOTOS_MAX) {
    throw new WorksRequestError(`Attach up to ${WORKS_PHOTOS_MAX} photos in all.`, { photos: `Attach up to ${WORKS_PHOTOS_MAX} photos in all.` });
  }
  const photos = await verifyPhotos(schemeId, profileId, input.photoUploadIds);
  const version = Number(existing.currentVersion) + 1;
  const moved = await db.transaction(async (tx) => {
    // Claimed with the whole filter, so a second send at once does nothing.
    const n = await tx.orm.public.WorksRequest
      .where((r) => and(r.id.eq(requestId), r.schemeId.eq(schemeId), r.status.eq("DRAFT"), r.currentVersion.eq(Number(existing.currentVersion))))
      .updateAndCount({
        trade: vc<60>(input.trade),
        title: vc<300>(input.title),
        description: input.description,
        location: input.location ? vc<500>(input.location) : null,
        priority: input.isEmergency ? "CRITICAL" : "MEDIUM",
        isEmergency: input.isEmergency,
        isUrgent: input.isEmergency,
        status: "SUBMITTED",
        submittedAt: ts(new Date().toISOString()),
        currentVersion: version,
      });
    if (n !== 1) return false;
    await tx.orm.public.WorksRequestVersion.create({
      requestId,
      versionNumber: version,
      title: vc<300>(input.title),
      description: input.description,
      location: input.location ? vc<500>(input.location) : null,
      priority: input.isEmergency ? "CRITICAL" : "MEDIUM",
      changeReason: "Changed after the committee returned it",
      createdById: profileId,
    });
    return true;
  });
  if (!moved) throw new WorksRequestError("This request has changed. Reload the page.");
  const photoProblem = await attachPhotos(schemeId, requestId, profileId, photos);
  return { id: requestId, requestNumber: String(existing.requestNumber), photoProblem };
}

// ─── Reading ───────────────────────────────────────────────────────────────

/** The building's requests, newest first, without deleted ones. */
export async function listRequests(schemeId: string, limit = 200) {
  return db.orm.public.WorksRequest
    .where((r) => and(r.schemeId.eq(schemeId), r.deletedAt.isNull()))
    .orderBy((r) => r.createdAt.desc())
    .limit(limit)
    .all();
}

export async function getRequest(schemeId: string, requestId: string) {
  return db.orm.public.WorksRequest.where((r) => and(r.id.eq(requestId), r.schemeId.eq(schemeId), r.deletedAt.isNull())).first();
}

/** A request's photos with short-lived signed links (only paths inside the building's folder). */
export async function requestPhotos(schemeId: string, requestId: string): Promise<Array<{ id: string; url: string; fileName: string }>> {
  const docs = await db.orm.public.WorksDocument.where((d) => and(d.requestId.eq(requestId), d.schemeId.eq(schemeId), d.documentType.eq("PHOTO"), d.deletedAt.isNull())).limit(50).all();
  const usable = docs
    .map((d) => ({ d, path: toStoragePath(String(d.fileUrl)) }))
    .filter((x): x is { d: (typeof docs)[number]; path: string } => !!x.path && !schemeStoragePathProblem(schemeId, x.path));
  const links = await signDownloads(usable.map((x) => x.path), 15 * 60);
  return usable.flatMap((x, i) => (links[i] ? [{ id: x.d.id, url: links[i]!, fileName: String(x.d.fileName) }] : []));
}
