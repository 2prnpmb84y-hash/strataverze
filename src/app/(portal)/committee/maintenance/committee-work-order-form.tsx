"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormField, SelectField } from "@/components/ui/form-field";
import {
  createCommitteeWorkOrderAction,
  type CommitteeWorkOrderFormState,
} from "./actions";

const priorityOptions = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

const categoryOptions = [
  { value: "", label: "None" },
  { value: "PLUMBING", label: "Plumbing" },
  { value: "ELECTRICAL", label: "Electrical" },
  { value: "STRUCTURAL", label: "Structural" },
  { value: "LANDSCAPING", label: "Landscaping" },
  { value: "CLEANING", label: "Cleaning" },
  { value: "SECURITY", label: "Security" },
  { value: "OTHER", label: "Other" },
];

export function CommitteeWorkOrderForm({
  schemes,
}: {
  schemes: { id: string; name: string }[];
}) {
  const [state, formAction, isPending] = useActionState<
    CommitteeWorkOrderFormState,
    FormData
  >(createCommitteeWorkOrderAction, {});

  const schemeOptions = schemes.map((s) => ({
    value: s.id,
    label: s.name,
  }));

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      {schemes.length > 1 && (
        <SelectField
          label="Scheme"
          name="schemeId"
          required
          options={schemeOptions}
          error={state.fieldErrors?.schemeId}
        />
      )}

      {schemes.length === 1 && (
        <input type="hidden" name="schemeId" value={schemes[0].id} />
      )}

      <FormField
        label="Title"
        name="title"
        required
        placeholder="e.g. Repair leaking tap in common area"
        error={state.fieldErrors?.title}
      />

      <div>
        <label
          htmlFor="description"
          className="block text-sm font-medium text-foreground mb-1.5"
        >
          Description
          <span className="text-red-500 ml-0.5">*</span>
        </label>
        <textarea
          id="description"
          name="description"
          required
          rows={4}
          placeholder="Describe the issue, location, and any relevant details..."
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 transition-colors resize-y"
        />
        {state.fieldErrors?.description && (
          <p className="mt-1.5 text-xs text-red-500">
            {state.fieldErrors.description}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <SelectField
          label="Priority"
          name="priority"
          required
          defaultValue="MEDIUM"
          options={priorityOptions}
          error={state.fieldErrors?.priority}
        />

        <SelectField
          label="Category"
          name="category"
          options={categoryOptions}
          error={state.fieldErrors?.category}
        />
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Creating..." : "Raise Work Order"}
      </Button>
    </form>
  );
}
