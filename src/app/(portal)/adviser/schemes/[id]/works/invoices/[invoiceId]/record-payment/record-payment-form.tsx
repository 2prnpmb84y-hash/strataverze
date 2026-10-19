"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  FormField,
  TextareaField,
  SelectField,
} from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import {
  recordWorksPayment,
  type ActionResult,
} from "@/lib/actions/works";

type InstructionOption = {
  id: string;
  beneficiary: string;
  approvedAmount: string;
  status: string;
};

export function RecordPaymentForm({
  schemeId,
  invoiceId,
  instructions,
}: {
  schemeId: string;
  invoiceId: string;
  instructions: InstructionOption[];
}) {
  const router = useRouter();

  const wrappedAction = async (
    _prev: ActionResult,
    formData: FormData,
  ): Promise<ActionResult> => {
    return recordWorksPayment(formData);
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

  const pendingInstructions = instructions.filter(
    (i) => i.status === "PENDING",
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="schemeId" value={schemeId} />

      {state.error && (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-700">{state.error}</p>
        </div>
      )}

      <SelectField
        label="Payment Instruction"
        name="paymentInstructionId"
        required
        options={[
          { value: "", label: "Select instruction..." },
          ...pendingInstructions.map((i) => ({
            value: i.id,
            label: `${i.beneficiary} — $${Number(i.approvedAmount).toFixed(2)}`,
          })),
        ]}
      />

      <FormField
        label="Amount ($)"
        name="amount"
        type="number"
        required
        placeholder="0.00"
        defaultValue={
          pendingInstructions.length === 1
            ? pendingInstructions[0].approvedAmount
            : ""
        }
      />

      <SelectField
        label="Payment Method"
        name="paymentMethod"
        required
        options={[
          { value: "EFT", label: "EFT (Electronic Funds Transfer)" },
          { value: "CHEQUE", label: "Cheque" },
          { value: "BPAY", label: "BPAY" },
          { value: "DIRECT_DEBIT", label: "Direct Debit" },
        ]}
      />

      <FormField
        label="Payment Date"
        name="paymentDate"
        type="date"
        required
        defaultValue={new Date().toISOString().split("T")[0]}
      />

      <FormField
        label="External Reference"
        name="externalReference"
        placeholder="e.g. Bank transaction reference"
      />

      <TextareaField
        label="Remittance Info"
        name="remittanceInfo"
        rows={2}
        placeholder="Optional remittance details..."
      />

      <div className="flex items-center gap-3 pt-2 border-t border-line">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Recording..." : "Record Payment"}
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
