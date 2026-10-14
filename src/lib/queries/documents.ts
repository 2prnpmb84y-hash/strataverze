import { db } from "@/prisma/db";

/**
 * Fetch all documents for a scheme, newest first.
 */
export async function getDocumentsForScheme(schemeId: string) {
  return db.orm.public.Document
    .where((d) => d.schemeId.eq(schemeId))
    .orderBy((d) => d.createdAt.desc())
    .all();
}

/**
 * Fetch a single document by ID.
 */
export async function getDocumentById(documentId: string) {
  return db.orm.public.Document.first({ id: documentId });
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
 * Delete a document.
 */
export async function deleteDocument(documentId: string) {
  return db.orm.public.Document.where({ id: documentId }).delete();
}

/**
 * Get documents for multiple schemes (owner view).
 */
export async function getDocumentsForSchemes(schemeIds: string[]) {
  if (schemeIds.length === 0) return [];

  return db.orm.public.Document
    .where((d) => d.schemeId.in(schemeIds))
    .orderBy((d) => d.createdAt.desc())
    .all();
}
