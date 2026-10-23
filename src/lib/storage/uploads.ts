import { randomUUID } from "node:crypto";
import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";
import { db } from "@/prisma/db";
import { requireSchemeAccess } from "@/lib/auth/require-access";
import { AuthorisationError, requireSchemeMembership } from "@/lib/auth/require-membership";
import { rateLimit } from "@/lib/auth/rate-limit";
import { recordSecurityEvent } from "@/lib/audit/security-audit";
import { checkFileBytes, checkFileName, type FileKind } from "@/lib/upload/file-types";
import { readObjectHead, removeRejectedUpload, signUpload, storedObjectInfo } from "./server-storage";

/**
 * Uploads (security stage S3, findings SEC-006 and SEC-022).
 *
 * 1. prepareUpload: the server authorises the person for this kind of
 *    upload on this building, checks the file's name and declared size,
 *    chooses the storage path itself, records the upload, and returns a
 *    one-time signed upload link. The browser uploads straight to storage
 *    with it (large files never pass through the app).
 * 2. verifyUpload: before the file is used, the server checks what actually
 *    arrived: its stored size, and its first bytes, which must match the
 *    file's type (a renamed file is refused). A refused file is removed.
 * 3. markUploadUsed: once the document record exists, the upload cannot be
 *    used again.
 *
 * Nothing the browser sends is trusted as a path, size or type.
 */

const MB = 1024 * 1024;
const DOCUMENT_KINDS: readonly FileKind[] = ["pdf", "png", "jpeg", "gif", "webp", "ooxml", "ole", "text"];
const RECEIPT_KINDS: readonly FileKind[] = ["pdf", "png", "jpeg", "heic"];
const UPLOAD_LIFETIME_MS = 60 * 60 * 1000;

type Authorise = (schemeId: string) => Promise<{ profile: { id: string } }>;

export const UPLOAD_PURPOSES = {
  /** The building's document library, by its Adviser. */
  library: {
    folder: "library",
    kinds: DOCUMENT_KINDS,
    maxBytes: 30 * MB,
    authorise: ((schemeId) => requireSchemeAccess(schemeId, "documents.manage")) as Authorise,
  },
  /** The document library, by the committee. */
  committee_library: {
    folder: "library",
    kinds: DOCUMENT_KINDS,
    maxBytes: 10 * MB,
    authorise: ((schemeId) => requireSchemeAccess(schemeId, "documents.publish")) as Authorise,
  },
  insurance: {
    folder: "insurance",
    kinds: DOCUMENT_KINDS,
    maxBytes: 30 * MB,
    authorise: ((schemeId) => requireSchemeAccess(schemeId, "insurance.manage")) as Authorise,
  },
  claim_evidence: {
    folder: "insurance/claims",
    kinds: DOCUMENT_KINDS,
    maxBytes: 30 * MB,
    authorise: ((schemeId) => requireSchemeAccess(schemeId, "insurance.manage")) as Authorise,
  },
  /** Financial documents filed by the Adviser (receipts, statements, invoices). */
  finance_document: {
    folder: "finance",
    kinds: RECEIPT_KINDS,
    maxBytes: 10 * MB,
    authorise: ((schemeId) => requireSchemeMembership(schemeId, ["ADVISER"])) as Authorise,
  },
  /** An owner's proof of payment. Kept directly in the payments folder. */
  payment_confirmation: {
    folder: "payments",
    kinds: RECEIPT_KINDS,
    maxBytes: 10 * MB,
    authorise: ((schemeId) => requireSchemeMembership(schemeId, ["OWNER"])) as Authorise,
  },
} as const;

export type UploadPurpose = keyof typeof UPLOAD_PURPOSES;

export function isUploadPurpose(value: unknown): value is UploadPurpose {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(UPLOAD_PURPOSES, value);
}

function ts(ms: number): TimestampString<3> {
  return new Date(ms).toISOString() as unknown as TimestampString<3>;
}

export class UploadError extends Error {}

/** Step 1. Authorise, check the name and size, choose the path, sign the upload. */
export async function prepareUpload(input: {
  schemeId: string;
  purpose: UploadPurpose;
  fileName: string;
  size: number;
}): Promise<{ uploadId: string; path: string; token: string; contentType: string }> {
  const purpose = UPLOAD_PURPOSES[input.purpose];
  const { profile } = await purpose.authorise(input.schemeId);

  const fileName = String(input.fileName ?? "").trim().slice(0, 255);
  if (!fileName) throw new UploadError("Choose a file to upload.");
  const check = checkFileName(fileName, purpose.kinds);
  if (!check.ok) throw new UploadError(check.error);
  if (!Number.isInteger(input.size) || input.size <= 0) throw new UploadError("The file is empty.");
  if (input.size > purpose.maxBytes) {
    throw new UploadError(`The file must be smaller than ${Math.round(purpose.maxBytes / MB)} MB.`);
  }
  if (!rateLimit(`upload:${profile.id}`, 60, 10 * 60 * 1000).success) {
    throw new UploadError("Too many uploads in a short time. Please wait a few minutes.");
  }

  // The server chooses the path: the building's folder, the purpose's
  // sub-folder, and a random name. The original name is kept on the record.
  const path = `schemes/${input.schemeId}/${purpose.folder}/${randomUUID()}.${check.extension}`;
  const now = Date.now();
  const uploadId = randomUUID();
  await db.orm.public.StorageUpload.create({
    id: uploadId,
    schemeId: input.schemeId,
    purpose: input.purpose,
    path,
    profileId: profile.id,
    fileName,
    declaredSize: input.size,
    expiresAt: ts(now + UPLOAD_LIFETIME_MS),
  });
  const { token } = await signUpload(path);
  return { uploadId, path, token, contentType: check.mime };
}

export type VerifiedUpload = { uploadId: string; path: string; fileName: string; size: number; mimeType: string };

/**
 * Step 2. Check what arrived. The upload must be this person's, for this
 * building and purpose, unused and recent. Safe to call more than once
 * (for example after a duplicate warning): the result is remembered.
 */
export async function verifyUpload(input: {
  uploadId: string;
  schemeId: string;
  purpose: UploadPurpose;
  profileId: string;
}): Promise<VerifiedUpload> {
  const purpose = UPLOAD_PURPOSES[input.purpose];
  const notFound = new UploadError("The upload could not be found. Please choose the file again.");
  if (typeof input.uploadId !== "string" || !/^[0-9a-f-]{36}$/i.test(input.uploadId)) throw notFound;
  const row = await db.orm.public.StorageUpload
    .where((u) =>
      and(
        u.id.eq(input.uploadId),
        u.schemeId.eq(input.schemeId),
        u.purpose.eq(input.purpose),
        u.profileId.eq(input.profileId),
      ),
    )
    .first();
  if (!row || row.usedAt) throw notFound;
  if (Date.parse(String(row.expiresAt)) < Date.now()) throw new UploadError("The upload has expired. Please choose the file again.");

  if (row.verifiedAt && row.verifiedMime && row.verifiedSize != null) {
    return { uploadId: row.id, path: row.path, fileName: row.fileName, size: Number(row.verifiedSize), mimeType: row.verifiedMime };
  }

  const refuse = async (message: string, reason: string) => {
    await removeRejectedUpload(row.path);
    await db.orm.public.StorageUpload.where((u) => u.id.eq(row.id)).update({ usedAt: ts(Date.now()), usedFor: "refused" });
    await recordSecurityEvent({
      action: "document.upload_refused",
      outcome: "denied",
      actorProfileId: input.profileId,
      schemeId: input.schemeId,
      resourceType: "StorageUpload",
      resourceId: row.id,
      reason,
      metadata: { purpose: input.purpose },
    });
    throw new UploadError(message);
  };

  const info = await storedObjectInfo(row.path);
  if (!info) throw new UploadError("The file has not finished uploading. Please try again.");
  if (info.size <= 0) return refuse("The file is empty.", "empty file");
  if (info.size > purpose.maxBytes) {
    return refuse(`The file must be smaller than ${Math.round(purpose.maxBytes / MB)} MB.`, "file too large");
  }
  const head = await readObjectHead(row.path);
  if (!head) throw new UploadError("The file could not be checked. Please try again.");
  const check = checkFileBytes(row.fileName, head, purpose.kinds);
  if (!check.ok) return refuse(check.error, "contents do not match the file type");

  await db.orm.public.StorageUpload
    .where((u) => u.id.eq(row.id))
    .update({ verifiedAt: ts(Date.now()), verifiedSize: info.size, verifiedMime: check.mime });
  return { uploadId: row.id, path: row.path, fileName: row.fileName, size: info.size, mimeType: check.mime };
}

/** Step 3. The upload now belongs to a record and cannot be used again. */
export async function markUploadUsed(uploadId: string, usedFor: string): Promise<void> {
  await db.orm.public.StorageUpload
    .where((u) => and(u.id.eq(uploadId), u.usedAt.eq(null)))
    .update({ usedAt: ts(Date.now()), usedFor: usedFor.slice(0, 100) });
}

/** Turn upload failures into a message for the form. */
export function uploadErrorMessage(err: unknown): string | null {
  if (err instanceof UploadError || err instanceof AuthorisationError) return err.message;
  return null;
}
