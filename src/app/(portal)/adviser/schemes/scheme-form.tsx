"use client";

import { useActionState } from "react";
import type { LotWords } from "@/lib/jurisdiction/screen-words";
import { Button } from "@/components/ui/button";
import { FormField, SelectField } from "@/components/ui/form-field";
import { Card } from "@/components/ui/card";
import { currentYearEnd } from "@/lib/onboarding/property-onboarding";
import {
  createSchemeAction,
  updateSchemeAction,
  type SchemeFormState,
} from "./actions";
import { DEFAULT_SCHEME_STATE, SCHEME_STATE_HELP, SCHEME_STATE_OPTIONS, STATE_NAMES, type AustralianState } from "@/config/jurisdictions";

/**
 * The state choices: the supported states, plus a building's stored state if
 * it is another one, so an older record shows and keeps its real state.
 */
function stateOptions(stored: string | undefined) {
  if (!stored || SCHEME_STATE_OPTIONS.some((o) => o.value === stored)) return SCHEME_STATE_OPTIONS;
  return [...SCHEME_STATE_OPTIONS, { value: stored, label: STATE_NAMES[stored as AustralianState] ?? stored }];
}

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
  words,
  mode,
  schemeId,
  defaults,
  lockCore = false,
  today,
}: {
  /** The building's words, from its rule pack: the entitlement (lotWordsFor) and the plan number's name (planNumberLabel). */
  words: Pick<LotWords, "entitlement" | "entitlementLabel"> & { planNumber: string };
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
            label={words.planNumber}
            helpText={lockCore ? "Locked. Only StrataVerze can change the plan number, address, lots and entitlement." : undefined}
            name="planNumber"
            readOnly={lockCore}
            required
            defaultValue={defaults?.planNumber}
            placeholder={words.planNumber === "Plan Number" ? "e.g. SP 12345" : "e.g. 12345"}
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
            placeholder="e.g. 42 Macquarie Street"
            error={state.fieldErrors?.address}
            className="sm:col-span-2"
          />

          <FormField
            label="Suburb"
            name="suburb"
            readOnly={lockCore}
            required
            defaultValue={defaults?.suburb}
            placeholder="e.g. Sydney"
            error={state.fieldErrors?.suburb}
          />

          <div className="grid grid-cols-2 gap-4">
            <SelectField
              label="State"
              name="state"
            readOnly={lockCore}
              required
              defaultValue={defaults?.state ?? DEFAULT_SCHEME_STATE}
              options={stateOptions(defaults?.state)}
              helpText={SCHEME_STATE_HELP}
              error={state.fieldErrors?.state}
            />
            <FormField
              label="Postcode"
              name="postcode"
            readOnly={lockCore}
              required
              defaultValue={defaults?.postcode}
              placeholder="2000"
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
            label={`Total ${words.entitlement}`}
            name="totalEntitlement"
            readOnly={lockCore}
            type="number"
            required
            defaultValue={defaults?.totalEntitlement}
            placeholder="e.g. 1000"
            helpText={`The aggregate ${words.entitlementLabel.toLowerCase()}: the lots' ${words.entitlementLabel.toLowerCase()}s add up to it`}
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
