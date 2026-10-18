"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { FormField, SelectField } from "@/components/ui/form-field";
import { uploadFinancialDocumentAction } from "../actions";

const docTypeOptions = [
  { value: "RECEIPT", label: "Receipt" },
  { value: "INVOICE", label: "Invoice" },
  { value: "BANK_STATEMENT", label: "Bank Statement" },
  { value: "LEVY_NOTICE", label: "Levy Notice" },
  { value: "INSURANCE", label: "Insurance" },
  { value: "CONTRACTOR_QUOTE", label: "Contractor Quote" },
  { value: "TAX_DOCUMENT", label: "Tax Document" },
  { value: "OTHER", label: "Other" },
];

const allowedMimeTypes = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/heic",
];

export function FinancialDocumentUploadForm({
  schemeId,
}: {
  schemeId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = e.currentTarget;
    const formData = new FormData(form);

    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) {
      setError("Please select a file to upload.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("File size must not exceed 10 MB.");
      return;
    }

    if (!allowedMimeTypes.includes(file.type)) {
      setError("Only PDF, PNG, JPG, JPEG, and HEIC files are allowed.");
      return;
    }

    const documentType = formData.get("documentType") as string;
    if (!documentType) {
      setError("Please select a document type.");
      return;
    }

    const amount = formData.get("amount") as string;
    const documentDate = formData.get("documentDate") as string;
    const payerName = formData.get("payerName") as string;
    const payeeReference = formData.get("payeeReference") as string;

    try {
      setUploading(true);

      // Upload file to Supabase Storage
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
      const storagePath = `schemes/${schemeId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        setError(`Upload failed: ${uploadError.message}`);
        setUploading(false);
        return;
      }

      setUploading(false);

      // Call server action with the storage path
      startTransition(async () => {
        const result = await uploadFinancialDocumentAction(schemeId, {
          documentType,
          fileName: file.name,
          fileUrl: storagePath,
          fileSize: file.size,
          mimeType: file.type,
          amount: amount ? parseFloat(amount) : undefined,
          documentDate: documentDate || undefined,
          payerName: payerName || undefined,
          payeeReference: payeeReference || undefined,
        });

        if (result.error) {
          setError(result.error);
        } else {
          router.push(`/adviser/schemes/${schemeId}/finance/documents`);
        }
      });
    } catch (err) {
      setUploading(false);
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred.",
      );
    }
  }

  const isSubmitting = uploading || isPending;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <SelectField
        label="Document Type"
        name="documentType"
        required
        options={docTypeOptions}
      />

      <div>
        <label
          htmlFor="file"
          className="block text-sm font-medium text-foreground mb-1.5"
        >
          File
          <span className="text-red-500 ml-0.5">*</span>
        </label>
        <input
          id="file"
          name="file"
          type="file"
          required
          accept=".pdf,.png,.jpg,.jpeg,.heic"
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary-100 file:text-primary-700 hover:file:bg-primary-200 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 transition-colors"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          Max 10 MB. PDF, PNG, JPG, JPEG, HEIC accepted.
        </p>
      </div>

      <FormField
        label="Document Date"
        name="documentDate"
        type="date"
        helpText="The date shown on the document (e.g. invoice date, receipt date)."
      />

      <FormField
        label="Amount"
        name="amount"
        type="number"
        placeholder="0.00"
        helpText="The monetary amount on the document, if applicable."
      />

      <FormField
        label="Payer Name"
        name="payerName"
        placeholder="e.g. John Smith"
        helpText="Name of the person or entity who paid, if applicable."
      />

      <FormField
        label="Payee / Reference"
        name="payeeReference"
        placeholder="e.g. INV-2025-001"
        helpText="Reference number or payee details, if applicable."
      />

      <Button type="submit" disabled={isSubmitting}>
        {uploading
          ? "Uploading file..."
          : isPending
            ? "Saving..."
            : "Upload Document"}
      </Button>
    </form>
  );
}
