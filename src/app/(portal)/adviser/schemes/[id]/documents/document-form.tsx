"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormField, SelectField } from "@/components/ui/form-field";
import {
  uploadDocumentAction,
  updateDocumentAction,
  type DocumentFormState,
} from "./actions";

const categoryOptions = [
  { value: "MINUTES", label: "Meeting Minutes" },
  { value: "INSURANCE", label: "Insurance" },
  { value: "BYLAW", label: "By-laws / Rules" },
  { value: "FINANCIAL", label: "Financial Reports" },
  { value: "COMPLIANCE", label: "Compliance" },
  { value: "OTHER", label: "Other" },
];

export function DocumentUploadForm({
  schemeId,
}: {
  schemeId: string;
}) {
  const action = uploadDocumentAction.bind(null, schemeId);
  const [state, formAction, isPending] = useActionState<
    DocumentFormState,
    FormData
  >(action, {});

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
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
          accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg"
          className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-mint-soft file:text-turquoise hover:file:bg-mint focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise transition-colors"
        />
        {state.fieldErrors?.file && (
          <p className="mt-1.5 text-xs text-red-500">
            {state.fieldErrors.file}
          </p>
        )}
        <p className="mt-1.5 text-xs text-ink-muted">
          Max 10 MB. PDF, Word, Excel, CSV, images accepted.
        </p>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Uploading..." : "Upload Document"}
      </Button>
    </form>
  );
}

export function DocumentEditForm({
  schemeId,
  documentId,
  defaults,
}: {
  schemeId: string;
  documentId: string;
  defaults: {
    title: string;
    description?: string | null;
    category: string;
  };
}) {
  const action = updateDocumentAction.bind(null, schemeId, documentId);
  const [state, formAction, isPending] = useActionState<
    DocumentFormState,
    FormData
  >(action, {});

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <FormField
        label="Document Title"
        name="title"
        required
        defaultValue={defaults.title}
        error={state.fieldErrors?.title}
      />

      <FormField
        label="Description"
        name="description"
        defaultValue={defaults.description ?? ""}
      />

      <SelectField
        label="Category"
        name="category"
        required
        defaultValue={defaults.category}
        options={categoryOptions}
        error={state.fieldErrors?.category}
      />

      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  );
}
