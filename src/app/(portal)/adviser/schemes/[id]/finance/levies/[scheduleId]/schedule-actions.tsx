"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  FeeDisclosure,
  useTransactionFeeView,
  type TransactionFeeTable,
} from "@/components/billing/fee-disclosure";
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
  const missing = Array.isArray(state.data?.missing) ? (state.data.missing as { code: string; message: string }[]) : [];
  return (
    <form action={formAction} className="space-y-4">
      <Message state={state} />
      {missing.length > 0 && (
        <div className="rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">Each notice must state the following before it can be issued:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {missing.map((m) => (
              <li key={`${m.code}-${m.message}`}>{m.message}</li>
            ))}
          </ul>
        </div>
      )}
      {state.success && (
        <p className="text-sm text-green-700">
          Notices issued.
          {typeof state.data?.emailed === "number" ? ` ${state.data.emailed} emailed to owners.` : ""}
          {typeof state.data?.creditApplied === "number" && state.data.creditApplied > 0
            ? ` $${state.data.creditApplied.toFixed(2)} of owner credit applied.`
            : ""}
        </p>
      )}
      {isSpecial && (
        <label className="flex items-start gap-2 text-sm text-ink">
          <input type="checkbox" name="urgentSpecialLevy" className="mt-1" />
          <span>
            This is an urgent special levy for emergency repairs. The minimum notice to pay is 14 days instead of 30.
          </span>
        </label>
      )}
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
  isSpecialLevy = false,
  feeTable = null,
}: {
  schemeId: string;
  noticeId: string;
  balance: number;
  isSpecialLevy?: boolean;
  /** StrataVerze transaction fee rows, or null when no fee is charged. */
  feeTable?: TransactionFeeTable | null;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    recordLevyPaymentFormAction.bind(null, schemeId, noticeId),
    {},
  );
  const today = new Date().toISOString().slice(0, 10);
  const [amount, setAmount] = useState(balance);
  const [feeConfirmed, setFeeConfirmed] = useState(false);
  const [creditConfirmed, setCreditConfirmed] = useState(false);
  const excess = Math.max(0, Math.round((amount - balance) * 100) / 100);
  const fee = useTransactionFeeView(feeTable, isSpecialLevy ? "SPECIAL_LEVY_RECEIPT" : "LEVY_RECEIPT", amount);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <label className="text-xs text-ink-muted">
        <span className="block mb-1">Amount</span>
        <input
          name="amount"
          type="number"
          step="0.01"
          min="0.01"
          defaultValue={balance.toFixed(2)}
          onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
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
      <Button type="submit" variant="secondary" disabled={pending || (!!fee && !feeConfirmed) || (excess > 0 && !creditConfirmed)}>
        {pending ? "Saving..." : "Record payment"}
      </Button>
      {excess > 0 && (
        <label className="flex w-full items-start gap-2 text-xs text-ink">
          <input
            type="checkbox"
            name="confirmOverpayment"
            checked={creditConfirmed}
            onChange={(e) => setCreditConfirmed(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            This is ${excess.toFixed(2)} more than the notice owes. Hold the extra as the owner&apos;s credit for this lot. It
            can be applied to the next notice or refunded with approval.
          </span>
        </label>
      )}
      {fee && (
        <div className="w-full">
          <FeeDisclosure
            fee={fee}
            scheduleHref={`/adviser/schemes/${schemeId}/finance/platform-fees#fee-schedule`}
            confirmed={feeConfirmed}
            onConfirmedChange={setFeeConfirmed}
            idSuffix={`-${noticeId}`}
          />
        </div>
      )}
      {state.error && <p role="alert" className="w-full text-xs text-red-600">{state.error}</p>}
      {state.success && (
        <p className="w-full text-xs text-green-700">
          Payment recorded.
          {typeof state.data?.creditHeld === "number" && state.data.creditHeld > 0
            ? ` $${state.data.creditHeld.toFixed(2)} is held as the owner's credit.`
            : ""}
        </p>
      )}
    </form>
  );
}
