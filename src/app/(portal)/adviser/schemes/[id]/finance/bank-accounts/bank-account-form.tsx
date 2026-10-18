"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  FormField,
  SelectField,
  CheckboxField,
} from "@/components/ui/form-field";
import { createBankAccountAction, ActionState } from "../actions";

const accountTypeOptions = [
  { value: "OPERATING", label: "Operating Account" },
  { value: "TRUST", label: "Trust Account" },
];

export function BankAccountForm({ schemeId }: { schemeId: string }) {
  const action = createBankAccountAction.bind(null, schemeId);
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    action,
    {},
  );

  return (
    <form action={formAction} className="space-y-6">
      {state.error && (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <FormField
          label="Bank Name"
          name="bankName"
          type="text"
          required
          placeholder="e.g. Commonwealth Bank"
          error={state.fieldErrors?.bankName}
        />
        <FormField
          label="Account Name"
          name="accountName"
          type="text"
          required
          placeholder="e.g. Strata Trust Account"
          error={state.fieldErrors?.accountName}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <FormField
          label="BSB"
          name="bsb"
          type="text"
          required
          placeholder="NNN-NNN"
          helpText="Six digits in NNN-NNN format"
          error={state.fieldErrors?.bsb}
        />
        <FormField
          label="Account Number"
          name="accountNumber"
          type="text"
          required
          error={state.fieldErrors?.accountNumber}
        />
      </div>

      <SelectField
        label="Account Type"
        name="accountType"
        required
        options={accountTypeOptions}
        error={state.fieldErrors?.accountType}
      />

      <CheckboxField
        label="Primary Operating Account"
        name="isOperating"
        helpText="Mark this as the scheme's main operating account"
      />

      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creating..." : "Create Bank Account"}
        </Button>
      </div>
    </form>
  );
}
