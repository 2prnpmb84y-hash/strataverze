"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormField, SelectField } from "@/components/ui/form-field";
import { Card } from "@/components/ui/card";
import {
  createSchemeAction,
  updateSchemeAction,
  type SchemeFormState,
} from "./actions";

const STATES = [
  { value: "VIC", label: "Victoria" },
  { value: "NSW", label: "New South Wales" },
  { value: "QLD", label: "Queensland" },
  { value: "SA", label: "South Australia" },
  { value: "WA", label: "Western Australia" },
  { value: "TAS", label: "Tasmania" },
  { value: "NT", label: "Northern Territory" },
  { value: "ACT", label: "Australian Capital Territory" },
];

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
}: {
  mode: "create" | "edit";
  schemeId?: string;
  defaults?: SchemeDefaults;
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
          <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
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
            name="planNumber"
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
            required
            defaultValue={defaults?.address}
            placeholder="e.g. 42 Collins Street"
            error={state.fieldErrors?.address}
            className="sm:col-span-2"
          />

          <FormField
            label="Suburb"
            name="suburb"
            required
            defaultValue={defaults?.suburb}
            placeholder="e.g. Melbourne"
            error={state.fieldErrors?.suburb}
          />

          <div className="grid grid-cols-2 gap-4">
            <SelectField
              label="State"
              name="state"
              required
              defaultValue={defaults?.state ?? "VIC"}
              options={STATES}
              error={state.fieldErrors?.state}
            />
            <FormField
              label="Postcode"
              name="postcode"
              required
              defaultValue={defaults?.postcode}
              placeholder="3000"
              error={state.fieldErrors?.postcode}
            />
          </div>

          <FormField
            label="Total Lots"
            name="totalLots"
            type="number"
            required
            defaultValue={defaults?.totalLots}
            placeholder="e.g. 24"
            error={state.fieldErrors?.totalLots}
          />

          <FormField
            label="Total Entitlement"
            name="totalEntitlement"
            type="number"
            required
            defaultValue={defaults?.totalEntitlement}
            placeholder="e.g. 1000"
            helpText="Sum of all lot entitlements"
            error={state.fieldErrors?.totalEntitlement}
          />

          <FormField
            label="Financial Year End"
            name="financialYearEnd"
            defaultValue={defaults?.financialYearEnd ?? "06-30"}
            placeholder="MM-DD"
            helpText="Month-day format, e.g. 06-30 for 30 June"
            error={state.fieldErrors?.financialYearEnd}
          />
        </div>

        <div className="flex items-center justify-end gap-3 mt-8 pt-6 border-t border-border">
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
