"use client";

import { startTransition, useActionState, useState } from "react";
import { stageFormFile } from "@/lib/storage/client-upload";
import { VISIBILITY_OPTIONS } from "@/components/documents/visibility-options";

// The committee chooses between everyone, the committee, or one lot (the
// manager-only choice is the Adviser's).
const COMMITTEE_VISIBILITY = VISIBILITY_OPTIONS.filter((o) => o.value !== "MANAGEMENT");
import { Button } from "@/components/ui/button";
import { FormField, SelectField } from "@/components/ui/form-field";
import { uploadDocumentAction, type DocumentFormState } from "../actions";

const categoryOptions = [
  { value: "MINUTES", label: "Meeting Minutes" },
  { value: "INSURANCE", label: "Insurance" },
  { value: "BYLAW", label: "By-laws / Rules" },
  { value: "FINANCIAL", label: "Financial Reports" },
  { value: "COMPLIANCE", label: "Compliance" },
  { value: "OTHER", label: "Other" },
];

export function DocumentUploadForm({
  schemes,
}: {
  schemes: { id: string; name: string }[];
}) {
  const [selectedScheme, setSelectedScheme] = useState(
    schemes.length === 1 ? schemes[0].id : "",
  );

  const action = selectedScheme
    ? uploadDocumentAction.bind(null, selectedScheme)
    : undefined;

  const [state, formAction, isPending] = useActionState<
    DocumentFormState,
    FormData
  >(action ?? (async () => ({ error: "Please select a scheme." })), {});
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // The file goes straight to storage through a one-time link the server
  // issues; the form then submits the upload id, not the file (S3).
  async function submit(formData: FormData) {
    setUploadError(null);
    if (!selectedScheme) return;
    setUploading(true);
    const error = await stageFormFile(formData, selectedScheme, "committee_library");
    setUploading(false);
    if (error) {
      setUploadError(error);
      return;
    }
    startTransition(() => formAction(formData));
  }

  const fileError = uploadError ?? state.fieldErrors?.file;

  return (
    <form action={submit} className="space-y-4">
      {state.error && (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      {schemes.length > 1 && (
        <div>
          <label
            htmlFor="scheme"
            className="block text-sm font-medium text-ink mb-1.5"
          >
            Scheme
            <span className="text-red-500 ml-0.5">*</span>
          </label>
          <select
            id="scheme"
            value={selectedScheme}
            onChange={(e) => setSelectedScheme(e.target.value)}
            className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise transition-colors"
          >
            <option value="">Select a scheme...</option>
            {schemes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <FormField
        label="Document Title"
        name="title"
        required
        placeholder="e.g. 2025 Annual Insurance Certificate"
        error={state.fieldErrors?.title}
      />

      <FormField
        label="Description"
        name="description"
        placeholder="Brief description of the document"
      />

      <SelectField
        label="Category"
        name="category"
        required
        defaultValue="OTHER"
        options={categoryOptions}
        error={state.fieldErrors?.category}
      />

      <SelectField
        label="Who can see it"
        name="visibility"
        required
        defaultValue="ALL_MEMBERS"
        options={COMMITTEE_VISIBILITY}
        error={state.fieldErrors?.visibility}
      />

      <FormField
        label="Lot number"
        name="lotNumber"
        placeholder="Only if the document is about one lot"
      />

      <div>
        <label
          htmlFor="file"
          className="block text-sm font-medium text-ink mb-1.5"
        >
          File
          <span className="text-red-500 ml-0.5">*</span>
        </label>
        <input
          id="file"
          name="file"
          type="file"
          required
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.png,.jpg,.jpeg,.gif,.webp"
          className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-mint-soft file:text-turquoise hover:file:bg-mint focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise transition-colors"
        />
        {fileError && (
          <p className="mt-1.5 text-xs text-red-500">
            {fileError}
          </p>
        )}
        <p className="mt-1.5 text-xs text-ink-muted">
          Max 10 MB. PDF, Word, Excel, CSV, images accepted.
        </p>
      </div>

      <Button type="submit" disabled={isPending || uploading || !selectedScheme}>
        {isPending || uploading ? "Uploading..." : "Upload Document"}
      </Button>
    </form>
  );
}
