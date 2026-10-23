/**
 * Invoice extraction review (server). TC-009: the uploaded invoice is kept,
 * what was read from it is kept unchanged, and when the invoice is created
 * the values entered and every correction are recorded against it.
 */
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { Numeric, TimestampString } from "@prisma/orm-postgres/target/codec-types";
import { logActivity } from "@/lib/queries/activity-log";
import type { ExtractedInvoiceData } from "@/lib/queries/invoice-extraction";
import {
  extractedValues,
  extractionCorrections,
  formatCorrectionValue,
  type Correction,
  type ExtractedFields,
  type InvoiceReviewValues,
} from "./invoice-review";

const ts = (v: string) => v as unknown as TimestampString<3>;
type Json = Parameters<typeof db.orm.public.InvoiceExtraction.create>[0]["extracted"];
const json = (v: unknown) => v as Json;
const RAW_TEXT_LIMIT = 20_000;

export class InvoiceReviewError extends Error {}

/** Record what extraction read from a stored invoice document. Returns the extraction id. */
export async function recordInvoiceExtraction(input: { schemeId: string; documentId: string; data: ExtractedInvoiceData; actorId: string }): Promise<string> {
  const d = input.data;
  const fields: ExtractedFields = {
    supplierName: d.supplierName,
    abn: d.abn,
    invoiceNumber: d.invoiceNumber,
    invoiceDate: d.invoiceDate,
    dueDate: d.dueDate,
    subtotal: d.subtotal,
    gstAmount: d.gstAmount,
    totalAmount: d.totalAmount,
    description: d.description,
  };
  const row = await db.orm.public.InvoiceExtraction.create({
    schemeId: input.schemeId,
    financialDocumentId: input.documentId,
    method: d.extractionMethod === "ocr" ? "OCR" : "TEXT",
    confidence: d.confidence,
    extracted: json({ fields, lineItems: d.lineItems, warnings: d.warnings, rawText: d.rawText.slice(0, RAW_TEXT_LIMIT) }),
    createdBy: input.actorId,
  });
  return row.id;
}

/** Refuses an extraction from another scheme, or one already used for an invoice. */
export async function assertExtractionUsable(schemeId: string, extractionId: string): Promise<void> {
  const ext = await db.orm.public.InvoiceExtraction.where((x) => and(x.id.eq(extractionId), x.schemeId.eq(schemeId))).first();
  if (!ext) throw new InvoiceReviewError("The extraction for this invoice could not be found. Upload the PDF again.");
  if (ext.reviewedAt) throw new InvoiceReviewError("This uploaded invoice has already been used to create an invoice.");
}

/**
 * After an invoice is created from a reviewed extraction: record the values
 * it was created with and each field that was corrected, link the uploaded
 * document to the invoice, and log the review. Corrections are worked out
 * here from the stored extraction, not taken from the browser.
 */
export async function completeInvoiceReview(input: {
  schemeId: string;
  extractionId: string;
  invoiceId: string;
  accepted: InvoiceReviewValues;
  actorId: string;
}): Promise<Correction[]> {
  const ext = await db.orm.public.InvoiceExtraction.where((x) => and(x.id.eq(input.extractionId), x.schemeId.eq(input.schemeId))).first();
  if (!ext) throw new InvoiceReviewError("The extraction for this invoice could not be found.");
  if (ext.reviewedAt) throw new InvoiceReviewError("This extraction has already been used for an invoice.");
  const suppliers = await db.orm.public.Supplier.where((s) => s.schemeId.eq(input.schemeId)).limit(2000).all();
  const supplierList = suppliers.map((s) => ({ id: s.id, companyName: String(s.companyName), abn: s.abn ? String(s.abn) : null }));
  const stored = ext.extracted as unknown as { fields: ExtractedFields };
  const corrections = extractionCorrections(extractedValues(stored.fields, supplierList), input.accepted);
  const now = new Date().toISOString();

  await db.transaction(async (tx) => {
    await tx.orm.public.InvoiceExtraction.where({ id: ext.id }).update({
      supplierInvoiceId: input.invoiceId,
      accepted: json(input.accepted),
      corrections: json(corrections),
      reviewedBy: input.actorId,
      reviewedAt: ts(now),
    });
    await tx.orm.public.FinancialDocument.where({ id: ext.financialDocumentId }).update({
      supplierInvoiceId: input.invoiceId,
      supplierId: input.accepted.supplierId,
      amount: String(input.accepted.totalCents / 100) as unknown as Numeric<12, 2>,
      documentDate: ts(input.accepted.invoiceDate),
      documentStatus: "VERIFIED",
      verificationStatus: "MATCHED",
      reviewedBy: input.actorId,
      reviewedAt: ts(now),
    });
  });

  const name = (id: string) => supplierList.find((s) => s.id === id)?.companyName ?? null;
  await logActivity({
    schemeId: input.schemeId,
    actorId: input.actorId,
    action: "SUPPLIER_INVOICE_EXTRACTION_REVIEWED",
    entityType: "SupplierInvoice",
    entityId: input.invoiceId,
    metadata: {
      extractionId: ext.id,
      documentId: ext.financialDocumentId,
      method: ext.method,
      confidence: ext.confidence,
      corrections: corrections.map((c) => ({
        field: c.field,
        label: c.label,
        extracted: formatCorrectionValue(c.field, c.extracted, name),
        accepted: formatCorrectionValue(c.field, c.accepted, name),
      })),
    },
  });
  return corrections;
}

export interface InvoiceExtractionSummary {
  id: string;
  documentId: string;
  method: string;
  confidence: string;
  createdAt: string;
  reviewedAt: string | null;
  corrections: Array<{ label: string; extracted: string; accepted: string }>;
}

/** The extraction an invoice was created from, with its corrections, for the invoice page. */
export async function getInvoiceExtraction(schemeId: string, invoiceId: string): Promise<InvoiceExtractionSummary | null> {
  const ext = await db.orm.public.InvoiceExtraction.where((x) => and(x.schemeId.eq(schemeId), x.supplierInvoiceId.eq(invoiceId))).first();
  if (!ext) return null;
  const suppliers = await db.orm.public.Supplier.where((s) => s.schemeId.eq(schemeId)).limit(2000).all();
  const name = (id: string) => {
    const s = suppliers.find((x) => x.id === id);
    return s ? String(s.companyName) : null;
  };
  const corrections = ((ext.corrections as unknown as Correction[] | null) ?? []).map((c) => ({
    label: c.label,
    extracted: formatCorrectionValue(c.field, c.extracted, name),
    accepted: formatCorrectionValue(c.field, c.accepted, name),
  }));
  return {
    id: ext.id,
    documentId: ext.financialDocumentId,
    method: String(ext.method),
    confidence: String(ext.confidence),
    createdAt: String(ext.createdAt),
    reviewedAt: ext.reviewedAt ? String(ext.reviewedAt) : null,
    corrections,
  };
}
