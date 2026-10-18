"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  FormField,
} from "@/components/ui/form-field";
import { createFinancialSupplierAction, ActionState } from "../actions";

export function SupplierForm({ schemeId }: { schemeId: string }) {
  const action = createFinancialSupplierAction.bind(null, schemeId);
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
          label="Company Name"
          name="companyName"
          type="text"
          required
          placeholder="e.g. ABC Plumbing Pty Ltd"
          error={state.fieldErrors?.companyName}
        />
        <FormField
          label="Trading Name"
          name="tradingName"
          type="text"
          placeholder="e.g. ABC Plumbing"
          error={state.fieldErrors?.tradingName}
        />
      </div>

      <FormField
        label="ABN"
        name="abn"
        type="text"
        placeholder="e.g. 12 345 678 901"
        helpText="Australian Business Number"
        error={state.fieldErrors?.abn}
      />

      <FormField
        label="Contact Name"
        name="contactName"
        type="text"
        placeholder="e.g. John Smith"
        error={state.fieldErrors?.contactName}
      />

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <FormField
          label="Email"
          name="email"
          type="email"
          placeholder="e.g. accounts@example.com"
          error={state.fieldErrors?.email}
        />
        <FormField
          label="Phone"
          name="phone"
          type="tel"
          placeholder="e.g. 02 9876 5432"
          error={state.fieldErrors?.phone}
        />
      </div>

      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink pt-2">
        Bank Details
      </h3>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <FormField
          label="BSB"
          name="bankBsb"
          type="text"
          placeholder="NNN-NNN"
          helpText="Six digits in NNN-NNN format"
          error={state.fieldErrors?.bankBsb}
        />
        <FormField
          label="Account Number"
          name="bankAccountNumber"
          type="text"
          error={state.fieldErrors?.bankAccountNumber}
        />
      </div>

      <FormField
        label="Account Name"
        name="bankAccountName"
        type="text"
        placeholder="e.g. ABC Plumbing Pty Ltd"
        error={state.fieldErrors?.bankAccountName}
      />

      <FormField
        label="Payment Terms (days)"
        name="paymentTerms"
        type="number"
        defaultValue="30"
        helpText="Days until payment is due"
        error={state.fieldErrors?.paymentTerms}
      />

      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creating..." : "Create Supplier"}
        </Button>
      </div>
    </form>
  );
}
