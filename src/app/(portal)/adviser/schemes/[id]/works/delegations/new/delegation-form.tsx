"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  FormField,
  TextareaField,
  SelectField,
} from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import {
  createDelegation,
  type ActionResult,
} from "@/lib/actions/works";

type MemberOption = {
  id: string;
  name: string;
};

const authorityTypes = [
  { value: "", label: "Select authority type" },
  { value: "REQUEST", label: "Raise Request" },
  { value: "INVITE_QUOTATIONS", label: "Invite Quotations" },
  { value: "RECOMMEND", label: "Recommend" },
  { value: "APPROVE_EXPENDITURE", label: "Approve Expenditure" },
  { value: "SIGN_CONTRACT", label: "Sign Contract" },
  { value: "CERTIFY_MILESTONE", label: "Certify Milestone" },
  { value: "APPROVE_PAYMENT", label: "Approve Payment" },
  { value: "RELEASE_PAYMENT", label: "Release Payment" },
];

export function DelegationForm({
  schemeId,
  members,
}: {
  schemeId: string;
  members: MemberOption[];
}) {
  const router = useRouter();

  const wrappedAction = async (
    _prev: ActionResult,
    formData: FormData,
  ): Promise<ActionResult> => {
    return createDelegation(formData);
  };

  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    wrappedAction,
    { error: null },
  );

  useEffect(() => {
    if (state.success) {
      router.push(`/adviser/schemes/${schemeId}/works/approvals`);
    }
  }, [state.success, router, schemeId]);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="schemeId" value={schemeId} />

      {state.error && (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-700">{state.error}</p>
        </div>
      )}

      <SelectField
        label="Delegate To"
        name="delegatedToId"
        required
        options={[
          { value: "", label: "Select a team member" },
          ...members.map((m) => ({ value: m.id, label: m.name })),
        ]}
      />

      <SelectField
        label="Authority Type"
        name="authorityType"
        required
        options={authorityTypes}
      />

      <FormField
        label="Maximum Amount ($)"
        name="maxAmount"
        type="number"
        step="0.01"
        placeholder="e.g. 10000"
        helpText="Leave empty for unlimited authority"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField
          label="Start Date"
          name="startDate"
          type="date"
          required
        />

        <FormField
          label="End Date"
          name="endDate"
          type="date"
          helpText="Leave empty for no expiry"
        />
      </div>

      <TextareaField
        label="Conditions"
        name="conditions"
        rows={3}
        placeholder="Any specific conditions or limitations for this delegation..."
      />

      <div className="flex items-center gap-3 pt-2 border-t border-line">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creating..." : "Create Delegation"}
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
