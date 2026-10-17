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
export async function getDocumentsForScheme(schemeId: string) {
  return db.orm.public.Document
    .where((d) => and(d.schemeId.eq(schemeId), d.deletedAt.eq(null)))
    .orderBy((d) => d.createdAt.desc())
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
  fileUrl: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  uploadedBy: string;
}) {
  return db.orm.public.Document.create({
    schemeId: data.schemeId,
    title: data.title,
    description: data.description ?? null,
    category: data.category,
    fileUrl: data.fileUrl,
    fileName: data.fileName,
    fileSize: data.fileSize ?? null,
    mimeType: data.mimeType ?? null,
    uploadedBy: data.uploadedBy,
  });
}

/**
 * Update a document's metadata.
 */
export async function updateDocument(
  documentId: string,
  data: Partial<{
    title: string;
    description: string | null;
    category: string;
  }>,
) {
  return db.orm.public.Document.where({ id: documentId }).update(data);
}

/**
 * Soft-delete a document.
 */
export async function deleteDocument(documentId: string) {
  return db.orm.public.Document
    .where({ id: documentId })
    .update({ deletedAt: toTimestamp(new Date().toISOString()) });
}

/**
 * Get documents for multiple schemes (owner view).
 */
export async function getDocumentsForSchemes(schemeIds: string[]) {
  if (schemeIds.length === 0) return [];

  return db.orm.public.Document
    .where((d) => and(d.schemeId.in(schemeIds), d.deletedAt.eq(null)))
    .orderBy((d) => d.createdAt.desc())
    .all();
}
