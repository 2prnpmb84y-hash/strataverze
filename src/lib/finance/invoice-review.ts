/**
 * Reviewing an extracted supplier invoice (pure). TC-009: the fields read
 * from an uploaded invoice are a pre-fill, never a record. The adviser checks
 * each one against the document and corrects it, and both the value read
 * and the value entered are kept for the audit trail.
 *
 * Extraction is pattern matching and OCR (no AI), so a misread digit is the
 * failure to plan for: $1,100 read where the invoice says $11,000.
 */

/** The fields extraction can fill, as the review form holds them. */
export interface InvoiceReviewValues {
  supplierId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  subtotalCents: number;
  gstCents: number;
  totalCents: number;
  description: string;
}

/** What extraction read, in the extractor's own shape (dollars, ISO dates). */
export interface ExtractedFields {
  supplierName: string | null;
  abn: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  subtotal: number | null;
  gstAmount: number | null;
  totalAmount: number | null;
  description: string | null;
}

export type ReviewField = keyof InvoiceReviewValues;

export const REVIEW_FIELD_LABELS: Record<ReviewField, string> = {
  supplierId: "Supplier",
  invoiceNumber: "Invoice number",
  invoiceDate: "Invoice date",
  dueDate: "Due date",
  subtotalCents: "Subtotal",
  gstCents: "GST",
  totalCents: "Total",
  description: "Description",
};

const MONEY: ReviewField[] = ["subtotalCents", "gstCents", "totalCents"];
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const toCents = (v: number | null) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100));
const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const norm = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/** The supplier an extraction names: by ABN first, then by exact name. */
export function matchSupplier(extracted: Pick<ExtractedFields, "abn" | "supplierName">, suppliers: Array<{ id: string; companyName: string; abn?: string | null }>): string | null {
  const abn = digits(extracted.abn);
  if (abn.length === 11) {
    const byAbn = suppliers.find((s) => digits(s.abn) === abn);
    if (byAbn) return byAbn.id;
  }
  const name = norm(extracted.supplierName);
  if (name) {
    const byName = suppliers.find((s) => norm(s.companyName) === name);
    if (byName) return byName.id;
  }
  return null;
}

/**
 * The extracted values in the review form's shape, or null for a field
 * extraction did not find. The total is the one read from the invoice, not
 * subtotal plus GST, so a misread shows up as a difference.
 */
export function extractedValues(
  extracted: ExtractedFields,
  suppliers: Array<{ id: string; companyName: string; abn?: string | null }>,
): { [K in ReviewField]: InvoiceReviewValues[K] | null } {
  const subtotal = toCents(extracted.subtotal);
  const gst = toCents(extracted.gstAmount);
  const total = toCents(extracted.totalAmount) ?? (subtotal != null && gst != null ? subtotal + gst : null);
  const day = (d: string | null) => (d && ISO_DAY.test(d) ? d : null);
  return {
    supplierId: matchSupplier(extracted, suppliers),
    invoiceNumber: extracted.invoiceNumber?.trim() || null,
    invoiceDate: day(extracted.invoiceDate),
    dueDate: day(extracted.dueDate),
    subtotalCents: subtotal,
    gstCents: gst,
    totalCents: total,
    description: extracted.description?.trim() || null,
  };
}

export interface Correction {
  field: ReviewField;
  label: string;
  extracted: string | number | null;
  accepted: string | number;
}

/**
 * Each field where what was entered differs from what was read, or where
 * extraction found nothing and the adviser entered a value. Money is
 * compared in cents and text ignoring case and spacing.
 */
export function extractionCorrections(extracted: ReturnType<typeof extractedValues>, accepted: InvoiceReviewValues): Correction[] {
  const out: Correction[] = [];
  for (const field of Object.keys(REVIEW_FIELD_LABELS) as ReviewField[]) {
    const was = extracted[field];
    const now = accepted[field];
    const same = MONEY.includes(field) ? was === now : typeof was === "string" && typeof now === "string" ? norm(was) === norm(now) : was === now;
    if (same) continue;
    if (was == null && (now === "" || now == null)) continue;
    out.push({ field, label: REVIEW_FIELD_LABELS[field], extracted: was, accepted: now });
  }
  return out;
}

/** Things worth a second look before the invoice is saved. Each is advice, not a block. */
export function reviewChecks(v: Pick<InvoiceReviewValues, "invoiceDate" | "dueDate" | "subtotalCents" | "gstCents" | "totalCents">, extractedTotalCents: number | null): string[] {
  const out: string[] = [];
  if (v.subtotalCents + v.gstCents !== v.totalCents) out.push("Subtotal plus GST does not equal the total.");
  if (v.gstCents > 0 && v.subtotalCents > 0) {
    // GST is one tenth of the GST-exclusive price; allow a few cents of rounding across lines.
    const expected = Math.round(v.subtotalCents / 10);
    if (Math.abs(v.gstCents - expected) > 5) out.push("GST is not 10% of the subtotal. Check the invoice for GST-free items.");
  }
  if (v.invoiceDate && v.dueDate && v.dueDate < v.invoiceDate) out.push("The due date is before the invoice date.");
  if (extractedTotalCents != null && extractedTotalCents !== v.totalCents) {
    const ratio = Math.max(extractedTotalCents, v.totalCents) / Math.max(1, Math.min(extractedTotalCents, v.totalCents));
    if (Math.abs(ratio - 10) < 0.01 || Math.abs(ratio - 100) < 0.1) {
      out.push("The total entered is ten or a hundred times the total read from the invoice. Check for a misread digit or decimal point.");
    }
  }
  return out;
}

/** A value for display in the audit trail. */
export function formatCorrectionValue(field: ReviewField, v: string | number | null, supplierName?: (id: string) => string | null): string {
  if (v == null || v === "") return "not found";
  if (MONEY.includes(field)) return (Number(v) / 100).toLocaleString("en-AU", { style: "currency", currency: "AUD" });
  if (field === "supplierId") return supplierName?.(String(v)) ?? String(v);
  return String(v);
}
