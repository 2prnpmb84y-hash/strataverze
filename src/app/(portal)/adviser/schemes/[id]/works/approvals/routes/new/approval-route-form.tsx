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
  createApprovalRoute,
  updateApprovalRoute,
  type ActionResult,
} from "@/lib/actions/works";

type RouteData = {
  id: string;
  name: string;
  description: string | null;
  minAmount: string | null;
  maxAmount: string | null;
  requiredApprovers: number;
  approverRoles: string[];
  sortOrder: number;
  isActive: boolean;
};

export function ApprovalRouteForm({
  schemeId,
  route,
}: {
  schemeId: string;
  route?: RouteData;
}) {
  const router = useRouter();
  const isEditing = !!route;

  const wrappedAction = async (
    _prev: ActionResult,
    formData: FormData,
  ): Promise<ActionResult> => {
    if (isEditing) {
      return updateApprovalRoute(formData);
    }
    return createApprovalRoute(formData);
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
      {isEditing && (
        <input type="hidden" name="routeId" value={route.id} />
      )}

      {state.error && (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-700">{state.error}</p>
        </div>
      )}

      <FormField
        label="Route Name"
        name="name"
        required
        defaultValue={route?.name}
        placeholder="e.g. Minor Works Approval"
      />

      <TextareaField
        label="Description"
        name="description"
        defaultValue={route?.description ?? ""}
        rows={2}
        placeholder="Describe when this approval route applies..."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField
          label="Minimum Amount ($)"
          name="minAmount"
          type="number"
          step="0.01"
          defaultValue={route?.minAmount ?? ""}
          placeholder="e.g. 0"
          helpText="Leave empty for no minimum threshold"
        />

        <FormField
          label="Maximum Amount ($)"
          name="maxAmount"
          type="number"
          step="0.01"
          defaultValue={route?.maxAmount ?? ""}
          placeholder="e.g. 50000"
          helpText="Leave empty for no maximum threshold"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField
          label="Required Approvers"
          name="requiredApprovers"
          type="number"
          required
          defaultValue={route?.requiredApprovers?.toString() ?? "1"}
          placeholder="1"
          helpText="Number of approvers needed to pass"
        />

        <FormField
          label="Sort Order"
          name="sortOrder"
          type="number"
          defaultValue={route?.sortOrder?.toString() ?? "0"}
          placeholder="0"
          helpText="Routes are evaluated in sort order"
        />
      </div>

      <FormField
        label="Approver Roles"
        name="approverRoles"
        defaultValue={route?.approverRoles?.join(", ") ?? ""}
        placeholder="e.g. OWNER, COMMITTEE, ADVISER"
        helpText="Comma-separated list of roles that can approve via this route"
      />

      {isEditing && (
        <CheckboxField
          label="Active"
          name="isActive"
          defaultChecked={route?.isActive ?? true}
          helpText="Inactive routes are not used for new approvals"
        />
      )}

      <div className="flex items-center gap-3 pt-2 border-t border-line">
        <Button type="submit" disabled={isPending}>
          {isPending
            ? isEditing
              ? "Saving..."
              : "Creating..."
            : isEditing
              ? "Save Changes"
              : "Create Route"}
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
