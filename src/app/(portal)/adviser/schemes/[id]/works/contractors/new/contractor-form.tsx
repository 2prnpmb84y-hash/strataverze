"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  FormField,
  TextareaField,
  CheckboxField,
} from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import {
  createContractorBusiness,
  updateContractorBusiness,
  type ActionResult,
} from "@/lib/actions/works";

type ContractorData = {
  id: string;
  companyName: string;
  tradingName: string | null;
  abn: string | null;
  acn: string | null;
  registeredAddress: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  tradeCategories: string[];
  gstRegistered: boolean;
  notes: string | null;
};

export function ContractorForm({
  schemeId,
  contractor,
}: {
  schemeId: string;
  contractor?: ContractorData;
}) {
  const router = useRouter();
  const isEditing = !!contractor;

  const wrappedAction = async (
    _prev: ActionResult,
    formData: FormData,
  ): Promise<ActionResult> => {
    if (isEditing) {
      return updateContractorBusiness(formData);
    }
    return createContractorBusiness(formData);
  };

  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    wrappedAction,
    { error: null },
  );

  useEffect(() => {
    if (state.success) {
      router.push(`/adviser/schemes/${schemeId}/works/contractors`);
    }
  }, [state.success, router, schemeId]);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {isEditing && (
        <input type="hidden" name="contractorId" value={contractor.id} />
      )}

      {state.error && (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-700">{state.error}</p>
        </div>
      )}

      <FormField
        label="Company Name"
        name="companyName"
        required
        defaultValue={contractor?.companyName}
        placeholder="Legal company name"
      />

      <FormField
        label="Trading Name"
        name="tradingName"
        defaultValue={contractor?.tradingName ?? ""}
        placeholder="Trading or brand name (if different)"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField
          label="ABN"
          name="abn"
          defaultValue={contractor?.abn ?? ""}
          placeholder="11 digit ABN"
          helpText="Australian Business Number"
        />

        <FormField
          label="ACN"
          name="acn"
          defaultValue={contractor?.acn ?? ""}
          placeholder="9 digit ACN"
          helpText="Australian Company Number"
        />
      </div>

      <FormField
        label="Registered Address"
        name="registeredAddress"
        defaultValue={contractor?.registeredAddress ?? ""}
        placeholder="Full registered business address"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField
          label="Phone"
          name="phone"
          type="tel"
          defaultValue={contractor?.phone ?? ""}
          placeholder="e.g. 02 9123 4567"
        />

        <FormField
          label="Email"
          name="email"
          type="email"
          defaultValue={contractor?.email ?? ""}
          placeholder="accounts@example.com.au"
        />
      </div>

      <FormField
        label="Website"
        name="website"
        defaultValue={contractor?.website ?? ""}
        placeholder="https://www.example.com.au"
      />

      <FormField
        label="Trade Categories"
        name="tradeCategories"
        defaultValue={contractor?.tradeCategories?.join(", ") ?? ""}
        placeholder="e.g. Plumbing, Electrical, Fire Safety"
        helpText="Comma-separated list of trades"
      />

      <CheckboxField
        label="GST Registered"
        name="gstRegistered"
        defaultChecked={contractor?.gstRegistered ?? false}
        helpText="Is this contractor registered for GST?"
      />

      <TextareaField
        label="Notes"
        name="notes"
        defaultValue={contractor?.notes ?? ""}
        rows={3}
        placeholder="Additional notes about this contractor..."
      />

      <div className="flex items-center gap-3 pt-2 border-t border-line">
        <Button type="submit" disabled={isPending}>
          {isPending
            ? isEditing
              ? "Saving..."
              : "Registering..."
            : isEditing
              ? "Save Changes"
              : "Register Contractor"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
