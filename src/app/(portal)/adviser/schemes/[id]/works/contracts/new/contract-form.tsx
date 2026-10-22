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
  createWorksContract,
  updateWorksContract,
  type ActionResult,
} from "@/lib/actions/works";

type ContractorOption = { id: string; companyName: string };
type RequestOption = { id: string; requestNumber: string; title: string };

type ContractData = {
  id: string;
  requestId: string | null;
  quotationId: string | null;
  contractorBusinessId: string;
  title: string;
  description: string | null;
  contractValue: string;
  gstAmount: string;
  totalValue: string;
  startDate: string | null;
  endDate: string | null;
  retentionPercentage: string | null;
};

export function ContractForm({
  schemeId,
  contractors,
  requests,
  contract,
}: {
  schemeId: string;
  contractors: ContractorOption[];
  requests: RequestOption[];
  contract?: ContractData;
}) {
  const router = useRouter();
  const isEditing = !!contract;

  const [contractValue, setContractValue] = useState(
    contract?.contractValue ?? "",
  );
  const [gstAmount, setGstAmount] = useState(contract?.gstAmount ?? "0");
  const [totalValue, setTotalValue] = useState(contract?.totalValue ?? "");

  function handleContractValueChange(
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const val = e.target.value;
    setContractValue(val);
    const num = parseFloat(val);
    if (!isNaN(num)) {
      const gst = Math.round(num * 0.1 * 100) / 100;
      setGstAmount(gst.toFixed(2));
      setTotalValue((num + gst).toFixed(2));
    } else {
      setGstAmount("0");
      setTotalValue("");
    }
  }

  function handleGstChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setGstAmount(val);
    const base = parseFloat(contractValue);
    const gst = parseFloat(val);
    if (!isNaN(base) && !isNaN(gst)) {
      setTotalValue((base + gst).toFixed(2));
    }
  }

  const wrappedAction = async (
    _prev: ActionResult,
    formData: FormData,
  ): Promise<ActionResult> => {
    if (isEditing) {
      return updateWorksContract(formData);
    }
    return createWorksContract(formData);
  };

  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    wrappedAction,
    { error: null },
  );

  useEffect(() => {
    if (state.success) {
      router.push(`/adviser/schemes/${schemeId}/works/contracts`);
    }
  }, [state.success, router, schemeId]);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="schemeId" value={schemeId} />
      {isEditing && (
        <input type="hidden" name="contractId" value={contract.id} />
      )}
      {contract?.quotationId && (
        <input type="hidden" name="quotationId" value={contract.quotationId} />
      )}

      {state.error && (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-700">{state.error}</p>
        </div>
      )}

      <SelectField
        label="Works Request"
        name="requestId"
        required
        defaultValue={contract?.requestId ?? ""}
        options={[
          { value: "", label: "Select a works request..." },
          ...requests.map((r) => ({
            value: r.id,
            label: `${r.requestNumber} — ${r.title}`,
          })),
        ]}
      />

      <SelectField
        label="Contractor"
        name="contractorBusinessId"
        required
        defaultValue={contract?.contractorBusinessId ?? ""}
        options={[
          { value: "", label: "Select a contractor..." },
          ...contractors.map((c) => ({
            value: c.id,
            label: c.companyName,
          })),
        ]}
      />

      <FormField
        label="Contract Title"
        name="title"
        required
        defaultValue={contract?.title}
        placeholder="e.g. Building Facade Remediation"
      />

      <TextareaField
        label="Description"
        name="description"
        defaultValue={contract?.description ?? ""}
        rows={3}
        placeholder="Describe the scope and terms of this contract..."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <FormField
          label="Contract Value ($)"
          name="contractValue"
          type="number"
          step="0.01"
          required
          value={contractValue}
          onChange={handleContractValueChange}
          placeholder="0.00"
          helpText="Excluding GST"
        />

        <FormField
          label="GST Amount ($)"
          name="gstAmount"
          type="number"
          step="0.01"
          value={gstAmount}
          onChange={handleGstChange}
          placeholder="0.00"
        />

        <FormField
          label="Total Value ($)"
          name="totalValue"
          type="number"
          step="0.01"
          required
          value={totalValue}
          placeholder="0.00"
          helpText="Including GST"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField
          label="Start Date"
          name="startDate"
          type="date"
          defaultValue={contract?.startDate ?? ""}
        />

        <FormField
          label="End Date"
          name="endDate"
          type="date"
          defaultValue={contract?.endDate ?? ""}
        />
      </div>

      <FormField
        label="Retention Percentage (%)"
        name="retentionPercentage"
        type="number"
        step="0.01"
        defaultValue={contract?.retentionPercentage ?? ""}
        placeholder="e.g. 5"
        helpText="Percentage of contract value retained until defects liability period ends"
      />

      <div className="flex items-center gap-3 pt-2 border-t border-line">
        <Button type="submit" disabled={isPending}>
          {isPending
            ? isEditing
              ? "Saving..."
              : "Creating..."
            : isEditing
              ? "Save Changes"
              : "Create Contract"}
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
