"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import {
  FeeDisclosure,
  useTransactionFeeView,
  type TransactionFeeTable,
} from "@/components/billing/fee-disclosure";
import {
  approveInvoiceAction,
  recordInvoicePaymentAction,
  cancelInvoiceAction,
} from "../../actions";

interface Props {
  schemeId: string;
  invoiceId: string;
  currentStatus: string;
  /** StrataVerze transaction fee rows, or null when no fee is charged. */
  feeTable?: TransactionFeeTable | null;
  /** Whether payment controls let the viewer approve, and why not. */
  approveBlockedReason?: string | null;
  /** Whether payment controls let the viewer record payment, and why not. */
  paymentBlockedReason?: string | null;
  /** True when a StrataVerze invoice, which cannot be cancelled here. */
  cancelDisabled?: boolean;
}

export function InvoiceActions({
  schemeId,
  invoiceId,
  currentStatus,
  feeTable = null,
  approveBlockedReason = null,
  paymentBlockedReason = null,
  cancelDisabled = false,
}: Props) {
  const [notice, setNotice] = useState<string>();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [feeConfirmed, setFeeConfirmed] = useState(false);
  const fee = useTransactionFeeView(feeTable, "SUPPLIER_DISBURSEMENT", paymentAmount);

  async function handleApprove() {
    setError(undefined);
    startTransition(async () => {
      const result = await approveInvoiceAction(schemeId, invoiceId);
      if (result.error) {
        setError(result.error);
        return;
      }
      const message = (result.data as { message?: string } | undefined)?.message;
      if (message) setNotice(message);
      router.refresh();
    });
  }

  async function handleRecordPayment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(undefined);
    const form = new FormData(e.currentTarget);
    const amount = parseFloat(form.get("paymentAmount") as string);
    const paymentDate = form.get("paymentDate") as string;
    const paymentReference = (form.get("paymentReference") as string)?.trim() || undefined;
    if (fee && !feeConfirmed) {
      setError("Please confirm the StrataVerze fee before recording the payment.");
      return;
    }

    startTransition(async () => {
      const result = await recordInvoicePaymentAction(
        schemeId,
        invoiceId,
        amount,
        paymentDate,
        paymentReference,
        fee && feeConfirmed ? fee.totalCents : null,
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      setShowPaymentForm(false);
      router.refresh();
    });
  }

  async function handleCancel() {
    setError(undefined);
    startTransition(async () => {
      const result = await cancelInvoiceAction(schemeId, invoiceId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setShowCancelConfirm(false);
      router.refresh();
    });
  }

  const canApprove =
    currentStatus === "DRAFT" || currentStatus === "AWAITING_APPROVAL";
  const canRecordPayment =
    currentStatus === "APPROVED" || currentStatus === "PARTIALLY_PAID";
  const canCancel =
    currentStatus !== "PAID" && currentStatus !== "CANCELLED";

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {notice && (
        <div className="rounded-[var(--radius-card)] bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          {notice}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {canApprove && (
          <Button
            variant="primary"
            onClick={handleApprove}
            disabled={isPending || !!approveBlockedReason}
          >
            {isPending ? "Approving..." : "Approve Invoice"}
          </Button>
        )}

        {canRecordPayment && (
          <Button
            variant="primary"
            onClick={() => setShowPaymentForm(true)}
            disabled={isPending || showPaymentForm || !!paymentBlockedReason}
          >
            Record Payment
          </Button>
        )}

        {canCancel && !cancelDisabled && (
          <Button
            variant="danger"
            onClick={() => setShowCancelConfirm(true)}
            disabled={isPending || showCancelConfirm}
          >
            Cancel Invoice
          </Button>
        )}
      </div>

      {canApprove && approveBlockedReason && <p className="text-sm text-ink-muted">{approveBlockedReason}</p>}
      {canRecordPayment && paymentBlockedReason && <p className="text-sm text-ink-muted">{paymentBlockedReason}</p>}

      {/* Payment form */}
      {showPaymentForm && (
        <div className="rounded-[var(--radius-card)] border border-line bg-white p-6 space-y-4">
          <h3 className="text-sm font-semibold text-ink">
            Record Payment
          </h3>
          <form onSubmit={handleRecordPayment} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                label="Payment Amount"
                name="paymentAmount"
                type="number"
                step="0.01"
                required
                placeholder="0.00"
                onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
              />
              <FormField
                label="Payment Date"
                name="paymentDate"
                type="date"
                required
              />
            </div>
            <FormField
              label="Payment Reference"
              name="paymentReference"
              type="text"
              placeholder="e.g. EFT-12345"
            />
            <FeeDisclosure
              fee={fee}
              scheduleHref={`/adviser/schemes/${schemeId}/finance/platform-fees#fee-schedule`}
              confirmed={feeConfirmed}
              onConfirmedChange={setFeeConfirmed}
            />
            <div className="flex gap-3">
              <Button type="submit" variant="primary" disabled={isPending}>
                {isPending ? "Recording..." : "Record Payment"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowPaymentForm(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Cancel confirmation */}
      {showCancelConfirm && (
        <div className="rounded-[var(--radius-card)] border border-red-200 bg-red-50 p-6 space-y-4">
          <h3 className="text-sm font-semibold text-red-700">
            Cancel this invoice?
          </h3>
          <p className="text-sm text-red-600">
            This action cannot be undone. The invoice will be marked as
            cancelled and any associated journal entries will be reversed.
          </p>
          <div className="flex gap-3">
            <Button
              variant="danger"
              onClick={handleCancel}
              disabled={isPending}
            >
              {isPending ? "Cancelling..." : "Yes, Cancel Invoice"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setShowCancelConfirm(false)}
              disabled={isPending}
            >
              Keep Invoice
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
