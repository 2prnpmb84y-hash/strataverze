"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  FormField,
} from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import {
  authoriseWorksPayment,
  type ActionResult,
} from "@/lib/actions/works";

export function PaymentForm({
  schemeId,
  invoiceId,
  approvedAmount,
  contractorName,
}: {
  schemeId: string;
  invoiceId: string;
  approvedAmount: string;
  contractorName: string;
}) {
  const router = useRouter();

  const wrappedAction = async (
    _prev: ActionResult,
    formData: FormData,
  ): Promise<ActionResult> => {
    return authoriseWorksPayment(formData);
  };

  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    wrappedAction,
    { error: null },
  );

  useEffect(() => {
    if (state.success) {
      router.push(
        `/adviser/schemes/${schemeId}/works/invoices/${invoiceId}`,
      );
    }
  }, [state.success, router, schemeId, invoiceId]);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="schemeId" value={schemeId} />
      <input type="hidden" name="invoiceId" value={invoiceId} />

      {state.error && (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-700">{state.error}</p>
        </div>
      )}

      <FormField
        label="Approved Amount ($)"
        name="approvedAmount"
        type="number"
        step="0.01"
        required
        defaultValue={approvedAmount}
        placeholder="0.00"
      />

      <FormField
        label="Beneficiary"
        name="beneficiary"
        required
        defaultValue={contractorName}
        placeholder="Contractor name or trading name"
      />

      <div className="flex items-center gap-3 pt-2 border-t border-line">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Authorising..." : "Authorise Payment"}
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
