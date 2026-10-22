"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { savePaymentPolicyAction } from "@/lib/actions/payment-controls";

const field =
  "w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-turquoise";

/** The committee's payment policy for the scheme. */
export function PaymentPolicyForm({
  schemeId,
  values,
}: {
  schemeId: string;
  values: {
    singleApproverLimit: string;
    requireSecondApproverAbove: string;
    allowSelfApproval: boolean;
    allowAdviserApproval: boolean;
    coolingOffDays: number;
  };
}) {
  const [state, action, pending] = useActionState(savePaymentPolicyAction.bind(null, schemeId), {});
  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <label className="text-sm">
          <span className="block mb-1 font-medium">One approver up to ($)</span>
          <input name="singleApproverLimit" inputMode="decimal" defaultValue={values.singleApproverLimit} className={field} />
          <span className="block mt-1 text-xs text-ink-muted">0 means every invoice needs two approvers.</span>
        </label>
        <label className="text-sm">
          <span className="block mb-1 font-medium">Two approvers above ($, optional)</span>
          <input name="requireSecondApproverAbove" inputMode="decimal" defaultValue={values.requireSecondApproverAbove} className={field} />
          <span className="block mt-1 text-xs text-ink-muted">Leave blank to use the one approver limit.</span>
        </label>
        <label className="text-sm">
          <span className="block mb-1 font-medium">Bank change cooling-off (business days)</span>
          <input name="coolingOffDays" type="number" min={0} max={30} defaultValue={values.coolingOffDays} className={field} />
        </label>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="allowSelfApproval" defaultChecked={values.allowSelfApproval} className="mt-0.5" />
        <span>
          Allow one approver when the scheme has only one eligible approver. Each time this happens it is logged and shown on the invoice.
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="allowAdviserApproval" defaultChecked={values.allowAdviserApproval} className="mt-0.5" />
        <span>Allow the strata manager (adviser) to approve payments. They still can never approve an invoice they prepared.</span>
      </label>
      {state.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state.success && <p className="text-sm text-green-700">{state.success}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save payment policy"}
      </Button>
    </form>
  );
}
