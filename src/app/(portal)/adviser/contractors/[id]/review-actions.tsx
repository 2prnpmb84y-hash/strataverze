"use client";

import { useActionState, useState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import {
  approveContractor,
  rejectContractor,
  requestClarification,
  suspendContractor,
} from "@/lib/actions/contractor-review";

type ActionType = "approve" | "reject" | "clarify" | "suspend" | null;

export function ReviewActionsPanel({ contractorId }: { contractorId: string }) {
  const [activeAction, setActiveAction] = useState<ActionType>(null);

  const [approveState, approveAction, approvePending] = useActionState(
    async (_prev: { error: string | null }, formData: FormData) => {
      const result = await approveContractor({ error: null }, formData);
      if (result.success) setActiveAction(null);
      return result;
    },
    { error: null },
  );

  const [rejectState, rejectAction, rejectPending] = useActionState(
    async (_prev: { error: string | null }, formData: FormData) => {
      const result = await rejectContractor({ error: null }, formData);
      if (result.success) setActiveAction(null);
      return result;
    },
    { error: null },
  );

  const [clarifyState, clarifyAction, clarifyPending] = useActionState(
    async (_prev: { error: string | null }, formData: FormData) => {
      const result = await requestClarification({ error: null }, formData);
      if (result.success) setActiveAction(null);
      return result;
    },
    { error: null },
  );

  const [suspendState, suspendAction, suspendPending] = useActionState(
    async (_prev: { error: string | null }, formData: FormData) => {
      const result = await suspendContractor({ error: null }, formData);
      if (result.success) setActiveAction(null);
      return result;
    },
    { error: null },
  );

  const currentError =
    approveState.error || rejectState.error || clarifyState.error || suspendState.error;

  return (
    <Card>
      <CardHeader title="Review Actions" />

      {currentError && (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 mb-4">
          <p className="text-sm text-red-700">{currentError}</p>
        </div>
      )}

      {activeAction === null && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setActiveAction("approve")}
            className="w-full rounded-[var(--radius-card)] bg-emerald-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-emerald-700 transition-colors"
          >
            Approve Application
          </button>
          <button
            type="button"
            onClick={() => setActiveAction("clarify")}
            className="w-full rounded-[var(--radius-card)] bg-blue-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Request Clarification
          </button>
          <button
            type="button"
            onClick={() => setActiveAction("reject")}
            className="w-full rounded-[var(--radius-card)] border border-red-300 text-red-700 px-4 py-2.5 text-sm font-medium hover:bg-red-50 transition-colors"
          >
            Reject Application
          </button>
          <button
            type="button"
            onClick={() => setActiveAction("suspend")}
            className="w-full rounded-[var(--radius-card)] border border-line text-ink-muted px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
          >
            Suspend Contractor
          </button>
        </div>
      )}

      {/* Approve form */}
      {activeAction === "approve" && (
        <form action={approveAction} className="space-y-3">
          <input type="hidden" name="contractorId" value={contractorId} />
          <p className="text-sm text-ink">
            Approve this contractor application? They will be granted active status on the platform.
          </p>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">
              Notes (optional)
            </label>
            <textarea
              name="notes"
              rows={2}
              className="w-full rounded-[var(--radius-card)] border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-adviser"
              placeholder="Any notes about this approval..."
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={approvePending}
              className="flex-1 rounded-[var(--radius-card)] bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {approvePending ? "Approving..." : "Confirm Approve"}
            </button>
            <button
              type="button"
              onClick={() => setActiveAction(null)}
              className="rounded-[var(--radius-card)] border border-line text-ink px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Reject form */}
      {activeAction === "reject" && (
        <form action={rejectAction} className="space-y-3">
          <input type="hidden" name="contractorId" value={contractorId} />
          <p className="text-sm text-ink">
            Reject this contractor application. A reason is required.
          </p>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">
              Reason for rejection *
            </label>
            <textarea
              name="reason"
              rows={3}
              required
              className="w-full rounded-[var(--radius-card)] border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="Explain why this application is being rejected..."
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={rejectPending}
              className="flex-1 rounded-[var(--radius-card)] bg-red-600 text-white px-4 py-2 text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {rejectPending ? "Rejecting..." : "Confirm Reject"}
            </button>
            <button
              type="button"
              onClick={() => setActiveAction(null)}
              className="rounded-[var(--radius-card)] border border-line text-ink px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Clarification form */}
      {activeAction === "clarify" && (
        <form action={clarifyAction} className="space-y-3">
          <input type="hidden" name="contractorId" value={contractorId} />
          <p className="text-sm text-ink">
            Request additional information from the contractor.
          </p>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">
              Clarification message *
            </label>
            <textarea
              name="message"
              rows={3}
              required
              className="w-full rounded-[var(--radius-card)] border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="What information do you need from the contractor?"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={clarifyPending}
              className="flex-1 rounded-[var(--radius-card)] bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {clarifyPending ? "Sending..." : "Send Request"}
            </button>
            <button
              type="button"
              onClick={() => setActiveAction(null)}
              className="rounded-[var(--radius-card)] border border-line text-ink px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Suspend form */}
      {activeAction === "suspend" && (
        <form action={suspendAction} className="space-y-3">
          <input type="hidden" name="contractorId" value={contractorId} />
          <p className="text-sm text-ink">
            Suspend this contractor. A reason is required.
          </p>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">
              Reason for suspension *
            </label>
            <textarea
              name="reason"
              rows={3}
              required
              className="w-full rounded-[var(--radius-card)] border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="Explain why this contractor is being suspended..."
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={suspendPending}
              className="flex-1 rounded-[var(--radius-card)] bg-amber-600 text-white px-4 py-2 text-sm font-medium hover:bg-amber-700 transition-colors disabled:opacity-50"
            >
              {suspendPending ? "Suspending..." : "Confirm Suspend"}
            </button>
            <button
              type="button"
              onClick={() => setActiveAction(null)}
              className="rounded-[var(--radius-card)] border border-line text-ink px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </Card>
  );
}
