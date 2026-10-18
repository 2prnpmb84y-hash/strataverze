"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormField, SelectField } from "@/components/ui/form-field";
import { createLevyScheduleAction, ActionState } from "../actions";

const FREQUENCY_OPTIONS = [
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "HALF_YEARLY", label: "Half-Yearly" },
  { value: "ANNUALLY", label: "Annually" },
];

interface LevyScheduleFormProps {
  schemeId: string;
  funds: { id: string; name: string }[];
}

export function LevyScheduleForm({ schemeId, funds }: LevyScheduleFormProps) {
  const action = createLevyScheduleAction.bind(null, schemeId);
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    action,
    {},
  );

  const fundOptions = [
    { value: "", label: "Select a fund..." },
    ...funds.map((f) => ({ value: f.id, label: f.name })),
  ];

  return (
    <form action={formAction} className="space-y-6">
      {state.error && (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <SelectField
        label="Fund"
        name="fundId"
        required
        options={fundOptions}
        error={state.fieldErrors?.fundId}
      />

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <FormField
          label="Financial Year"
          name="financialYear"
          type="number"
          required
          placeholder="e.g. 2025"
          helpText="The financial year starting July 1"
          error={state.fieldErrors?.financialYear}
        />

        <SelectField
          label="Levy Frequency"
          name="frequency"
          required
          defaultValue="QUARTERLY"
          options={FREQUENCY_OPTIONS}
          error={state.fieldErrors?.frequency}
        />
      </div>

      <FormField
        label="Budget Amount ($)"
        name="budgetAmount"
        type="number"
        required
        placeholder="0.00"
        helpText="Total budget for this levy schedule"
        error={state.fieldErrors?.budgetAmount}
      />

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <FormField
          label="Total Lots"
          name="totalLots"
          type="number"
          required
          placeholder="e.g. 24"
          helpText="Number of lots in the scheme"
          error={state.fieldErrors?.totalLots}
        />

        <FormField
          label="Total Entitlement"
          name="totalEntitlement"
          type="number"
          required
          placeholder="e.g. 100"
          helpText="Sum of all lot entitlements (unit entitlements)"
          error={state.fieldErrors?.totalEntitlement}
        />
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Creating..." : "Create Levy Schedule"}
      </Button>
    </form>
  );
}
