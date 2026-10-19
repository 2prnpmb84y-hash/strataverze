"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FormField,
  TextareaField,
  SelectField,
} from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import {
  createWorksWorkOrder,
  updateWorksWorkOrder,
  type ActionResult,
} from "@/lib/actions/works";

type ContractOption = {
  id: string;
  contractNumber: string;
  title: string;
  contractorBusinessId: string;
  contractorName: string;
};

type WorkOrderData = {
  id: string;
  contractId: string;
  contractorBusinessId: string;
  title: string;
  description: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
};

export function WorkOrderForm({
  schemeId,
  contracts,
  workOrder,
}: {
  schemeId: string;
  contracts: ContractOption[];
  workOrder?: WorkOrderData;
}) {
  const router = useRouter();
  const isEditing = !!workOrder;
  const [selectedContractId, setSelectedContractId] = useState(
    workOrder?.contractId ?? "",
  );

  const selectedContract = contracts.find((c) => c.id === selectedContractId);
  const contractorBusinessId =
    workOrder?.contractorBusinessId ??
    selectedContract?.contractorBusinessId ??
    "";
  const contractorName = selectedContract?.contractorName ?? "";

  const wrappedAction = async (
    _prev: ActionResult,
    formData: FormData,
  ): Promise<ActionResult> => {
    if (isEditing) {
      return updateWorksWorkOrder(formData);
    }
    return createWorksWorkOrder(formData);
  };

  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    wrappedAction,
    { error: null },
  );

  useEffect(() => {
    if (state.success) {
      router.push(`/adviser/schemes/${schemeId}/works/work-orders`);
    }
  }, [state.success, router, schemeId]);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="schemeId" value={schemeId} />
      <input type="hidden" name="contractorBusinessId" value={contractorBusinessId} />
      {isEditing && (
        <input type="hidden" name="workOrderId" value={workOrder.id} />
      )}

      {state.error && (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-700">{state.error}</p>
        </div>
      )}

      <SelectField
        label="Contract"
        name="contractId"
        required
        value={selectedContractId}
        onChange={(e) => setSelectedContractId(e.target.value)}
        options={[
          { value: "", label: "Select a contract..." },
          ...contracts.map((c) => ({
            value: c.id,
            label: `${c.contractNumber} — ${c.title}`,
          })),
        ]}
      />

      <div>
        <label className="block text-sm font-medium text-ink mb-1.5">
          Contractor
        </label>
        <p className="w-full rounded-[var(--radius-card)] border border-line bg-surface-secondary px-3 py-2.5 text-sm text-ink-muted">
          {contractorName || "Select a contract to auto-fill contractor"}
        </p>
      </div>

      <FormField
        label="Work Order Title"
        name="title"
        required
        defaultValue={workOrder?.title}
        placeholder="e.g. Phase 1 — Scaffolding and Access"
      />

      <TextareaField
        label="Description"
        name="description"
        defaultValue={workOrder?.description ?? ""}
        rows={3}
        placeholder="Describe the scope of this work order..."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField
          label="Scheduled Start"
          name="scheduledStart"
          type="date"
          defaultValue={workOrder?.scheduledStart ?? ""}
        />

        <FormField
          label="Scheduled End"
          name="scheduledEnd"
          type="date"
          defaultValue={workOrder?.scheduledEnd ?? ""}
        />
      </div>

      <div className="flex items-center gap-3 pt-2 border-t border-line">
        <Button type="submit" disabled={isPending}>
          {isPending
            ? isEditing
              ? "Saving..."
              : "Creating..."
            : isEditing
              ? "Save Changes"
              : "Create Work Order"}
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
