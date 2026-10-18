"use client";

import { useActionState } from "react";
import { updateWorkOrderStatusAction, createInvoiceAction } from "./actions";
import { Card, CardHeader } from "@/components/ui/card";

export function WorkOrderActions({
  workOrderId,
  currentStatus,
}: {
  workOrderId: string;
  currentStatus: string;
}) {
  const [statusState, statusAction, statusPending] = useActionState(
    (_prev: { error?: string }, formData: FormData) => {
      const status = formData.get("status") as string;
      return updateWorkOrderStatusAction(workOrderId, status);
    },
    {},
  );

  const [invoiceState, invoiceAction, invoicePending] = useActionState(
    (_prev: { error?: string }, formData: FormData) =>
      createInvoiceAction(workOrderId, formData),
    {},
  );

  return (
    <>
      {/* Status update buttons */}
      {(currentStatus === "AWARDED" || currentStatus === "IN_PROGRESS") && (
        <Card className="mb-6">
          <CardHeader title="Update Status" />

          {statusState.error && (
            <div className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger mb-4">
              {statusState.error}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {currentStatus === "AWARDED" && (
              <form action={statusAction}>
                <input type="hidden" name="status" value="IN_PROGRESS" />
                <button
                  type="submit"
                  disabled={statusPending}
                  className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 transition-colors disabled:opacity-50"
                >
                  {statusPending ? "Updating..." : "Start Work"}
                </button>
              </form>
            )}
            {currentStatus === "IN_PROGRESS" && (
              <form action={statusAction}>
                <input type="hidden" name="status" value="COMPLETED" />
                <button
                  type="submit"
                  disabled={statusPending}
                  className="rounded-lg bg-success px-4 py-2 text-sm font-medium text-white hover:bg-success/90 transition-colors disabled:opacity-50"
                >
                  {statusPending ? "Updating..." : "Mark Complete"}
                </button>
              </form>
            )}
          </div>
        </Card>
      )}

      {/* Create invoice form */}
      <Card className="mb-6">
        <CardHeader
          title="Submit Invoice"
          description="Submit an invoice for this work order."
        />

        {invoiceState.error && (
          <div className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger mb-4">
            {invoiceState.error}
          </div>
        )}

        <form action={invoiceAction} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="invoiceNumber"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Invoice Number <span className="text-danger">*</span>
              </label>
              <input
                id="invoiceNumber"
                name="invoiceNumber"
                type="text"
                required
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-supplier"
                placeholder="INV-001"
              />
            </div>

            <div>
              <label
                htmlFor="amount"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Amount (ex. GST) <span className="text-danger">*</span>
              </label>
              <input
                id="amount"
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                required
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-supplier"
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="gstAmount"
                className="block text-sm font-medium text-foreground mb-1"
              >
                GST Amount
              </label>
              <input
                id="gstAmount"
                name="gstAmount"
                type="number"
                step="0.01"
                min="0"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-supplier"
                placeholder="0.00"
              />
            </div>

            <div>
              <label
                htmlFor="dueDate"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Due Date
              </label>
              <input
                id="dueDate"
                name="dueDate"
                type="date"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-supplier"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="invoiceDescription"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Description
            </label>
            <textarea
              id="invoiceDescription"
              name="description"
              rows={2}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-supplier"
              placeholder="Description of work completed..."
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={invoicePending}
              className="rounded-lg bg-supplier px-4 py-2 text-sm font-medium text-white hover:bg-supplier/90 transition-colors disabled:opacity-50"
            >
              {invoicePending ? "Submitting..." : "Submit Invoice"}
            </button>
          </div>
        </form>
      </Card>
    </>
  );
}
