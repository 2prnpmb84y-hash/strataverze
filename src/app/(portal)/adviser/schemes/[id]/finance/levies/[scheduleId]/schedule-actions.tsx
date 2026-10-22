"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import {
  approveLevyScheduleAction,
  issueScheduleNoticesAction,
  recordLevyPaymentFormAction,
  type ActionState,
} from "../../actions";

function Message({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <div role="alert" className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
        {state.error}
      </div>
    );
  }
  return null;
}

/** Record the owners corporation's approval (resolution date). */
export function ApproveScheduleForm({ schemeId, scheduleId }: { schemeId: string; scheduleId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    approveLevyScheduleAction.bind(null, schemeId, scheduleId),
    {},
  );
  return (
    <form action={formAction} className="space-y-4">
      <Message state={state} />
      <FormField
        label="Resolution date"
        name="resolutionDate"
        type="date"
        required
        helpText="Date of the general meeting at which the owners corporation set these contributions."
        error={state.fieldErrors?.resolutionDate}
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Record approval"}
      </Button>
    </form>
  );
}

/** Issue every notice for an approved schedule. */
export function IssueNoticesForm({
  schemeId,
  scheduleId,
  isSpecial,
  defaultFirstDueDate,
  noticeCount,
  blocked,
}: {
  schemeId: string;
  scheduleId: string;
  isSpecial: boolean;
  defaultFirstDueDate: string;
  noticeCount: number;
  blocked: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    issueScheduleNoticesAction.bind(null, schemeId, scheduleId),
    {},
  );
  return (
    <form action={formAction} className="space-y-4">
      <Message state={state} />
      {!isSpecial && (
        <FormField
          label="First instalment due"
          name="firstDueDate"
          type="date"
          required
          defaultValue={defaultFirstDueDate}
          helpText="Later instalments fall due at the same interval."
          error={state.fieldErrors?.firstDueDate}
        />
      )}
      <Button type="submit" disabled={pending || blocked}>
        {pending ? "Issuing..." : `Issue ${noticeCount} notice${noticeCount === 1 ? "" : "s"}`}
      </Button>
    </form>
  );
}

/** Record a payment against one notice. */
export function RecordPaymentForm({
  schemeId,
  noticeId,
  balance,
}: {
  schemeId: string;
  noticeId: string;
  balance: number;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    recordLevyPaymentFormAction.bind(null, schemeId, noticeId),
    {},
  );
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <label className="text-xs text-ink-muted">
        <span className="block mb-1">Amount</span>
        <input
          name="amount"
          type="number"
          step="0.01"
          min="0.01"
          max={balance}
          defaultValue={balance.toFixed(2)}
          required
          aria-label="Payment amount"
          className="w-28 rounded-[var(--radius-card)] border border-line bg-white px-2 py-1.5 text-sm text-ink tabular-nums"
        />
      </label>
      <label className="text-xs text-ink-muted">
        <span className="block mb-1">Date paid</span>
        <input
          name="paymentDate"
          type="date"
          defaultValue={today}
          required
          aria-label="Payment date"
          className="rounded-[var(--radius-card)] border border-line bg-white px-2 py-1.5 text-sm text-ink"
        />
      </label>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving..." : "Record payment"}
      </Button>
      {state.error && <p role="alert" className="w-full text-xs text-red-600">{state.error}</p>}
      {state.success && <p className="w-full text-xs text-green-700">Payment recorded.</p>}
    </form>
  );
}
