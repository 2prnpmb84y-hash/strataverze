"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormField, SelectField } from "@/components/ui/form-field";
import {
  createFundAction,
  updateFundAction,
  type FundFormState,
} from "./actions";
import { ledgerFundDefinition, type FundCatalogue } from "@/lib/jurisdiction/funds";

/** `catalogue`: the building's FUND_CATALOGUE, from the server page, which names its funds. */
export function FundForm({
  schemeId,
  mode,
  fundId,
  catalogue,
  defaults,
}: {
  schemeId: string;
  mode: "create" | "edit";
  fundId?: string;
  catalogue: FundCatalogue;
  defaults?: {
    name: string;
    fundType: string;
    balance: number;
  };
}) {
  const adminLabel = ledgerFundDefinition(catalogue, "ADMINISTRATIVE").label;
  const fundTypeOptions = [
    { value: "ADMINISTRATIVE", label: adminLabel },
    { value: "CAPITAL_WORKS", label: ledgerFundDefinition(catalogue, "CAPITAL_WORKS").label },
    { value: "SPECIAL", label: "Special Fund" },
  ];

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
        placeholder={`e.g. ${adminLabel}`}
        error={state.fieldErrors?.name}
      />

      <div className="grid grid-cols-2 gap-4">
        <SelectField
          label="Fund Type"
          name="fundType"
          required
          defaultValue={defaults?.fundType ?? "ADMINISTRATIVE"}
          options={fundTypeOptions}
          error={state.fieldErrors?.fundType}
        />

        {/* A fund's balance comes from the ledger (opening balances at takeover,
            then every posting), so it is not typed in here (review B2). */}
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
