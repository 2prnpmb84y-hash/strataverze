"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormField, SelectField } from "@/components/ui/form-field";
import {
  createWorkOrderAction,
  updateWorkOrderAction,
  type WorkOrderFormState,
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

export function WorkOrderCreateForm({
  schemeId,
}: {
  schemeId: string;
}) {
  const action = createWorkOrderAction.bind(null, schemeId);
  const [state, formAction, isPending] = useActionState<
    WorkOrderFormState,
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

      <div className="grid grid-cols-2 gap-4">
        <FormField
          label="Estimated Cost ($)"
          name="estimatedCost"
          type="number"
          placeholder="0.00"
          error={state.fieldErrors?.estimatedCost}
        />

        <FormField
          label="Assigned To"
          name="assignedTo"
          placeholder="e.g. ABC Plumbing"
        />
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Creating..." : "Create Work Order"}
      </Button>
    </form>
  );
}

export function WorkOrderEditForm({
  schemeId,
  workOrderId,
  defaults,
}: {
  schemeId: string;
  workOrderId: string;
  defaults: {
    title: string;
    description: string;
    priority: string;
    category?: string | null;
    estimatedCost?: string | null;
    assignedTo?: string | null;
  };
}) {
  const action = updateWorkOrderAction.bind(null, schemeId, workOrderId);
  const [state, formAction, isPending] = useActionState<
    WorkOrderFormState,
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
          defaultValue={defaults.description}
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
          defaultValue={defaults.priority}
          options={priorityOptions}
          error={state.fieldErrors?.priority}
        />

        <SelectField
          label="Category"
          name="category"
          defaultValue={defaults.category ?? ""}
          options={categoryOptions}
          error={state.fieldErrors?.category}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          label="Estimated Cost ($)"
          name="estimatedCost"
          type="number"
          defaultValue={defaults.estimatedCost ?? ""}
          placeholder="0.00"
        />

        <FormField
          label="Assigned To"
          name="assignedTo"
          defaultValue={defaults.assignedTo ?? ""}
          placeholder="e.g. ABC Plumbing"
        />
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  );
}
