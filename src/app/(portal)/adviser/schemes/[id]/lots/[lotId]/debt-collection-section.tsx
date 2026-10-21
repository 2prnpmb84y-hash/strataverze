"use client";

import { useRef, useTransition, useState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { SelectField, TextareaField, CheckboxField } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { updateDebtCollectionAction } from "./lot-workflow-actions";

type DebtCollectionSectionProps = {
  schemeId: string;
  lotId: string;
  debtCollection: {
    stage: string;
    notes: string | null;
    excludeFromCollection: boolean;
    hasPaymentPlan: boolean;
    buildingDebtCollection: boolean;
  } | null;
};

const stageOptions = [
  { value: "NONE", label: "None" },
  { value: "LETTER_1", label: "Letter 1" },
  { value: "LETTER_2", label: "Letter 2" },
  { value: "LETTER_3", label: "Letter 3" },
  { value: "LEGAL", label: "Legal" },
];

export function DebtCollectionSection({
  schemeId,
  lotId,
  debtCollection,
}: DebtCollectionSectionProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      setFeedback(null);
      const result = await updateDebtCollectionAction(schemeId, lotId, formData);
      if (result.error) {
        setFeedback({ type: "error", message: result.error });
      } else {
        setFeedback({ type: "success", message: "Debt collection updated." });
        setTimeout(() => setFeedback(null), 3000);
      }
    });
  }

  const buildingActive = debtCollection?.buildingDebtCollection ?? false;

  return (
    <Card>
      <CardHeader title="Debt Collection" />
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
        <SelectField
          label="Stage"
          name="stage"
          defaultValue={debtCollection?.stage ?? "NONE"}
          options={stageOptions}
        />

        <TextareaField
          label="Notes"
          name="notes"
          defaultValue={debtCollection?.notes ?? ""}
          placeholder="Add notes about debt collection..."
          rows={3}
        />

        <div className="space-y-3">
          <CheckboxField
            label="Exclude from Debt Collection"
            name="excludeFromCollection"
            defaultChecked={debtCollection?.excludeFromCollection ?? false}
          />
          <CheckboxField
            label="Payment Plan"
            name="hasPaymentPlan"
            defaultChecked={debtCollection?.hasPaymentPlan ?? false}
          />
        </div>

        {/* Building Debt Collection status */}
        <div>
          <p className="text-sm font-medium text-ink mb-2">
            Building Debt Collection
          </p>
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                buildingActive
                  ? "bg-green-100 text-green-700"
                  : "bg-muted text-ink-muted"
              }`}
            >
              Y
            </span>
            <span
              className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                !buildingActive
                  ? "bg-red-100 text-red-700"
                  : "bg-muted text-ink-muted"
              }`}
            >
              N
            </span>
            <input
              type="hidden"
              name="buildingDebtCollection"
              value={buildingActive ? "on" : ""}
            />
          </div>
        </div>

        {feedback && (
          <p
            className={`text-sm ${
              feedback.type === "success" ? "text-green-600" : "text-red-500"
            }`}
          >
            {feedback.message}
          </p>
        )}

        <div className="pt-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
