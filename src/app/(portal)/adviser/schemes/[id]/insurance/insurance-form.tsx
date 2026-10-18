"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormField, SelectField } from "@/components/ui/form-field";
import {
  createInsuranceAction,
  updateInsuranceAction,
  type InsuranceFormState,
} from "./actions";

const policyTypeOptions = [
  { value: "BUILDING", label: "Building" },
  { value: "PUBLIC_LIABILITY", label: "Public Liability" },
  { value: "WORKERS_COMP", label: "Workers Compensation" },
  { value: "OFFICE_BEARERS", label: "Office Bearers" },
  { value: "FIDELITY_GUARANTEE", label: "Fidelity Guarantee" },
  { value: "MACHINERY", label: "Machinery Breakdown" },
  { value: "VOLUNTARY_WORKERS", label: "Voluntary Workers" },
  { value: "OTHER", label: "Other" },
];

const statusOptions = [
  { value: "ACTIVE", label: "Active" },
  { value: "EXPIRED", label: "Expired" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "PENDING_RENEWAL", label: "Pending Renewal" },
];

export function InsurancePolicyForm({ schemeId }: { schemeId: string }) {
  const action = createInsuranceAction.bind(null, schemeId);
  const [state, formAction, isPending] = useActionState<
    InsuranceFormState,
    FormData
  >(action, {});

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      ) : null}

      <FormField
        label="Policy Number"
        name="policyNumber"
        required
        placeholder="e.g. POL-2024-001"
        error={state.fieldErrors?.policyNumber}
      />

      <SelectField
        label="Policy Type"
        name="policyType"
        required
        defaultValue="BUILDING"
        options={policyTypeOptions}
        error={state.fieldErrors?.policyType}
      />

      <FormField
        label="Insurer"
        name="insurer"
        required
        placeholder="e.g. QBE Insurance"
        error={state.fieldErrors?.insurer}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField
          label="Broker"
          name="broker"
          placeholder="Broker name (optional)"
        />
        <FormField
          label="Broker Contact"
          name="brokerContact"
          placeholder="Phone or email (optional)"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <FormField
          label="Coverage Amount ($)"
          name="coverageAmount"
          type="number"
          required
          placeholder="e.g. 5000000"
          error={state.fieldErrors?.coverageAmount}
        />
        <FormField
          label="Premium ($)"
          name="premium"
          type="number"
          required
          placeholder="e.g. 12500"
          error={state.fieldErrors?.premium}
        />
        <FormField
          label="Excess ($)"
          name="excessAmount"
          type="number"
          placeholder="e.g. 1000"
          error={state.fieldErrors?.excessAmount}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <FormField
          label="Start Date"
          name="startDate"
          type="date"
          required
          error={state.fieldErrors?.startDate}
        />
        <FormField
          label="End Date"
          name="endDate"
          type="date"
          required
          error={state.fieldErrors?.endDate}
        />
        <FormField
          label="Renewal Date"
          name="renewalDate"
          type="date"
        />
      </div>

      <div>
        <label
          htmlFor="notes"
          className="block text-sm font-medium text-ink mb-1.5"
        >
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          placeholder="Optional notes about this policy..."
          className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise transition-colors resize-y"
        />
      </div>

      <Button type="submit" variant="primary" disabled={isPending}>
        {isPending ? "Creating..." : "Create Policy"}
      </Button>
    </form>
  );
}

function formatDateForInput(isoString: string): string {
  return new Date(isoString).toISOString().split("T")[0];
}

export function InsurancePolicyEditForm({
  schemeId,
  policyId,
  defaults,
}: {
  schemeId: string;
  policyId: string;
  defaults: {
    policyNumber: string;
    policyType: string;
    insurer: string;
    broker: string | null;
    brokerContact: string | null;
    coverageAmount: string;
    premium: string;
    excessAmount: string | null;
    startDate: string;
    endDate: string;
    status: string;
    renewalDate: string | null;
    notes: string | null;
  };
}) {
  const action = updateInsuranceAction.bind(null, schemeId, policyId);
  const [state, formAction, isPending] = useActionState<
    InsuranceFormState,
    FormData
  >(action, {});

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      ) : null}

      <FormField
        label="Policy Number"
        name="policyNumber"
        required
        defaultValue={defaults.policyNumber}
        error={state.fieldErrors?.policyNumber}
      />

      <SelectField
        label="Policy Type"
        name="policyType"
        required
        defaultValue={defaults.policyType}
        options={policyTypeOptions}
        error={state.fieldErrors?.policyType}
      />

      <SelectField
        label="Status"
        name="status"
        required
        defaultValue={defaults.status}
        options={statusOptions}
        error={state.fieldErrors?.status}
      />

      <FormField
        label="Insurer"
        name="insurer"
        required
        defaultValue={defaults.insurer}
        error={state.fieldErrors?.insurer}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField
          label="Broker"
          name="broker"
          defaultValue={defaults.broker ?? ""}
          placeholder="Broker name (optional)"
        />
        <FormField
          label="Broker Contact"
          name="brokerContact"
          defaultValue={defaults.brokerContact ?? ""}
          placeholder="Phone or email (optional)"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <FormField
          label="Coverage Amount ($)"
          name="coverageAmount"
          type="number"
          required
          defaultValue={defaults.coverageAmount}
          error={state.fieldErrors?.coverageAmount}
        />
        <FormField
          label="Premium ($)"
          name="premium"
          type="number"
          required
          defaultValue={defaults.premium}
          error={state.fieldErrors?.premium}
        />
        <FormField
          label="Excess ($)"
          name="excessAmount"
          type="number"
          defaultValue={defaults.excessAmount ?? ""}
          error={state.fieldErrors?.excessAmount}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <FormField
          label="Start Date"
          name="startDate"
          type="date"
          required
          defaultValue={formatDateForInput(defaults.startDate)}
          error={state.fieldErrors?.startDate}
        />
        <FormField
          label="End Date"
          name="endDate"
          type="date"
          required
          defaultValue={formatDateForInput(defaults.endDate)}
          error={state.fieldErrors?.endDate}
        />
        <FormField
          label="Renewal Date"
          name="renewalDate"
          type="date"
          defaultValue={
            defaults.renewalDate
              ? formatDateForInput(defaults.renewalDate)
              : undefined
          }
        />
      </div>

      <div>
        <label
          htmlFor="notes"
          className="block text-sm font-medium text-ink mb-1.5"
        >
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={defaults.notes ?? ""}
          placeholder="Optional notes about this policy..."
          className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise transition-colors resize-y"
        />
      </div>

      <Button type="submit" variant="primary" disabled={isPending}>
        {isPending ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  );
}
