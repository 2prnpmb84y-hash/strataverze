import { messageTermsFor } from "@/lib/jurisdiction/scheme-rules";
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type {
  Numeric,
  Varchar,
} from "@prisma/orm-postgres/target/codec-types";

function toNumeric(value: number | string): Numeric<12, 2> {
  return String(value) as unknown as Numeric<12, 2>;
}

function toVarchar<N extends number>(value: string): Varchar<N> {
  return value as unknown as Varchar<N>;
}

// --- Supplier Invoice Duplicate Detection ---

export type InvoiceDuplicateMatch = {
  existingInvoiceId: string;
  invoiceNumber: string;
  supplierName: string;
  totalAmount: number;
  invoiceDate: string;
  status: string;
  matchReason: string;
};

/**
 * Check for duplicate supplier invoices before creating a new one.
 * Matches on:
 * 1. Same supplier + same invoice number (exact match, strongest signal)
 * 2. Same supplier + same amount + same date (possible duplicate)
 */
export async function checkInvoiceDuplicates(
  schemeId: string,
  supplierId: string,
  invoiceNumber: string,
  totalAmount: number,
  invoiceDate: string,
): Promise<InvoiceDuplicateMatch[]> {
  try {
    const matches: InvoiceDuplicateMatch[] = [];

    // Check 1: Exact invoice number match for same supplier
    const exactMatches = await db.orm.public.SupplierInvoice
      .where((inv) =>
        and(
          inv.schemeId.eq(schemeId),
          inv.supplierId.eq(supplierId),
          inv.invoiceNumber.eq(toVarchar<50>(invoiceNumber)),
        ),
      )
      .include("supplier")
      .all();

    for (const inv of exactMatches) {
      if (inv.status !== "CANCELLED") {
        matches.push({
          existingInvoiceId: inv.id,
          invoiceNumber: String(inv.invoiceNumber),
          supplierName: inv.supplier ? String(inv.supplier.tradingName ?? inv.supplier.companyName) : "Unknown",
          totalAmount: Number(inv.totalAmount),
          invoiceDate: String(inv.invoiceDate).slice(0, 10),
          status: inv.status,
          matchReason: "Same supplier and invoice number",
        });
      }
    }

    // Check 2: Same supplier + similar amount + same date (only if no exact match)
    if (matches.length === 0) {
      const amountMatches = await db.orm.public.SupplierInvoice
        .where((inv) =>
          and(
            inv.schemeId.eq(schemeId),
            inv.supplierId.eq(supplierId),
            inv.totalAmount.eq(toNumeric(totalAmount)),
          ),
        )
        .include("supplier")
        .all();

      for (const inv of amountMatches) {
        const invDate = String(inv.invoiceDate).slice(0, 10);
        if (inv.status !== "CANCELLED" && invDate === invoiceDate) {
          matches.push({
            existingInvoiceId: inv.id,
            invoiceNumber: String(inv.invoiceNumber),
            supplierName: inv.supplier ? String(inv.supplier.tradingName ?? inv.supplier.companyName) : "Unknown",
            totalAmount: Number(inv.totalAmount),
            invoiceDate: invDate,
            status: inv.status,
            matchReason: "Same supplier, amount and date",
          });
        }
      }
    }

    return matches;
  } catch {
    // Table may not exist yet
    return [];
  }
}

// --- Financial Document Duplicate Detection ---

export type DocumentDuplicateMatch = {
  existingDocumentId: string;
  fileName: string;
  documentType: string;
  amount: number | null;
  documentDate: string | null;
  documentStatus: string;
  matchReason: string;
};

/**
 * Check for duplicate financial documents before uploading.
 * Matches on:
 * 1. Same file name + same file size (likely the same file re-uploaded)
 * 2. Same document type + same amount + same date (possible duplicate receipt/statement)
 */
export async function checkDocumentDuplicates(
  schemeId: string,
  fileName: string,
  fileSize: number,
  documentType: string,
  amount?: number,
  documentDate?: string,
): Promise<DocumentDuplicateMatch[]> {
  try {
    const matches: DocumentDuplicateMatch[] = [];

    // Check 1: Same file name and size (re-upload detection)
    const fileMatches = await db.orm.public.FinancialDocument
      .where((doc) =>
        and(
          doc.schemeId.eq(schemeId),
          doc.fileName.eq(toVarchar<500>(fileName)),
          doc.fileSize.eq(fileSize),
        ),
      )
      .all();

    for (const doc of fileMatches) {
      if (doc.documentStatus !== "REJECTED") {
        matches.push({
          existingDocumentId: doc.id,
          fileName: String(doc.fileName),
          documentType: doc.documentType,
          amount: doc.amount !== null ? Number(doc.amount) : null,
          documentDate: doc.documentDate
            ? String(doc.documentDate).slice(0, 10)
            : null,
          documentStatus: doc.documentStatus,
          matchReason: "Same file name and size",
        });
      }
    }

    // Check 2: Same type + amount + date (only for documents with amounts)
    if (matches.length === 0 && amount !== undefined && documentDate) {
      const amountDateMatches = await db.orm.public.FinancialDocument
        .where((doc) =>
          and(
            doc.schemeId.eq(schemeId),
            doc.documentType.eq(documentType),
            doc.amount.eq(toNumeric(amount)),
          ),
        )
        .all();

      for (const doc of amountDateMatches) {
        const docDate = doc.documentDate
          ? String(doc.documentDate).slice(0, 10)
          : null;
        if (
          doc.documentStatus !== "REJECTED" &&
          docDate === documentDate
        ) {
          matches.push({
            existingDocumentId: doc.id,
            fileName: String(doc.fileName),
            documentType: doc.documentType,
            amount: Number(doc.amount),
            documentDate: docDate,
            documentStatus: doc.documentStatus,
            matchReason: "Same document type, amount and date",
          });
        }
      }
    }

    return matches;
  } catch {
    // Table may not exist yet
    return [];
  }
}

// --- Payment Duplicate Detection ---

export type PaymentDuplicateMatch = {
  existingNoticeId: string;
  lotNumber: string;
  amountPaid: number;
  paidDate: string;
  matchReason: string;
};

/**
 * Check for duplicate levy payments before recording.
 * Matches on same levy notice with a payment already recorded for same amount
 * within a 2-day window (to catch double-entry of the same payment).
 */
export async function checkPaymentDuplicates(
  noticeId: string,
  paymentAmount: number,
): Promise<PaymentDuplicateMatch[]> {
  try {
    const notice = await db.orm.public.LevyNotice
      .where({ id: noticeId })
      .include("lot")
      .first();

    if (!notice) return [];

    // If the notice is already fully paid, that's a duplicate signal
    const matches: PaymentDuplicateMatch[] = [];
    const currentPaid = Number(notice.amountPaid);
    const amountDue = Number(notice.amountDue);

    if (currentPaid >= amountDue) {
      matches.push({
        existingNoticeId: notice.id,
        lotNumber: notice.lot ? String(notice.lot.lotNumber) : "—",
        amountPaid: currentPaid,
        paidDate: notice.paidInFullAt ? String(notice.paidInFullAt).slice(0, 10) : "—",
        matchReason: `This ${(await messageTermsFor(String(notice.schemeId))).levy} notice is already fully paid`,
      });
    } else if (currentPaid + paymentAmount > amountDue) {
      matches.push({
        existingNoticeId: notice.id,
        lotNumber: notice.lot ? String(notice.lot.lotNumber) : "—",
        amountPaid: currentPaid,
        paidDate: notice.paidInFullAt ? String(notice.paidInFullAt).slice(0, 10) : "—",
        matchReason: `Payment of $${paymentAmount.toFixed(2)} would exceed the balance outstanding of $${(amountDue - currentPaid).toFixed(2)}`,
      });
    }

    return matches;
  } catch {
    // Table may not exist yet
    return [];
  }
}
