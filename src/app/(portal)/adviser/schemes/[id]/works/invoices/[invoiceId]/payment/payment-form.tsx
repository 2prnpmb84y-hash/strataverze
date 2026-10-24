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
  bank,
}: {
  schemeId: string;
  invoiceId: string;
  /** The most that can still be instructed. */
  approvedAmount: string;
  contractorName: string;
  /** The contractor's current verified bank details, or null when there are none. */
  bank: { id: string; accountName: string; bsb: string; accountLast3: string } | null;
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

  if (!bank) {
    return (
      <div className="rounded-[var(--radius-card)] bg-amber-50 border border-amber-200 px-4 py-3">
        <p className="text-sm text-amber-800">
          {contractorName} has no verified bank details, so this payment cannot be authorised. The
          contractor&apos;s bank details must be verified first.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="schemeId" value={schemeId} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="bankDetailVersionId" value={bank.id} />

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

      <div>
        <p className="text-sm font-medium text-ink mb-1">Pay to (verified bank details)</p>
        <p className="text-sm text-ink-muted">
          {bank.accountName} · BSB {bank.bsb} · account ending {bank.accountLast3}
        </p>
      </div>

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
