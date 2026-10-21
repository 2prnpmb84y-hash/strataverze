"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FormField,
  SelectField,
} from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import {
  submitWorksInvoice,
  updateWorksInvoice,
  type ActionResult,
} from "@/lib/actions/works";

type ContractOption = {
  id: string;
  contractNumber: string;
  title: string;
  contractorBusinessId: string;
  contractorName: string;
};

type ContractorOption = {
  id: string;
  companyName: string;
};

export type InvoiceData = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  claimedAmount: string;
  gstAmount: string;
  contractId: string | null;
  contractorBusinessId: string;
};

export function InvoiceForm({
  schemeId,
  contracts,
  contractors,
  invoice,
}: {
  schemeId: string;
  contracts: ContractOption[];
  contractors: ContractorOption[];
  invoice?: InvoiceData;
}) {
  const router = useRouter();
  const isEdit = !!invoice;
  const [selectedContractId, setSelectedContractId] = useState(
    invoice?.contractId ?? "",
  );
  const [claimedAmount, setClaimedAmount] = useState(
    invoice?.claimedAmount ?? "",
  );
  const [gstAmount, setGstAmount] = useState(invoice?.gstAmount ?? "");

  const selectedContract = contracts.find((c) => c.id === selectedContractId);
  const contractorBusinessId = selectedContract?.contractorBusinessId ?? "";

  const handleClaimedAmountChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const val = e.target.value;
    setClaimedAmount(val);
    const num = Number(val);
    if (!isNaN(num)) {
      setGstAmount((num * 0.1).toFixed(2));
    }
  };

  const wrappedAction = async (
    _prev: ActionResult,
    formData: FormData,
  ): Promise<ActionResult> => {
    return isEdit
      ? updateWorksInvoice(formData)
      : submitWorksInvoice(formData);
  };

  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    wrappedAction,
    { error: null },
  );

  useEffect(() => {
    if (state.success) {
      router.push(
        isEdit
          ? `/adviser/schemes/${schemeId}/works/invoices/${invoice.id}`
          : `/adviser/schemes/${schemeId}/works/invoices`,
      );
    }
  }, [state.success, router, schemeId, isEdit, invoice?.id]);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="schemeId" value={schemeId} />
      {isEdit && (
        <input type="hidden" name="invoiceId" value={invoice.id} />
      )}
      <input
        type="hidden"
        name="contractorBusinessId"
        value={contractorBusinessId}
      />

      {state.error && (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-700">{state.error}</p>
        </div>
      )}

      <SelectField
        label="Contract (optional)"
        name="contractId"
        value={selectedContractId}
        onChange={(e) => setSelectedContractId(e.target.value)}
        options={[
          { value: "", label: "No contract linked" },
          ...contracts.map((c) => ({
            value: c.id,
            label: `${c.contractNumber} — ${c.title}`,
          })),
        ]}
      />

      {!selectedContractId && (
        <SelectField
          label="Contractor"
          name="contractorBusinessIdSelect"
          required
          options={[
            { value: "", label: "Select contractor..." },
            ...contractors.map((c) => ({
              value: c.id,
              label: c.companyName,
            })),
          ]}
        />
      )}

      {selectedContractId && (
        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">
            Contractor
          </label>
          <p className="w-full rounded-[var(--radius-card)] border border-line bg-surface-secondary px-3 py-2.5 text-sm text-ink-muted">
            {selectedContract?.contractorName ?? "—"}
          </p>
        </div>
      )}

      <FormField
        label="Invoice Number"
        name="invoiceNumber"
        required
        placeholder="e.g. INV-2024-001"
        defaultValue={invoice?.invoiceNumber}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField
          label="Invoice Date"
          name="invoiceDate"
          type="date"
          required
          defaultValue={invoice?.invoiceDate}
        />
        <FormField
          label="Due Date"
          name="dueDate"
          type="date"
          required
          defaultValue={invoice?.dueDate}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <FormField
          label="Claimed Amount ($)"
          name="claimedAmount"
          type="number"
          required
          placeholder="0.00"
          value={claimedAmount}
          onChange={handleClaimedAmountChange}
        />
        <FormField
          label="GST Amount ($)"
          name="gstAmount"
          type="number"
          placeholder="0.00"
          value={gstAmount}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setGstAmount(e.target.value)
          }
          helpText="Auto-calculated at 10%"
        />
        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">
            Total (incl. GST)
          </label>
          <p className="w-full rounded-[var(--radius-card)] border border-line bg-surface-secondary px-3 py-2.5 text-sm font-semibold text-ink">
            $
            {(Number(claimedAmount || 0) + Number(gstAmount || 0)).toFixed(2)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2 border-t border-line">
        <Button type="submit" disabled={isPending}>
          {isPending
            ? isEdit
              ? "Saving..."
              : "Submitting..."
            : isEdit
              ? "Save Changes"
              : "Submit Invoice"}
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
