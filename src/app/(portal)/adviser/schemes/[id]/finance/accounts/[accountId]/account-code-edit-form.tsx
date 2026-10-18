"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  FormField,
  SelectField,
  CheckboxField,
  TextareaField,
} from "@/components/ui/form-field";
import { updateAccountCodeAction, ActionState } from "../../actions";

const ACCOUNT_TYPE_OPTIONS = [
  { value: "ASSET", label: "Asset" },
  { value: "LIABILITY", label: "Liability" },
  { value: "EQUITY", label: "Equity" },
  { value: "INCOME", label: "Income" },
  { value: "EXPENSE", label: "Expense" },
];

interface AccountCodeEditFormProps {
  schemeId: string;
  accountCodeId: string;
  funds: { id: string; name: string }[];
  defaultValues: {
    code: string;
    name: string;
    accountType: string;
    accountSubType: string;
    fundId: string;
    gstApplicable: boolean;
    description: string;
    isSystemAccount: boolean;
  };
}

export function AccountCodeEditForm({
  schemeId,
  accountCodeId,
  funds,
  defaultValues,
}: AccountCodeEditFormProps) {
  const router = useRouter();
  const action = updateAccountCodeAction.bind(null, schemeId, accountCodeId);
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    action,
    {},
  );

  useEffect(() => {
    if (state.success) {
      router.push(`/adviser/schemes/${schemeId}/finance/accounts`);
    }
  }, [state.success, router, schemeId]);

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
        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">
            Account Code
          </label>
          <p className="rounded-[var(--radius-card)] border border-line bg-muted px-3 py-2.5 text-sm text-ink-muted font-mono">
            {defaultValues.code}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            Account codes cannot be changed
          </p>
        </div>
        <FormField
          label="Account Name"
          name="name"
          type="text"
          required
          defaultValue={defaultValues.name}
          placeholder="e.g. Administration Fund Bank Account"
          error={state.fieldErrors?.name}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {defaultValues.isSystemAccount ? (
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">
              Account Type
            </label>
            <p className="rounded-[var(--radius-card)] border border-line bg-muted px-3 py-2.5 text-sm text-ink-muted">
              {defaultValues.accountType}
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              System account types cannot be changed
            </p>
          </div>
        ) : (
          <SelectField
            label="Account Type"
            name="accountType"
            required
            defaultValue={defaultValues.accountType}
            options={ACCOUNT_TYPE_OPTIONS}
            error={state.fieldErrors?.accountType}
          />
        )}
        <FormField
          label="Sub-type"
          name="accountSubType"
          type="text"
          defaultValue={defaultValues.accountSubType}
          placeholder="e.g. BANK, ACCOUNTS_RECEIVABLE"
          helpText="Optional classification within the account type"
          error={state.fieldErrors?.accountSubType}
        />
      </div>

      <SelectField
        label="Fund"
        name="fundId"
        defaultValue={defaultValues.fundId}
        options={fundOptions}
        error={state.fieldErrors?.fundId}
      />

      <CheckboxField
        label="GST Applicable"
        name="gstApplicable"
        defaultChecked={defaultValues.gstApplicable}
        helpText="Transactions on this account attract GST"
      />

      <TextareaField
        label="Description"
        name="description"
        defaultValue={defaultValues.description}
        placeholder="Optional notes about this account"
        rows={3}
      />

      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
