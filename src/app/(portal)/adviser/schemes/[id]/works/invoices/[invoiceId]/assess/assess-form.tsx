"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  FormField,
  TextareaField,
} from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import {
  assessWorksInvoice,
  type ActionResult,
} from "@/lib/actions/works";

export function AssessForm({
  schemeId,
  invoiceId,
  claimedAmount,
}: {
  schemeId: string;
  invoiceId: string;
  claimedAmount: string;
}) {
  const router = useRouter();

  const wrappedAction = async (
    _prev: ActionResult,
    formData: FormData,
  ): Promise<ActionResult> => {
    return assessWorksInvoice(formData);
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

      <div className="rounded-[var(--radius-card)] bg-muted p-4">
        <p className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
          Claimed Amount
        </p>
        <p className="text-lg font-semibold text-ink">
          ${Number(claimedAmount).toFixed(2)}
        </p>
      </div>

      <FormField
        label="Assessed Amount ($)"
        name="assessedAmount"
        type="number"
        step="0.01"
        required
        defaultValue={claimedAmount}
        placeholder="0.00"
        helpText="The amount you are approving for this claim"
      />

      <TextareaField
        label="Assessment Notes"
        name="assessmentNotes"
        rows={3}
        placeholder="Notes about the assessment..."
      />

      <TextareaField
        label="Difference Reasons"
        name="differenceReasons"
        rows={2}
        placeholder="If assessed amount differs from claimed, explain why..."
      />

      <div className="flex items-center gap-3 pt-2 border-t border-line">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Assessing..." : "Approve Invoice"}
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
