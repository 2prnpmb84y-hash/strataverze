import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";

/** Cast an ISO string to the Prisma 8 TimestampString branded type. */
function toTimestamp(value: string): TimestampString<3> {
  return value as unknown as TimestampString<3>;
}

/**
 * Fetch all documents for a scheme, newest first.
 */
export async function getDocumentsForScheme(schemeId: string, limit = 200) {
  return db.orm.public.Document
    .where((d) => and(d.schemeId.eq(schemeId), d.deletedAt.eq(null)))
    .orderBy((d) => d.createdAt.desc())
    .limit(limit)
    .all();
}

/**
 * Fetch a single document by ID.
 */
export async function getDocumentById(documentId: string) {
  return db.orm.public.Document
    .where((d) => and(d.id.eq(documentId), d.deletedAt.eq(null)))
    .first();
}

/**
 * Create a document record.
 */
export async function createDocument(data: {
  schemeId: string;
  title: string;
  description?: string;
  category: string;
  documentType?: string;
  fileUrl: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  uploadedBy: string;
  documentDate?: string;
  strataPlan?: string;
  schedule?: string;
  lotNumber?: string;
  supplier?: string;
  comments?: string;
  /** Who may see it (S3). Defaults to all members. */
  visibility?: string;
}) {
  return db.orm.public.Document.create({
    schemeId: data.schemeId,
    title: data.title,
    description: data.description ?? null,
    category: data.category,
    documentType: data.documentType ?? null,
    fileUrl: data.fileUrl,
    fileName: data.fileName,
    fileSize: data.fileSize ?? null,
    mimeType: data.mimeType ?? null,
    uploadedBy: data.uploadedBy,
    documentDate: data.documentDate ? toTimestamp(data.documentDate) : null,
    strataPlan: data.strataPlan ?? null,
    schedule: data.schedule ?? null,
    lotNumber: data.lotNumber ?? null,
    supplier: data.supplier ?? null,
    comments: data.comments ?? null,
    visibility: data.visibility ?? "ALL_MEMBERS",
  });
}

/**
 * Update a document's metadata.
 */
export async function updateDocument(
  schemeId: string,
  documentId: string,
  data: Partial<{
    title: string;
    description: string | null;
    category: string;
    documentType: string | null;
    documentDate: string | null;
    strataPlan: string | null;
    schedule: string | null;
    lotNumber: string | null;
    supplier: string | null;
    comments: string | null;
    visibility: string;
  }>,
) {
  const update: Record<string, unknown> = {};
  if (data.title !== undefined) update.title = data.title;
  if (data.description !== undefined) update.description = data.description;
  if (data.category !== undefined) update.category = data.category;
  if (data.documentType !== undefined) update.documentType = data.documentType;
  if (data.documentDate !== undefined)
    update.documentDate = data.documentDate ? toTimestamp(data.documentDate) : null;
  if (data.strataPlan !== undefined) update.strataPlan = data.strataPlan;
  if (data.schedule !== undefined) update.schedule = data.schedule;
  if (data.lotNumber !== undefined) update.lotNumber = data.lotNumber;
  if (data.supplier !== undefined) update.supplier = data.supplier;
  if (data.comments !== undefined) update.comments = data.comments;
  if (data.visibility !== undefined) update.visibility = data.visibility;

  return db.orm.public.Document.where((r) => and(r.id.eq(documentId), r.schemeId.eq(schemeId))).update(update);
}

/**
 * Soft-delete a document.
 */
export async function deleteDocument(schemeId: string, documentId: string) {
  return db.orm.public.Document
    .where((r) => and(r.id.eq(documentId), r.schemeId.eq(schemeId)))
    .update({ deletedAt: toTimestamp(new Date().toISOString()) });
}

/**
 * Get documents for multiple schemes (owner view).
 */
export async function getDocumentsForSchemes(schemeIds: string[], limit = 200) {
  if (schemeIds.length === 0) return [];

  return db.orm.public.Document
    .where((d) => and(d.schemeId.in(schemeIds), d.deletedAt.eq(null)))
    .orderBy((d) => d.createdAt.desc())
    .limit(limit)
    .all();
}
