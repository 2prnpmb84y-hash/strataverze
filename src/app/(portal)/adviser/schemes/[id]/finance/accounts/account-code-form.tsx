"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  FormField,
  SelectField,
  CheckboxField,
  TextareaField,
} from "@/components/ui/form-field";
import { createAccountCodeAction, ActionState } from "../actions";

const ACCOUNT_TYPE_OPTIONS = [
  { value: "ASSET", label: "Asset" },
  { value: "LIABILITY", label: "Liability" },
  { value: "EQUITY", label: "Equity" },
  { value: "INCOME", label: "Income" },
  { value: "EXPENSE", label: "Expense" },
];

interface AccountCodeFormProps {
  schemeId: string;
  funds: { id: string; name: string }[];
}

export function AccountCodeForm({ schemeId, funds }: AccountCodeFormProps) {
  const action = createAccountCodeAction.bind(null, schemeId);
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    action,
    {},
  );

  const fundOptions = [
    { value: "", label: "No specific fund" },
    ...funds.map((f) => ({ value: f.id, label: f.name })),
  ];

  return (
    <form action={formAction} className="space-y-6">
      {state.error && (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <FormField
          label="Account Code"
          name="code"
          type="text"
          required
          placeholder="e.g. 1-1100"
          helpText="Unique code for this account"
          error={state.fieldErrors?.code}
        />
        <FormField
          label="Account Name"
          name="name"
          type="text"
          required
          placeholder="e.g. Administration Fund Bank Account"
          error={state.fieldErrors?.name}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <SelectField
          label="Account Type"
          name="accountType"
          required
          options={ACCOUNT_TYPE_OPTIONS}
          error={state.fieldErrors?.accountType}
        />
        <FormField
          label="Sub-type"
          name="accountSubType"
          type="text"
          placeholder="e.g. BANK, ACCOUNTS_RECEIVABLE"
          helpText="Optional classification within the account type"
          error={state.fieldErrors?.accountSubType}
        />
      </div>

      <SelectField
        label="Fund"
        name="fundId"
        options={fundOptions}
        error={state.fieldErrors?.fundId}
      />

      <CheckboxField
        label="GST Applicable"
        name="gstApplicable"
        helpText="Transactions on this account attract GST"
      />

      <TextareaField
        label="Description"
        name="description"
        placeholder="Optional notes about this account"
        rows={3}
      />

      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creating..." : "Create Account Code"}
        </Button>
      </div>
    </form>
  );
}
