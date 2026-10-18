"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormField, SelectField } from "@/components/ui/form-field";
import { createLevyAction, updateLevyAction, type LevyFormState } from "./actions";

export function LevyForm({
  mode,
  schemeId,
  levyId,
  defaults,
}: {
  mode: "create" | "edit";
  schemeId: string;
  levyId?: string;
  defaults?: {
    title: string;
    description: string | null;
    totalAmount: string;
    dueDate: string;
    levyType: string;
  };
}) {
  const action =
    mode === "create"
      ? createLevyAction.bind(null, schemeId)
      : updateLevyAction.bind(null, schemeId, levyId!);

  const [state, formAction, isPending] = useActionState<LevyFormState, FormData>(
    action,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 p-3">
          <p className="text-sm text-red-700">{state.error}</p>
        </div>
      )}

      <FormField
        label="Title"
        name="title"
        required
        defaultValue={defaults?.title}
        placeholder="Q3 2025 Ordinary Levy"
        error={state.fieldErrors?.title}
      />

      <FormField
        label="Description"
        name="description"
        defaultValue={defaults?.description ?? ""}
        placeholder="Optional description"
        error={state.fieldErrors?.description}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField
          label="Total Amount ($)"
          name="totalAmount"
          type="number"
          required
          defaultValue={defaults?.totalAmount}
          placeholder="10000.00"
          error={state.fieldErrors?.totalAmount}
          helpText="Split across lots by entitlement share."
        />

        <FormField
          label="Due Date"
          name="dueDate"
          type="date"
          required
          defaultValue={defaults?.dueDate}
          error={state.fieldErrors?.dueDate}
        />
      </div>

      <SelectField
        label="Levy Type"
        name="levyType"
        required
        defaultValue={defaults?.levyType ?? "ORDINARY"}
        options={[
          { value: "ORDINARY", label: "Ordinary" },
          { value: "SPECIAL", label: "Special" },
        ]}
        error={state.fieldErrors?.levyType}
      />

      <Button type="submit" disabled={isPending}>
        {isPending
          ? mode === "create"
            ? "Creating..."
            : "Saving..."
          : mode === "create"
            ? "Create Levy"
            : "Save Changes"}
      </Button>
    </form>
  );
}
