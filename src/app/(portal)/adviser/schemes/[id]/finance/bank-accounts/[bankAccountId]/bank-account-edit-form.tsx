"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  FormField,
  SelectField,
  CheckboxField,
} from "@/components/ui/form-field";
import { updateBankAccountAction, ActionState } from "../../actions";

const accountTypeOptions = [
  { value: "OPERATING", label: "Operating Account" },
  { value: "TRUST", label: "Trust Account" },
];

interface Props {
  schemeId: string;
  bankAccountId: string;
  defaultValues: {
    bankName: string;
    accountName: string;
    bsb: string;
    accountNumber: string;
    accountType: string;
    isOperating: boolean;
  };
}

export function BankAccountEditForm({
  schemeId,
  bankAccountId,
  defaultValues,
}: Props) {
  const router = useRouter();
  const action = updateBankAccountAction.bind(null, schemeId, bankAccountId);
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    action,
    {},
  );

  useEffect(() => {
    if (state.success) {
      router.push(`/adviser/schemes/${schemeId}/finance/bank-accounts`);
    }
  }, [state.success, router, schemeId]);

  return (
    <form action={formAction} className="space-y-6">
      {state.error && (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      {/* Read-only identifiers */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">
            BSB
          </label>
          <div className="rounded-[var(--radius-card)] border border-line bg-muted px-3 py-2.5 text-sm text-ink-muted">
            {defaultValues.bsb || "—"}
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            Cannot be changed after creation
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">
            Account Number
          </label>
          <div className="rounded-[var(--radius-card)] border border-line bg-muted px-3 py-2.5 text-sm text-ink-muted">
            {defaultValues.accountNumber || "—"}
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            Cannot be changed after creation
          </p>
        </div>
      </div>

      {/* Editable fields */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <FormField
          label="Bank Name"
          name="bankName"
          type="text"
          required
          defaultValue={defaultValues.bankName}
          placeholder="e.g. Commonwealth Bank"
          error={state.fieldErrors?.bankName}
        />
        <FormField
          label="Account Name"
          name="accountName"
          type="text"
          required
          defaultValue={defaultValues.accountName}
          placeholder="e.g. Strata Trust Account"
          error={state.fieldErrors?.accountName}
        />
      </div>

      <SelectField
        label="Account Type"
        name="accountType"
        required
        defaultValue={defaultValues.accountType}
        options={accountTypeOptions}
        error={state.fieldErrors?.accountType}
      />

      <CheckboxField
        label="Primary Operating Account"
        name="isOperating"
        defaultChecked={defaultValues.isOperating}
        helpText="Mark this as the scheme's main operating account"
      />

      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
