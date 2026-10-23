"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createSupplierInvoiceAction,
  extractInvoiceFromPdfAction,
  ActionState,
} from "../actions";
import {
  FormField,
  SelectField,
  TextareaField,
} from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import {
  extractedValues,
  formatCorrectionValue,
  reviewChecks,
  type ReviewField,
} from "@/lib/finance/invoice-review";

interface Props {
  schemeId: string;
  suppliers: { id: string; companyName: string; abn?: string | null }[];
  accountCodes: { id: string; code: string; name: string }[];
  funds: { id: string; name: string }[];
}

type Extracted = ReturnType<typeof extractedValues>;

interface Values {
  supplierId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  subtotal: string;
  gst: string;
  description: string;
  accountCodeId: string;
  fundId: string;
}

const EMPTY: Values = {
  supplierId: "",
  invoiceNumber: "",
  invoiceDate: "",
  dueDate: "",
  subtotal: "",
  gst: "",
  description: "",
  accountCodeId: "",
  fundId: "",
};

const toCents = (s: string) => {
  const n = Number(s);
  return s.trim() === "" || !Number.isFinite(n) ? 0 : Math.round(n * 100);
};
const dollars = (cents: number | null) => (cents == null ? "" : (cents / 100).toFixed(2));

/** Base64 of a file, in chunks so a large PDF does not overflow the call stack. */
async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function InvoiceForm({
  schemeId,
  suppliers,
  accountCodes,
  funds,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [skipDuplicate, setSkipDuplicate] = useState(false);

  const [values, setValues] = useState<Values>(EMPTY);
  const set = (k: keyof Values) => (v: string) => setValues((prev) => ({ ...prev, [k]: v }));

  // TC-009 review state: the PDF shown beside the form, what was read from it, and the review tick.
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionWarnings, setExtractionWarnings] = useState<string[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfName, setPdfName] = useState<string>("");
  const [extractionId, setExtractionId] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [confidence, setConfidence] = useState<string | null>(null);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);

  useEffect(() => () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  }, [pdfUrl]);

  const subtotalCents = toCents(values.subtotal);
  const gstCents = toCents(values.gst);
  const totalCents = subtotalCents + gstCents;

  const supplierOptions = [
    { value: "", label: "Select..." },
    ...suppliers.map((s) => ({ value: s.id, label: s.companyName })),
  ];

  const accountCodeOptions = [
    { value: "", label: "Select..." },
    ...accountCodes.map((a) => ({
      value: a.id,
      label: `${a.code} — ${a.name}`,
    })),
  ];

  const fundOptions = [
    { value: "", label: "Select..." },
    ...funds.map((f) => ({ value: f.id, label: f.name })),
  ];

  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.companyName ?? null;

  /** Under each field: what was read from the PDF, and whether it has been changed. */
  function readNote(field: ReviewField, current: string | number): string | undefined {
    if (!extracted) return undefined;
    const was = extracted[field];
    if (was == null) return "Not found in the PDF. Enter it from the invoice.";
    const changed = typeof was === "number" ? was !== current : String(was).trim().toLowerCase() !== String(current).trim().toLowerCase();
    return `Read from PDF: ${formatCorrectionValue(field, was, supplierName)}${changed ? " (changed)" : ""}`;
  }

  const checks = useMemo(
    () =>
      extracted
        ? reviewChecks({ invoiceDate: values.invoiceDate, dueDate: values.dueDate, subtotalCents, gstCents, totalCents }, extracted.totalCents)
        : [],
    [extracted, values.invoiceDate, values.dueDate, subtotalCents, gstCents, totalCents],
  );

  async function handlePdfUpload(file: File) {
    setIsExtracting(true);
    setExtractionWarnings([]);
    setError(undefined);
    setReviewConfirmed(false);

    try {
      const result = await extractInvoiceFromPdfAction(schemeId, await fileToBase64(file), file.name);

      if (result.error) {
        setError(result.error);
        return;
      }

      if (result.data && result.extractionId) {
        const d = result.data;
        const read = extractedValues(d, suppliers);
        setPdfUrl(URL.createObjectURL(file));
        setPdfName(file.name);
        setExtractionId(result.extractionId);
        setExtracted(read);
        setConfidence(d.confidence);
        // Pre-fill only: every field stays editable, and account and fund are always chosen by hand.
        setValues((prev) => ({
          ...prev,
          supplierId: read.supplierId ?? prev.supplierId,
          invoiceNumber: read.invoiceNumber ?? prev.invoiceNumber,
          invoiceDate: read.invoiceDate ?? prev.invoiceDate,
          dueDate: read.dueDate ?? prev.dueDate,
          subtotal: read.subtotalCents != null ? dollars(read.subtotalCents) : prev.subtotal,
          gst: read.gstCents != null ? dollars(read.gstCents) : prev.gst,
          description: read.description ?? prev.description,
        }));
        const notes = [...d.warnings];
        if (!read.supplierId && d.supplierName) notes.push(`The supplier "${d.supplierName}" was not matched to a supplier on file. Choose one.`);
        if (d.confidence === "low") notes.push("Low confidence extraction. Check every field against the invoice.");
        setExtractionWarnings(notes);
      }
    } catch {
      setError("Failed to process PDF file.");
    } finally {
      setIsExtracting(false);
    }
  }

  function discardPdf() {
    setPdfUrl(null);
    setPdfName("");
    setExtractionId(null);
    setExtracted(null);
    setConfidence(null);
    setReviewConfirmed(false);
    setExtractionWarnings([]);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(undefined);
    setFieldErrors({});
    setDuplicateWarning(null);

    startTransition(async () => {
      const payload: Parameters<typeof createSupplierInvoiceAction>[1] & { skipDuplicateCheck?: boolean } = {
        supplierId: values.supplierId,
        invoiceNumber: values.invoiceNumber,
        invoiceDate: values.invoiceDate,
        dueDate: values.dueDate,
        subtotal: subtotalCents / 100,
        gstAmount: gstCents / 100,
        totalAmount: totalCents / 100,
        description: values.description,
        accountCodeId: values.accountCodeId,
        fundId: values.fundId,
        extractionId: extractionId ?? undefined,
        reviewConfirmed,
      };

      if (skipDuplicate) {
        payload.skipDuplicateCheck = true;
        setSkipDuplicate(false);
      }

      const result: ActionState = await createSupplierInvoiceAction(schemeId, payload);

      if (result.fieldErrors) {
        setFieldErrors(result.fieldErrors);
      }
      if (result.error) {
        if (result.data?.isDuplicate) {
          setDuplicateWarning(result.error);
          setSkipDuplicate(true);
          return;
        }
        setError(result.error);
        return;
      }
      if (result.success) {
        const id = result.data?.id ? String(result.data.id) : null;
        router.push(id ? `/adviser/schemes/${schemeId}/finance/invoices/${id}` : `/adviser/schemes/${schemeId}/finance/invoices`);
      }
    });
  }

  const form = (
    <form onSubmit={handleSubmit} className="space-y-6 min-w-0">
      {error && (
        <div className="rounded-[var(--radius-card)] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {duplicateWarning && (
        <div className="rounded-[var(--radius-card)] border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">Possible Duplicate Detected</p>
          <p className="mt-1">{duplicateWarning}</p>
          <p className="mt-2 text-xs text-amber-600">
            Click &ldquo;Create Invoice&rdquo; again to proceed anyway.
          </p>
        </div>
      )}

      {/* PDF extraction */}
      <div className="rounded-[var(--radius-card)] border border-dashed border-line bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">
              {pdfUrl ? `Reviewing ${pdfName}` : "Upload Invoice PDF"}
            </p>
            <p className="text-xs text-ink-muted mt-0.5">
              {pdfUrl
                ? `Read by ${confidence ? `${confidence} confidence ` : ""}pattern matching. Check each field against the invoice beside it.`
                : "Upload a supplier invoice PDF to pre-fill the form. You check every field before the invoice is created, and the PDF is kept with the invoice."}
            </p>
          </div>
          <div className="flex gap-2">
            {pdfUrl && (
              <button type="button" onClick={discardPdf} className="text-xs text-ink-muted underline">
                Remove PDF
              </button>
            )}
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                disabled={isExtracting}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handlePdfUpload(file);
                  e.target.value = "";
                }}
              />
              <span className="inline-flex items-center rounded-[var(--radius-card)] border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-white">
                {isExtracting ? "Reading..." : pdfUrl ? "Choose another PDF" : "Choose PDF"}
              </span>
            </label>
          </div>
        </div>
      </div>

      {extractionWarnings.length > 0 && (
        <div className="rounded-[var(--radius-card)] border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">Extraction Notes</p>
          <ul className="mt-1 list-disc pl-4 space-y-0.5">
            {extractionWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <SelectField
        label="Supplier"
        name="supplierId"
        required
        options={supplierOptions}
        value={values.supplierId}
        onChange={(e) => set("supplierId")(e.target.value)}
        error={fieldErrors.supplierId}
        helpText={readNote("supplierId", values.supplierId)}
      />

      <FormField
        label="Invoice Number"
        name="invoiceNumber"
        type="text"
        required
        placeholder="e.g. INV-001"
        value={values.invoiceNumber}
        onChange={(e) => set("invoiceNumber")(e.target.value)}
        error={fieldErrors.invoiceNumber}
        helpText={readNote("invoiceNumber", values.invoiceNumber)}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField
          label="Invoice Date"
          name="invoiceDate"
          type="date"
          required
          value={values.invoiceDate}
          onChange={(e) => set("invoiceDate")(e.target.value)}
          error={fieldErrors.invoiceDate}
          helpText={readNote("invoiceDate", values.invoiceDate)}
        />
        <FormField
          label="Due Date"
          name="dueDate"
          type="date"
          required
          value={values.dueDate}
          onChange={(e) => set("dueDate")(e.target.value)}
          error={fieldErrors.dueDate}
          helpText={readNote("dueDate", values.dueDate)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FormField
          label="Subtotal ($)"
          name="subtotal"
          type="number"
          step="0.01"
          min="0"
          required
          value={values.subtotal}
          placeholder="0.00"
          onChange={(e) => set("subtotal")(e.target.value)}
          error={fieldErrors.subtotal}
          helpText={readNote("subtotalCents", subtotalCents)}
        />
        <FormField
          label="GST Amount ($)"
          name="gstAmount"
          type="number"
          step="0.01"
          min="0"
          required
          value={values.gst}
          placeholder="0.00"
          onChange={(e) => set("gst")(e.target.value)}
          error={fieldErrors.gstAmount}
          helpText={readNote("gstCents", gstCents) ?? "10% GST where applicable"}
        />
        <FormField
          label="Total Amount ($)"
          name="totalAmount"
          type="number"
          required
          value={totalCents ? dollars(totalCents) : ""}
          placeholder="0.00"
          onChange={() => {}}
          error={fieldErrors.totalAmount}
          helpText={readNote("totalCents", totalCents) ?? "Subtotal plus GST"}
        />
      </div>

      <TextareaField
        label="Description"
        name="description"
        placeholder="Brief description of the invoice"
        value={values.description}
        onChange={(e) => set("description")(e.target.value)}
        error={fieldErrors.description}
        helpText={readNote("description", values.description)}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField
          label="Account Code"
          name="accountCodeId"
          required
          options={accountCodeOptions}
          value={values.accountCodeId}
          onChange={(e) => set("accountCodeId")(e.target.value)}
          error={fieldErrors.accountCodeId}
        />
        <SelectField
          label="Fund"
          name="fundId"
          required
          options={fundOptions}
          value={values.fundId}
          onChange={(e) => set("fundId")(e.target.value)}
          error={fieldErrors.fundId}
        />
      </div>

      {checks.length > 0 && (
        <div className="rounded-[var(--radius-card)] border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">Before you create it</p>
          <ul className="mt-1 list-disc pl-4 space-y-0.5">
            {checks.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {extractionId && (
        <label className="flex items-start gap-3 rounded-[var(--radius-card)] border border-line bg-white p-4 cursor-pointer">
          <input
            type="checkbox"
            checked={reviewConfirmed}
            onChange={(e) => setReviewConfirmed(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-line text-turquoise focus:ring-turquoise"
          />
          <span className="text-sm text-ink">
            I have checked every field against the invoice. The values read from the PDF and any I changed are kept in the audit trail.
          </span>
        </label>
      )}

      <div className="flex justify-end pt-2">
        <Button type="submit" variant="primary" disabled={isPending || (!!extractionId && !reviewConfirmed)}>
          {isPending ? "Creating..." : "Create Invoice"}
        </Button>
      </div>
    </form>
  );

  if (!pdfUrl) return <div className="max-w-3xl">{form}</div>;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="min-w-0 lg:sticky lg:top-4 lg:self-start">
        <iframe
          src={pdfUrl}
          title={`Invoice PDF: ${pdfName}`}
          className="h-[70vh] w-full rounded-[var(--radius-card)] border border-line bg-white"
        />
        <a href={pdfUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-turquoise underline">
          Open the PDF in a new tab
        </a>
      </div>
      {form}
    </div>
  );
}
