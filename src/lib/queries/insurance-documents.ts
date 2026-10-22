import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";

function toTimestamp(value: string): TimestampString<3> {
  return value as unknown as TimestampString<3>;
}

export interface CreateInsuranceDocumentData {
  schemeId: string;
  policyId?: string | null;
  claimId?: string | null;
  renewalId?: string | null;
  category: string;
  title: string;
  fileUrl: string;
  fileName: string;
  fileSize?: number | null;
  mimeType?: string | null;
  uploadedBy: string;
  version?: number;
  supersedesId?: string | null;
  accessLevel?: string;
  documentDate?: string | null;
  notes?: string | null;
}

export async function createInsuranceDocument(data: CreateInsuranceDocumentData) {
  return db.orm.public.InsuranceDocument.create({
    schemeId: data.schemeId,
    policyId: data.policyId ?? null,
    claimId: data.claimId ?? null,
    renewalId: data.renewalId ?? null,
    category: data.category,
    title: data.title,
    fileUrl: data.fileUrl,
    fileName: data.fileName,
    fileSize: data.fileSize ?? null,
    mimeType: data.mimeType ?? null,
    version: data.version ?? 1,
    supersedesId: data.supersedesId ?? null,
    isCurrent: true,
    accessLevel: data.accessLevel ?? "RESTRICTED",
    uploadedBy: data.uploadedBy,
    documentDate: data.documentDate ? toTimestamp(data.documentDate) : null,
    notes: data.notes ?? null,
  } as never);
}

export async function getInsuranceDocumentById(documentId: string) {
  return db.orm.public.InsuranceDocument
    .where((d) => and(d.id.eq(documentId), d.deletedAt.eq(null)))
    .first();
}

/** Mark a document as no longer the current version. */
export async function markDocumentNotCurrent(documentId: string) {
  return db.orm.public.InsuranceDocument
    .where({ id: documentId })
    .update({ isCurrent: false });
}

/** Mark a document as the current version (used when a newer one is deleted). */
export async function markDocumentCurrent(documentId: string) {
  return db.orm.public.InsuranceDocument
    .where({ id: documentId })
    .update({ isCurrent: true });
}

/** All non-deleted documents for a policy, oldest first. */
export async function getPolicyDocuments(policyId: string) {
  return db.orm.public.InsuranceDocument
    .where((d) => and(d.policyId.eq(policyId), d.deletedAt.eq(null)))
    .orderBy((d) => d.createdAt.asc())
    .all();
}

/** Soft-delete a document (all versions in a chain are deleted by caller). */
export async function softDeleteInsuranceDocument(documentId: string) {
  return db.orm.public.InsuranceDocument
    .where({ id: documentId })
    .update({ deletedAt: toTimestamp(new Date().toISOString()), isCurrent: false });
}

export interface DocumentVersionView {
  id: string;
  version: number;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  mimeType: string | null;
  uploadedAt: string;
  documentDate: string | null;
}

export interface PolicyDocumentView {
  id: string;
  category: string;
  title: string;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  mimeType: string | null;
  version: number;
  uploadedAt: string;
  notes: string | null;
  versions: DocumentVersionView[];
}

/**
 * Current documents for a policy, each with its full version history. A version
 * chain is linked by supersedesId; the current head carries isCurrent = true.
 */
export async function getPolicyDocumentsWithHistory(
  policyId: string,
): Promise<PolicyDocumentView[]> {
  const rows = await getPolicyDocuments(policyId);
  const byId = new Map(rows.map((r) => [r.id, r]));

  const toVersion = (r: (typeof rows)[number]): DocumentVersionView => ({
    id: r.id,
    version: r.version,
    fileName: r.fileName,
    fileUrl: r.fileUrl,
    fileSize: r.fileSize ?? null,
    mimeType: r.mimeType ?? null,
    uploadedAt: String(r.createdAt),
    documentDate: r.documentDate ? String(r.documentDate) : null,
  });

  return rows
    .filter((r) => r.isCurrent)
    .map((head) => {
      // Walk back through supersededId to collect older versions.
      const chain: DocumentVersionView[] = [toVersion(head)];
      let cursor = head.supersedesId ? byId.get(head.supersedesId) : undefined;
      let guard = 0;
      while (cursor && guard < 50) {
        chain.push(toVersion(cursor));
        cursor = cursor.supersedesId ? byId.get(cursor.supersedesId) : undefined;
        guard++;
      }
      return {
        id: head.id,
        category: head.category,
        title: head.title,
        fileName: head.fileName,
        fileUrl: head.fileUrl,
        fileSize: head.fileSize ?? null,
        mimeType: head.mimeType ?? null,
        version: head.version,
        uploadedAt: String(head.createdAt),
        notes: head.notes ?? null,
        versions: chain,
      };
    })
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}
