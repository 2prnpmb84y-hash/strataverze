import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";
import {
  buildDocumentViews,
  type PolicyDocumentView,
} from "@/lib/insurance/documents";

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

export type {
  DocumentVersionView,
  PolicyDocumentView,
} from "@/lib/insurance/documents";

/**
 * Current documents for a policy, each with its full version history. A version
 * chain is linked by supersedesId; the current head carries isCurrent = true.
 */
export async function getPolicyDocumentsWithHistory(
  policyId: string,
): Promise<PolicyDocumentView[]> {
  const rows = await getPolicyDocuments(policyId);
  return buildDocumentViews(
    rows.map((r) => ({
      id: r.id,
      category: r.category,
      title: r.title,
      fileName: r.fileName,
      fileUrl: r.fileUrl,
      fileSize: r.fileSize ?? null,
      mimeType: r.mimeType ?? null,
      version: r.version,
      isCurrent: r.isCurrent,
      supersedesId: r.supersedesId ?? null,
      notes: r.notes ?? null,
      createdAt: String(r.createdAt),
      documentDate: r.documentDate ? String(r.documentDate) : null,
    })),
  );
}
