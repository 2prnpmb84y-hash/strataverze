"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormField, SelectField } from "@/components/ui/form-field";
import { createOwnerWorkOrderAction, type FormState } from "../actions";

const priorityOptions = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

export function OwnerMaintenanceForm({
  schemes,
}: {
  schemes: { value: string; label: string }[];
}) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    createOwnerWorkOrderAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      {schemes.length === 1 ? (
        <input type="hidden" name="schemeId" value={schemes[0].value} />
      ) : (
        <SelectField
          label="Scheme"
          name="schemeId"
          required
          options={schemes}
          error={state.fieldErrors?.schemeId}
        />
      )}

      <FormField
        label="Title"
        name="title"
        required
        placeholder="e.g. Leaking tap in common bathroom"
        error={state.fieldErrors?.title}
      />

      <div>
        <label
          htmlFor="description"
          className="block text-sm font-medium text-ink mb-1.5"
        >
          Description
          <span className="text-red-500 ml-0.5">*</span>
        </label>
        <textarea
          id="description"
          name="description"
          required
          rows={4}
          placeholder="Describe the issue, where it is, and any relevant details..."
          className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise transition-colors resize-y"
        />
        {state.fieldErrors?.description && (
          <p className="mt-1.5 text-xs text-red-500">
            {state.fieldErrors.description}
          </p>
        )}
      </div>

      <SelectField
        label="Priority"
        name="priority"
        required
        defaultValue="MEDIUM"
        options={priorityOptions}
        error={state.fieldErrors?.priority}
      />

      <Button type="submit" disabled={isPending}>
        {isPending ? "Submitting..." : "Submit Request"}
      </Button>
    </form>
  );
}
