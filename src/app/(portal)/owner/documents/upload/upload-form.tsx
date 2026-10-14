"use client";

import { useActionState, useState } from "react";
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

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      {schemes.length > 1 && (
        <div>
          <label
            htmlFor="scheme"
            className="block text-sm font-medium text-foreground mb-1.5"
          >
            Scheme
            <span className="text-red-500 ml-0.5">*</span>
          </label>
          <select
            id="scheme"
            value={selectedScheme}
            onChange={(e) => setSelectedScheme(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 transition-colors"
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
          accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg"
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary-100 file:text-primary-700 hover:file:bg-primary-200 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 transition-colors"
        />
        {state.fieldErrors?.file && (
          <p className="mt-1.5 text-xs text-red-500">
            {state.fieldErrors.file}
          </p>
        )}
        <p className="mt-1.5 text-xs text-muted-foreground">
          Max 10 MB. PDF, Word, Excel, CSV, images accepted.
        </p>
      </div>

      <Button type="submit" disabled={isPending || !selectedScheme}>
        {isPending ? "Uploading..." : "Upload Document"}
      </Button>
    </form>
  );
}
