"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  FormField,
  TextareaField,
} from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import {
  createWorksVariation,
  type ActionResult,
} from "@/lib/actions/works";

export function VariationForm({
  schemeId,
  contractId,
}: {
  schemeId: string;
  contractId: string;
}) {
  const router = useRouter();

  const wrappedAction = async (
    _prev: ActionResult,
    formData: FormData,
  ): Promise<ActionResult> => {
    return createWorksVariation(formData);
  };

  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    wrappedAction,
    { error: null },
  );

  useEffect(() => {
    if (state.success) {
      router.push(
        `/adviser/schemes/${schemeId}/works/contracts/${contractId}`,
      );
    }
  }, [state.success, router, schemeId, contractId]);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="schemeId" value={schemeId} />
      <input type="hidden" name="contractId" value={contractId} />

      {state.error && (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-700">{state.error}</p>
        </div>
      )}

      <FormField
        label="Variation Title"
        name="title"
        required
        placeholder="e.g. Additional waterproofing to Level 3"
      />

      <TextareaField
        label="Description"
        name="description"
        required
        rows={3}
        placeholder="Describe the scope of this variation..."
      />

      <TextareaField
        label="Reason"
        name="reason"
        rows={2}
        placeholder="Reason for the variation (e.g. latent condition discovered)"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField
          label="Cost Impact ($)"
          name="costImpact"
          type="number"
          required
          placeholder="0.00"
          helpText="Use negative for cost reductions"
        />

        <FormField
          label="Time Impact (days)"
          name="timeImpact"
          type="number"
          placeholder="0"
          helpText="Additional days required (optional)"
        />
      </div>

      <div className="flex items-center gap-3 pt-2 border-t border-line">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Submitting..." : "Submit Variation"}
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
