"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormField, SelectField } from "@/components/ui/form-field";
import { Card } from "@/components/ui/card";
import {
  createLotAction,
  updateLotAction,
  type LotFormState,
} from "./actions";
import type { SeparateEntitlement } from "@/lib/jurisdiction/building-data";

const LOT_TYPES = [
  { value: "RESIDENTIAL", label: "Residential" },
  { value: "COMMERCIAL", label: "Commercial" },
  { value: "PARKING", label: "Parking" },
  { value: "STORAGE", label: "Storage" },
  { value: "COMMON", label: "Common Property" },
];

type LotDefaults = {
  lotNumber?: string;
  unitNumber?: string | null;
  entitlement?: number;
  interestScheduleEntitlement?: number | null;
  floorArea?: number | null;
  lotType?: string;
};

export function LotForm({
  mode,
  schemeId,
  lotId,
  defaults,
  lockStructure = false,
  entitlementWords,
  separate = null,
}: {
  mode: "create" | "edit";
  schemeId: string;
  lotId?: string;
  defaults?: LotDefaults;
  /** Lot number and unit entitlement are locked (24 Oct): StrataVerze only. */
  lockStructure?: boolean;
  /**
   * The pack's label and help for each lot's entitlement, from the server page
   * (stage 2, step 10). Null keeps the words this form has always shown.
   */
  entitlementWords?: { label: string | null; help: string | null };
  /**
   * The second schedule the building's lots hold (Queensland's interest
   * schedule), from the server page, or null (NSW). Locked like the unit
   * entitlement, and required for a new lot.
   */
  separate?: SeparateEntitlement | null;
}) {
  const action =
    mode === "create"
      ? createLotAction.bind(null, schemeId)
      : updateLotAction.bind(null, schemeId, lotId!);

  const [state, formAction, isPending] = useActionState<
    LotFormState,
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
            label="Lot Number"
            name="lotNumber"
            readOnly={lockStructure}
            required
            defaultValue={defaults?.lotNumber}
            placeholder="e.g. 1"
            error={state.fieldErrors?.lotNumber}
          />

          <FormField
            label="Unit No."
            name="unitNumber"
            defaultValue={defaults?.unitNumber ?? ""}
            placeholder="e.g. 101"
            helpText="Optional unit or apartment number"
            error={state.fieldErrors?.unitNumber}
          />

          <FormField
            label={entitlementWords?.label ?? "Unit Entitlement"}
            name="entitlement"
            readOnly={lockStructure}
            type="number"
            required
            defaultValue={defaults?.entitlement}
            placeholder="e.g. 50"
            helpText={entitlementWords?.help ?? "Lot entitlement within the scheme"}
            error={state.fieldErrors?.entitlement}
          />

          {separate?.field && (
            <FormField
              label={separate.label}
              name={separate.field}
              readOnly={lockStructure}
              type="number"
              required={mode === "create"}
              defaultValue={defaults?.interestScheduleEntitlement ?? ""}
              placeholder="e.g. 50"
              helpText={separate.help ?? undefined}
              error={state.fieldErrors?.[separate.field]}
            />
          )}

          <FormField
            label="Floor Area (m²)"
            name="floorArea"
            type="number"
            step="0.01"
            defaultValue={defaults?.floorArea ?? ""}
            placeholder="e.g. 85"
            helpText="Optional"
            error={state.fieldErrors?.floorArea}
          />

          <SelectField
            label="Lot Type"
            name="lotType"
            defaultValue={defaults?.lotType ?? "RESIDENTIAL"}
            options={LOT_TYPES}
            error={state.fieldErrors?.lotType}
          />
        </div>

        <div className="flex items-center justify-end gap-3 mt-8 pt-6 border-t border-line">
          <Button variant="secondary" href={`/adviser/schemes/${schemeId}`}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending
              ? mode === "create"
                ? "Adding…"
                : "Saving…"
              : mode === "create"
                ? "Add Lot"
                : "Save Changes"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
