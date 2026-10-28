"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormField, SelectField } from "@/components/ui/form-field";
import { createLevyScheduleAction, ActionState } from "../actions";
import type { LevyFormWords } from "@/lib/jurisdiction/screen-words";

const upper = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

const FREQUENCY_OPTIONS = [
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "HALF_YEARLY", label: "Half-Yearly" },
  { value: "ANNUALLY", label: "Annually" },
];

interface LevyScheduleFormProps {
  schemeId: string;
  funds: { id: string; name: string }[];
  /** The scheme's totals from the strata plan, used as defaults. */
  totalLots?: number;
  totalEntitlement?: number;
  /** The building's words, from its rule pack through the server page (levyFormWords). */
  words: Pick<LevyFormWords, "levy" | "entitlement" | "plan">;
}

export function LevyScheduleForm({ schemeId, funds, totalLots, totalEntitlement, words }: LevyScheduleFormProps) {
  const router = useRouter();
  const action = createLevyScheduleAction.bind(null, schemeId);
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    action,
    {},
  );

  useEffect(() => {
    const newId = state.success ? (state.data?.id as string | undefined) : undefined;
    if (newId) router.push(`/adviser/schemes/${schemeId}/finance/levies/${newId}`);
  }, [state, router, schemeId]);

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
          label={`${upper(words.levy)} Frequency`}
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
        step="0.01"
        required
        placeholder="0.00"
        helpText={`Total budget for this ${words.levy} schedule`}
        error={state.fieldErrors?.budgetAmount}
      />

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <FormField
          label="Total Lots"
          name="totalLots"
          type="number"
          required
          placeholder="e.g. 24"
          defaultValue={totalLots}
          helpText="Number of lots in the scheme"
          error={state.fieldErrors?.totalLots}
        />

        <FormField
          label="Total Entitlement"
          name="totalEntitlement"
          type="number"
          required
          placeholder="e.g. 100"
          defaultValue={totalEntitlement}
          helpText={`Aggregate ${words.entitlement} in the ${words.plan}`}
          error={state.fieldErrors?.totalEntitlement}
        />
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Creating..." : `Create ${upper(words.levy)} Schedule`}
      </Button>
    </form>
  );
}
