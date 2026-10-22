"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormField, SelectField, TextareaField } from "@/components/ui/form-field";
import { createSpecialLevyAction, type ActionState } from "../../../actions";

export function SpecialLevyForm({
  schemeId,
  funds,
}: {
  schemeId: string;
  funds: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createSpecialLevyAction.bind(null, schemeId),
    {},
  );

  useEffect(() => {
    const newId = state.success ? (state.data?.id as string | undefined) : undefined;
    if (newId) router.push(`/adviser/schemes/${schemeId}/finance/levies/${newId}`);
  }, [state, router, schemeId]);

  return (
    <form action={formAction} className="space-y-6">
      {state.error && (
        <div role="alert" className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}
      <FormField
        label="Title"
        name="title"
        required
        placeholder="e.g. Façade remediation"
        error={state.fieldErrors?.title}
      />
      <TextareaField
        label="Purpose"
        name="description"
        placeholder="What the special levy is for, as resolved"
      />
      <SelectField
        label="Fund"
        name="fundId"
        required
        options={[{ value: "", label: "Select a fund..." }, ...funds.map((f) => ({ value: f.id, label: f.name }))]}
        error={state.fieldErrors?.fundId}
      />
      <FormField
        label="Total amount ($)"
        name="amount"
        type="number"
        step="0.01"
        required
        placeholder="0.00"
        helpText="Levied on every lot in proportion to unit entitlement."
        error={state.fieldErrors?.amount}
      />
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <FormField
          label="Resolution date"
          name="resolutionDate"
          type="date"
          required
          helpText="Date of the general meeting that resolved the special levy."
          error={state.fieldErrors?.resolutionDate}
        />
        <FormField
          label="Due date"
          name="dueDate"
          type="date"
          required
          error={state.fieldErrors?.dueDate}
        />
      </div>
      <p className="text-sm text-ink-muted">
        Creating the special levy does not issue anything. You will see the amount for each lot and
        issue the notices on the next screen.
      </p>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating..." : "Create Special Levy"}
      </Button>
    </form>
  );
}
