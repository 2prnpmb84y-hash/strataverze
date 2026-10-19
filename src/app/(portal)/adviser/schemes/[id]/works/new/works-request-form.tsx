"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  FormField,
  TextareaField,
  SelectField,
  CheckboxField,
} from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { createWorksRequest, type ActionResult } from "@/lib/actions/works";

type Category = { id: string; name: string; description: string | null };
type ApprovalRoute = {
  id: string;
  name: string;
  maxAmount: number | null;
};

export function WorksRequestForm({
  schemeId,
  categories,
  approvalRoutes,
}: {
  schemeId: string;
  categories: Category[];
  approvalRoutes: ApprovalRoute[];
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    createWorksRequest,
    { error: null },
  );

  useEffect(() => {
    if (state.success) {
      router.push(`/adviser/schemes/${schemeId}/works`);
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

      <FormField
        label="Title"
        name="title"
        required
        placeholder="Brief description of the work required"
      />

      <TextareaField
        label="Description"
        name="description"
        required
        rows={4}
        placeholder="Detailed description of the issue, including location, urgency, and any relevant background..."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField
          label="Location"
          name="location"
          placeholder="e.g. Level 3, common corridor"
        />

        <SelectField
          label="Category"
          name="categoryId"
          options={[
            { value: "", label: "Select a category" },
            ...categories.map((c) => ({
              value: c.id,
              label: c.name,
            })),
          ]}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SelectField
          label="Priority"
          name="priority"
          required
          defaultValue="MEDIUM"
          options={[
            { value: "LOW", label: "Low" },
            { value: "MEDIUM", label: "Medium" },
            { value: "HIGH", label: "High" },
            { value: "CRITICAL", label: "Critical" },
          ]}
        />

        <FormField
          label="Estimated Cost"
          name="estimatedCost"
          type="number"
          placeholder="0.00"
          helpText="Rough estimate in AUD"
        />
      </div>

      {approvalRoutes.length > 0 && (
        <SelectField
          label="Procurement Route"
          name="procurementRoute"
          options={[
            { value: "", label: "Auto-select based on value" },
            ...approvalRoutes.map((r) => ({
              value: r.id,
              label: `${r.name}${r.maxAmount ? ` (up to $${r.maxAmount.toLocaleString()})` : ""}`,
            })),
          ]}
          className="sm:w-1/2"
        />
      )}

      <CheckboxField
        label="Emergency works"
        name="isEmergency"
        helpText="Mark this if the work is urgent and requires immediate action to protect health, safety, or prevent further damage."
      />

      <div className="flex items-center gap-3 pt-2 border-t border-line">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Submitting..." : "Submit Request"}
        </Button>
        <Button
          type="submit"
          name="saveAsDraft"
          value="true"
          variant="secondary"
          disabled={isPending}
        >
          Save as Draft
        </Button>
      </div>
    </form>
  );
}
