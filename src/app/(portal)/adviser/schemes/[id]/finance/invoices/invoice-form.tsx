"use client";

import { useState, useTransition } from "react";
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

interface Props {
  schemeId: string;
  suppliers: { id: string; companyName: string }[];
  accountCodes: { id: string; code: string; name: string }[];
  funds: { id: string; name: string }[];
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

  const [subtotal, setSubtotal] = useState(0);
  const [gstAmount, setGstAmount] = useState(0);
  const totalAmount = subtotal + gstAmount;
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionWarnings, setExtractionWarnings] = useState<string[]>([]);

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

  async function handlePdfUpload(file: File) {
    setIsExtracting(true);
    setExtractionWarnings([]);
    setError(undefined);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          "",
        ),
      );

      const result = await extractInvoiceFromPdfAction(schemeId, base64);

      if (result.error) {
        setError(result.error);
        return;
      }

      if (result.data) {
        const d = result.data;

        if (d.invoiceNumber) {
          const el = document.querySelector<HTMLInputElement>(
            'input[name="invoiceNumber"]',
          );
          if (el) {
            el.value = d.invoiceNumber;
            el.dispatchEvent(new Event("input", { bubbles: true }));
          }
        }

        if (d.invoiceDate) {
          const el = document.querySelector<HTMLInputElement>(
            'input[name="invoiceDate"]',
          );
          if (el) {
            el.value = d.invoiceDate;
            el.dispatchEvent(new Event("input", { bubbles: true }));
          }
        }

        if (d.dueDate) {
          const el = document.querySelector<HTMLInputElement>(
            'input[name="dueDate"]',
          );
          if (el) {
            el.value = d.dueDate;
            el.dispatchEvent(new Event("input", { bubbles: true }));
          }
        }

        if (d.subtotal !== null) setSubtotal(d.subtotal);
        if (d.gstAmount !== null) setGstAmount(d.gstAmount);

        if (d.description) {
          const el = document.querySelector<HTMLTextAreaElement>(
            'textarea[name="description"]',
          );
          if (el) {
            el.value = d.description;
            el.dispatchEvent(new Event("input", { bubbles: true }));
          }
        }

        // Try to match supplier by name
        if (d.supplierName) {
          const match = suppliers.find(
            (s) =>
              s.companyName.toLowerCase() === d.supplierName!.toLowerCase(),
          );
          if (match) {
            const el = document.querySelector<HTMLSelectElement>(
              'select[name="supplierId"]',
            );
            if (el) {
              el.value = match.id;
              el.dispatchEvent(new Event("change", { bubbles: true }));
            }
          }
        }

        if (d.warnings.length > 0) {
          setExtractionWarnings(d.warnings);
        }

        if (d.confidence === "low") {
          setExtractionWarnings((prev) => [
            ...prev,
            "Low confidence extraction. Please review all fields carefully.",
          ]);
        }
      }
    } catch {
      setError("Failed to process PDF file.");
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(undefined);
    setFieldErrors({});
    setDuplicateWarning(null);

    const form = new FormData(e.currentTarget);

    startTransition(async () => {
      const payload: Record<string, unknown> = {
        supplierId: form.get("supplierId") as string,
        invoiceNumber: form.get("invoiceNumber") as string,
        invoiceDate: form.get("invoiceDate") as string,
        dueDate: form.get("dueDate") as string,
        subtotal,
        gstAmount,
        totalAmount,
        description: (form.get("description") as string) ?? "",
        accountCodeId: form.get("accountCodeId") as string,
        fundId: form.get("fundId") as string,
      };

      if (skipDuplicate) {
        payload.skipDuplicateCheck = true;
        setSkipDuplicate(false);
      }

      const result: ActionState = await createSupplierInvoiceAction(
        schemeId,
        payload as Parameters<typeof createSupplierInvoiceAction>[1],
      );

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
        router.push(`/adviser/schemes/${schemeId}/finance/invoices`);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-ink">
              Upload Invoice PDF
            </p>
            <p className="text-xs text-ink-muted mt-0.5">
              Upload a supplier invoice PDF to auto-fill the form fields.
            </p>
          </div>
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".pdf"
              className="hidden"
              disabled={isExtracting}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handlePdfUpload(file);
                e.target.value = "";
              }}
            />
            <span className="inline-flex items-center rounded-[var(--radius-card)] border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-white">
              {isExtracting ? "Extracting..." : "Choose PDF"}
            </span>
          </label>
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
        error={fieldErrors.supplierId}
      />

      <FormField
        label="Invoice Number"
        name="invoiceNumber"
        type="text"
        required
        placeholder="e.g. INV-001"
        error={fieldErrors.invoiceNumber}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField
          label="Invoice Date"
          name="invoiceDate"
          type="date"
          required
          error={fieldErrors.invoiceDate}
        />
        <FormField
          label="Due Date"
          name="dueDate"
          type="date"
          required
          error={fieldErrors.dueDate}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FormField
          label="Subtotal ($)"
          name="subtotal"
          type="number"
          required
          value={subtotal || ""}
          placeholder="0.00"
          onChange={(e) => setSubtotal(parseFloat(e.target.value) || 0)}
          error={fieldErrors.subtotal}
        />
        <FormField
          label="GST Amount ($)"
          name="gstAmount"
          type="number"
          required
          value={gstAmount || ""}
          placeholder="0.00"
          helpText="10% GST where applicable"
          onChange={(e) => setGstAmount(parseFloat(e.target.value) || 0)}
          error={fieldErrors.gstAmount}
        />
        <FormField
          label="Total Amount ($)"
          name="totalAmount"
          type="number"
          required
          value={totalAmount || ""}
          placeholder="0.00"
          onChange={() => {}}
          error={fieldErrors.totalAmount}
        />
      </div>

      <TextareaField
        label="Description"
        name="description"
        placeholder="Brief description of the invoice"
        error={fieldErrors.description}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField
          label="Account Code"
          name="accountCodeId"
          required
          options={accountCodeOptions}
          error={fieldErrors.accountCodeId}
        />
        <SelectField
          label="Fund"
          name="fundId"
          required
          options={fundOptions}
          error={fieldErrors.fundId}
        />
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? "Creating..." : "Create Invoice"}
        </Button>
      </div>
    </form>
  );
}
