"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormField, SelectField } from "@/components/ui/form-field";
import { Card } from "@/components/ui/card";
import { currentYearEnd } from "@/lib/onboarding/property-onboarding";
import {
  createSchemeAction,
  updateSchemeAction,
  type SchemeFormState,
} from "./actions";
import { DEFAULT_SCHEME_STATE, SCHEME_STATE_HELP, SCHEME_STATE_OPTIONS } from "@/config/jurisdictions";

type SchemeDefaults = {
  name?: string;
  planNumber?: string;
  address?: string;
  suburb?: string;
  state?: string;
  postcode?: string;
  totalLots?: number;
  totalEntitlement?: number;
  financialYearEnd?: string;
  abnNumber?: string | null;
};

export function SchemeForm({
  mode,
  schemeId,
  defaults,
  lockCore = false,
  today,
}: {
  mode: "create" | "edit";
  schemeId?: string;
  defaults?: SchemeDefaults;
  /** The locked building record (24 Oct): only StrataVerze changes these. */
  lockCore?: boolean;
  /** Today in Sydney (YYYY-MM-DD), from the server page: shows the current year end. */
  today: string;
}) {
  const action =
    mode === "create"
      ? createSchemeAction
      : updateSchemeAction.bind(null, schemeId!);

  const [state, formAction, isPending] = useActionState<
    SchemeFormState,
    FormData
  >(action, {});

  return (
    <Card>
      <form action={formAction}>
        {state.error && (
          <div className="mb-6 rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {state.error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5">
          <FormField
            label="Scheme Name"
            name="name"
            required
            defaultValue={defaults?.name}
            placeholder="e.g. Harbour View Towers OC"
            error={state.fieldErrors?.name}
            className="sm:col-span-2"
          />

          <FormField
            label="Plan Number"
            helpText={lockCore ? "Locked. Only StrataVerze can change the plan number, address, lots and entitlement." : undefined}
            name="planNumber"
            readOnly={lockCore}
            required
            defaultValue={defaults?.planNumber}
            placeholder="e.g. PS 123456"
            error={state.fieldErrors?.planNumber}
          />

          <FormField
            label="ABN"
            name="abnNumber"
            defaultValue={defaults?.abnNumber ?? ""}
            placeholder="e.g. 12 345 678 901"
            helpText="Optional"
            error={state.fieldErrors?.abnNumber}
          />

          <FormField
            label="Street Address"
            name="address"
            readOnly={lockCore}
            required
            defaultValue={defaults?.address}
            placeholder="e.g. 42 Collins Street"
            error={state.fieldErrors?.address}
            className="sm:col-span-2"
          />

          <FormField
            label="Suburb"
            name="suburb"
            readOnly={lockCore}
            required
            defaultValue={defaults?.suburb}
            placeholder="e.g. Melbourne"
            error={state.fieldErrors?.suburb}
          />

          <div className="grid grid-cols-2 gap-4">
            <SelectField
              label="State"
              name="state"
            readOnly={lockCore}
              required
              defaultValue={defaults?.state ?? DEFAULT_SCHEME_STATE}
              options={SCHEME_STATE_OPTIONS}
              helpText={SCHEME_STATE_HELP}
              error={state.fieldErrors?.state}
            />
            <FormField
              label="Postcode"
              name="postcode"
            readOnly={lockCore}
              required
              defaultValue={defaults?.postcode}
              placeholder="3000"
              error={state.fieldErrors?.postcode}
            />
          </div>

          <FormField
            label="Total Lots"
            name="totalLots"
            readOnly={lockCore}
            type="number"
            required
            defaultValue={defaults?.totalLots}
            placeholder="e.g. 24"
            error={state.fieldErrors?.totalLots}
          />

          <FormField
            label="Total Unit Entitlement"
            name="totalEntitlement"
            readOnly={lockCore}
            type="number"
            required
            defaultValue={defaults?.totalEntitlement}
            placeholder="e.g. 1000"
            helpText="The aggregate unit entitlement: the lots' unit entitlements add up to it"
            error={state.fieldErrors?.totalEntitlement}
          />

          <FormField
            label="Financial Year End"
            name="financialYearEnd"
            type="date"
            required
            defaultValue={currentYearEnd(defaults?.financialYearEnd ?? "06-30", today)}
            helpText="The last day of the building's current financial year (day, month and year). The day and month carry forward each year."
            error={state.fieldErrors?.financialYearEnd}
          />
        </div>

        <div className="flex items-center justify-end gap-3 mt-8 pt-6 border-t border-line">
          <Button variant="secondary" href="/adviser/schemes">
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending
              ? mode === "create"
                ? "Creating…"
                : "Saving…"
              : mode === "create"
                ? "Create Scheme"
                : "Save Changes"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
