"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormField, SelectField } from "@/components/ui/form-field";
import {
  createFundAction,
  updateFundAction,
  type FundFormState,
} from "./actions";

const fundTypeOptions = [
  { value: "ADMIN", label: "Administrative Fund" },
  { value: "SINKING", label: "Capital Works Fund" },
  { value: "RESERVE", label: "Reserve Fund" },
];

export function FundForm({
  schemeId,
  mode,
  fundId,
  defaults,
}: {
  schemeId: string;
  mode: "create" | "edit";
  fundId?: string;
  defaults?: {
    name: string;
    fundType: string;
    balance: number;
  };
}) {
  const action =
    mode === "create"
      ? createFundAction.bind(null, schemeId)
      : updateFundAction.bind(null, schemeId, fundId!);

  const [state, formAction, isPending] = useActionState<
    FundFormState,
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
        label="Fund Name"
        name="name"
        required
        defaultValue={defaults?.name}
        placeholder="e.g. Administrative Fund"
        error={state.fieldErrors?.name}
      />

      <div className="grid grid-cols-2 gap-4">
        <SelectField
          label="Fund Type"
          name="fundType"
          required
          defaultValue={defaults?.fundType ?? "ADMIN"}
          options={fundTypeOptions}
          error={state.fieldErrors?.fundType}
        />

        <FormField
          label="Balance"
          name="balance"
          type="number"
          step="0.01"
          defaultValue={defaults?.balance ?? 0}
          placeholder="0.00"
          error={state.fieldErrors?.balance}
          helpText="Opening balance in dollars."
        />
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending
          ? mode === "create"
            ? "Creating..."
            : "Saving..."
          : mode === "create"
            ? "Create Fund"
            : "Save Changes"}
      </Button>
    </form>
  );
}
