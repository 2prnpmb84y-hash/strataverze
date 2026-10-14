"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormField, SelectField } from "@/components/ui/form-field";
import {
  createComplianceAction,
  updateComplianceAction,
  type ComplianceFormState,
} from "./actions";

const categoryOptions = [
  { value: "INSURANCE", label: "Insurance" },
  { value: "FIRE_SAFETY", label: "Fire Safety" },
  { value: "OHS", label: "OH&S" },
  { value: "BUILDING", label: "Building" },
  { value: "OTHER", label: "Other" },
];

export function ComplianceCreateForm({
  schemeId,
}: {
  schemeId: string;
}) {
  const action = createComplianceAction.bind(null, schemeId);
  const [state, formAction, isPending] = useActionState<
    ComplianceFormState,
    FormData
  >(action, {});

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <FormField
        label="Title"
        name="title"
        required
        placeholder="e.g. Annual Fire Safety Statement"
        error={state.fieldErrors?.title}
      />

      <FormField
        label="Description"
        name="description"
        placeholder="Details about this compliance obligation"
      />

      <div className="grid grid-cols-2 gap-4">
        <SelectField
          label="Category"
          name="category"
          required
          defaultValue="OTHER"
          options={categoryOptions}
          error={state.fieldErrors?.category}
        />

        <FormField
          label="Due Date"
          name="dueDate"
          type="date"
        />
      </div>

      <FormField
        label="Notes"
        name="notes"
        placeholder="Any additional notes or reminders"
      />

      <Button type="submit" disabled={isPending}>
        {isPending ? "Creating..." : "Create Compliance Item"}
      </Button>
    </form>
  );
}

export function ComplianceEditForm({
  schemeId,
  itemId,
  defaults,
}: {
  schemeId: string;
  itemId: string;
  defaults: {
    title: string;
    description?: string | null;
    category: string;
    dueDate?: string | null;
    notes?: string | null;
  };
}) {
  const action = updateComplianceAction.bind(null, schemeId, itemId);
  const [state, formAction, isPending] = useActionState<
    ComplianceFormState,
    FormData
  >(action, {});

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <FormField
        label="Title"
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

      <div className="grid grid-cols-2 gap-4">
        <SelectField
          label="Category"
          name="category"
          required
          defaultValue={defaults.category}
          options={categoryOptions}
          error={state.fieldErrors?.category}
        />

        <FormField
          label="Due Date"
          name="dueDate"
          type="date"
          defaultValue={defaults.dueDate ?? ""}
        />
      </div>

      <FormField
        label="Notes"
        name="notes"
        defaultValue={defaults.notes ?? ""}
      />

      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  );
}
