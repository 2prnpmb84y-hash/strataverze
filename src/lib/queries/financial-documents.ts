import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { Numeric, TimestampString, Varchar } from "@prisma/orm-postgres/target/codec-types";

/** Cast a number or string to the Prisma 8 Numeric branded type. */
function toNumeric(value: number | string): Numeric<12, 2> {
  return String(value) as unknown as Numeric<12, 2>;
}

/** Cast an ISO string to the Prisma 8 TimestampString branded type. */
function toTimestamp(value: string): TimestampString<3> {
  return value as unknown as TimestampString<3>;
}

/** Cast a plain string to the Prisma 8 Varchar branded type. */
function toVarchar<N extends number>(value: string): Varchar<N> {
  return value as unknown as Varchar<N>;
}

/**
 * Fetch financial documents for a scheme with optional filters.
 */
export async function getFinancialDocumentsForScheme(
  schemeId: string,
  filters?: {
    documentType?: string;
    documentStatus?: string;
    verificationStatus?: string;
    lotId?: string;
    supplierId?: string;
  },
  limit = 200,
) {
  let query = db.orm.public.FinancialDocument.where((d) =>
    d.schemeId.eq(schemeId),
  );

  if (filters?.documentType) {
    query = query.where((d) => d.documentType.eq(filters.documentType!));
  }
  if (filters?.documentStatus) {
    query = query.where((d) => d.documentStatus.eq(filters.documentStatus!));
  }
  if (filters?.verificationStatus) {
    query = query.where((d) =>
      d.verificationStatus.eq(filters.verificationStatus!),
    );
  }
  if (filters?.lotId) {
    query = query.where((d) => d.lotId.eq(filters.lotId!));
  }
  if (filters?.supplierId) {
    query = query.where((d) => d.supplierId.eq(filters.supplierId!));
  }

  return query
    .include("lot")
    .include("supplier")
    .orderBy((d) => d.uploadedAt.desc())
    .limit(limit)
    .all();
}

/**
 * Fetch a single financial document by ID with all relations.
 */
export async function getFinancialDocumentById(documentId: string) {
  try {
    return db.orm.public.FinancialDocument
      .where((d) => d.id.eq(documentId))
      .include("lot")
      .include("supplier")
      .include("supplierInvoice")
      .include("levyNotice")
      .include("bankTransaction")
      .first();
  } catch {
    // Table may not exist yet
    return null;
  }
}

/**
 * Fetch all documents linked to a levy notice.
 */
export async function getDocumentsForLevyNotice(levyNoticeId: string, limit = 100) {
  try {
    return db.orm.public.FinancialDocument
      .where((d) => d.levyNoticeId.eq(levyNoticeId))
      .orderBy((d) => d.uploadedAt.desc())
      .limit(limit)
      .all();
  } catch {
    // Table may not exist yet
    return [];
  }
}

/**
 * Fetch all documents linked to a supplier invoice.
 */
export async function getDocumentsForSupplierInvoice(supplierInvoiceId: string, limit = 100) {
  try {
    return db.orm.public.FinancialDocument
      .where((d) => d.supplierInvoiceId.eq(supplierInvoiceId))
      .orderBy((d) => d.uploadedAt.desc())
      .limit(limit)
      .all();
  } catch {
    // Table may not exist yet
    return [];
  }
}

/**
 * Fetch all documents linked to a bank transaction.
 */
export async function getDocumentsForBankTransaction(bankTransactionId: string, limit = 100) {
  try {
    return db.orm.public.FinancialDocument
      .where((d) => d.bankTransactionId.eq(bankTransactionId))
      .orderBy((d) => d.uploadedAt.desc())
      .limit(limit)
      .all();
  } catch {
    // Table may not exist yet
    return [];
  }
}

/**
 * Fetch all documents for a specific lot (owner uploads).
 */
export async function getDocumentsForLot(lotId: string, limit = 200) {
  try {
    return db.orm.public.FinancialDocument
      .where((d) => d.lotId.eq(lotId))
      .include("supplier")
      .include("levyNotice")
      .orderBy((d) => d.uploadedAt.desc())
      .limit(limit)
      .all();
  } catch {
    // Table may not exist yet
    return [];
  }
}

/**
 * Create a new financial document record.
 */
export async function createFinancialDocument(data: {
  schemeId: string;
  documentType: string;
  uploadedBy: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  lotId?: string;
  supplierId?: string;
  supplierInvoiceId?: string;
  levyNoticeId?: string;
  bankTransactionId?: string;
  amount?: number;
  documentDate?: string;
  payerName?: string;
  payeeReference?: string;
}) {
  return db.orm.public.FinancialDocument.create({
    schemeId: data.schemeId,
    documentType: data.documentType,
    uploadedBy: data.uploadedBy,
    fileName: toVarchar<500>(data.fileName),
    fileUrl: data.fileUrl,
    fileSize: data.fileSize,
    mimeType: toVarchar<100>(data.mimeType),
    lotId: data.lotId ?? null,
    supplierId: data.supplierId ?? null,
    supplierInvoiceId: data.supplierInvoiceId ?? null,
    levyNoticeId: data.levyNoticeId ?? null,
    bankTransactionId: data.bankTransactionId ?? null,
    amount: data.amount !== undefined ? toNumeric(data.amount) : null,
    documentDate: data.documentDate
      ? toTimestamp(data.documentDate)
      : null,
    payerName: data.payerName ? toVarchar<200>(data.payerName) : null,
    payeeReference: data.payeeReference ? toVarchar<200>(data.payeeReference) : null,
    documentStatus: "UPLOADED",
    verificationStatus: "PENDING",
  });
}

/**
 * Review a financial document (update status, reviewer, notes).
 */
export async function reviewDocument(
  documentId: string,
  data: {
    documentStatus: string;
    reviewedBy: string;
    reviewNotes?: string;
  },
) {
  return db.orm.public.FinancialDocument
    .where({ id: documentId })
    .update({
      documentStatus: data.documentStatus,
      reviewedBy: data.reviewedBy,
      reviewedAt: toTimestamp(new Date().toISOString()),
      reviewNotes: data.reviewNotes ?? null,
    });
}

/**
 * Update only the verification status of a document.
 */
export async function updateVerificationStatus(
  documentId: string,
  status: string,
) {
  return db.orm.public.FinancialDocument
    .where({ id: documentId })
    .update({ verificationStatus: status });
}

/**
 * Fetch unreviewed documents for a scheme (oldest first for review queue).
 */
export async function getUnreviewedDocuments(schemeId: string, limit = 200) {
  try {
    return db.orm.public.FinancialDocument
      .where((d) =>
        and(
          d.schemeId.eq(schemeId),
          d.documentStatus.eq("UPLOADED"),
          d.verificationStatus.eq("PENDING"),
        ),
      )
      .include("lot")
      .include("supplier")
      .orderBy((d) => d.uploadedAt.asc())
      .limit(limit)
      .all();
  } catch {
    // Table may not exist yet
    return [];
  }
}

/**
 * Fetch documents uploaded by a specific user, optionally filtered by scheme.
 */
export async function getDocumentsByUploader(
  uploadedBy: string,
  schemeId?: string,
  limit = 200,
) {
  if (schemeId) {
    return db.orm.public.FinancialDocument
      .where((d) =>
        and(d.uploadedBy.eq(uploadedBy), d.schemeId.eq(schemeId)),
      )
      .orderBy((d) => d.uploadedAt.desc())
      .limit(limit)
      .all();
  }

  return db.orm.public.FinancialDocument
    .where((d) => d.uploadedBy.eq(uploadedBy))
    .orderBy((d) => d.uploadedAt.desc())
    .limit(limit)
    .all();
}
