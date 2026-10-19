"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  FormField,
  TextareaField,
  SelectField,
} from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { createWorksRfq, type ActionResult } from "@/lib/actions/works";

type Scope = {
  id: string;
  title: string;
  currentVersion: number;
};

export function RfqForm({
  schemeId,
  scopes,
}: {
  schemeId: string;
  scopes: Scope[];
}) {
  const router = useRouter();

  const wrappedAction = async (
    _prev: ActionResult,
    formData: FormData,
  ): Promise<ActionResult> => {
    return createWorksRfq(formData);
  };

  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    wrappedAction,
    { error: null },
  );

  useEffect(() => {
    if (state.success) {
      router.push(`/adviser/schemes/${schemeId}/works/rfqs`);
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
        label="Scope of Works"
        name="scopeId"
        required
        options={[
          { value: "", label: "Select a scope of works" },
          ...scopes.map((s) => ({
            value: s.id,
            label: `${s.title} (v${s.currentVersion})`,
          })),
        ]}
      />

      <FormField
        label="Title"
        name="title"
        required
        placeholder="Brief title for this RFQ"
      />

      <TextareaField
        label="Description"
        name="description"
        rows={4}
        placeholder="Additional details, requirements, or instructions for respondents..."
      />

      <FormField
        label="Closing Date"
        name="closingDate"
        type="date"
        required
        helpText="Date by which quotations must be received"
      />

      <div className="flex items-center gap-3 pt-2 border-t border-line">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creating..." : "Create RFQ"}
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
