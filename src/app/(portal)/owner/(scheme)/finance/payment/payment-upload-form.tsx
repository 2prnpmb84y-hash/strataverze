"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardHeader } from "@/components/ui/card";
import { FormField, SelectField } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { uploadPaymentConfirmationAction } from "../actions";

interface Notice {
  id: string;
  label: string;
  schemeId: string;
  schemeName: string;
}

const allowedMimeTypes = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/heic",
];

export function PaymentUploadForm({
  defaultSchemeId,
  outstandingNotices,
}: {
  defaultSchemeId: string;
  outstandingNotices: Notice[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const formData = new FormData(e.currentTarget);
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

    const levyNoticeId = (formData.get("levyNoticeId") as string) || undefined;
    const amount = formData.get("amount") as string;
    const documentDate = formData.get("documentDate") as string;
    const payerName = formData.get("payerName") as string;
    const payeeReference = formData.get("payeeReference") as string;

    // Determine scheme from selected notice or use default
    const selectedNotice = outstandingNotices.find(
      (n) => n.id === levyNoticeId,
    );
    const schemeId = selectedNotice?.schemeId ?? defaultSchemeId;

    try {
      setUploading(true);

      const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
      const storagePath = `schemes/${schemeId}/payments/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

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

      startTransition(async () => {
        const result = await uploadPaymentConfirmationAction(schemeId, {
          levyNoticeId,
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
          setSuccess(true);
          router.refresh();
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

  if (success) {
    return (
      <Card>
        <div className="px-6 py-8 text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
            <svg
              className="w-6 h-6 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m4.5 12.75 6 6 9-13.5"
              />
            </svg>
          </div>
          <p className="text-sm font-medium text-ink">
            Payment confirmation uploaded successfully
          </p>
          <p className="text-xs text-ink-muted">
            Your strata manager will review the document and confirm the payment.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button variant="primary" href="/owner/finance">
              Back to Finance
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setSuccess(false);
                setError(null);
              }}
            >
              Upload Another
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Payment Details"
        description="Upload a bank receipt, transfer confirmation or screenshot as proof of payment."
      />
      <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
        {error && (
          <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {outstandingNotices.length > 0 && (
          <SelectField
            label="Levy Notice (optional)"
            name="levyNoticeId"
            options={[
              { value: "", label: "Select a levy notice..." },
              ...outstandingNotices.map((n) => ({
                value: n.id,
                label: `${n.schemeName} - ${n.label}`,
              })),
            ]}
          />
        )}

        <div>
          <label
            htmlFor="file"
            className="block text-sm font-medium text-ink mb-1.5"
          >
            Payment Proof
            <span className="text-red-500 ml-0.5">*</span>
          </label>
          <input
            id="file"
            name="file"
            type="file"
            required
            accept=".pdf,.png,.jpg,.jpeg,.heic"
            className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-mint-soft file:text-turquoise hover:file:bg-mint focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise transition-colors"
          />
          <p className="mt-1.5 text-xs text-ink-muted">
            Max 10 MB. PDF, PNG, JPG, JPEG, HEIC accepted.
          </p>
        </div>

        <FormField
          label="Payment Date"
          name="documentDate"
          type="date"
          helpText="The date the payment was made."
        />

        <FormField
          label="Amount Paid"
          name="amount"
          type="number"
          step="0.01"
          placeholder="0.00"
          helpText="The amount transferred."
        />

        <FormField
          label="Your Name"
          name="payerName"
          placeholder="e.g. John Smith"
          helpText="Name shown on the bank transfer."
        />

        <FormField
          label="Reference / Description"
          name="payeeReference"
          placeholder="e.g. Levy Q1 2026 Lot 5"
          helpText="Bank reference used for the transfer."
        />

        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {uploading
              ? "Uploading..."
              : isPending
                ? "Saving..."
                : "Upload Payment Confirmation"}
          </Button>
          <Button variant="secondary" href="/owner/finance">
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
