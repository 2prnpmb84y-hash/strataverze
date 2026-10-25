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
  issueOverdueNoticesAction,
  issueScheduleNoticesAction,
  stopPlannedNoticesAction,
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
  noticeCount,
  blocked,
}: {
  schemeId: string;
  scheduleId: string;
  isSpecial: boolean;
  noticeCount: number;
  blocked: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    issueScheduleNoticesAction.bind(null, schemeId, scheduleId),
    {},
  );
  const missing = Array.isArray(state.data?.missing) ? (state.data.missing as { code: string; message: string }[]) : [];
  const late = Array.isArray(state.data?.late) ? (state.data.late as string[]) : [];
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
      {late.length > 0 && (
        <div className="rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 space-y-2">
          <p className="font-medium">These instalments cannot be given 5 weeks&apos; notice:</p>
          <ul className="list-disc space-y-1 pl-5">
            {late.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <label className="flex items-start gap-2">
            <input type="checkbox" name="confirmLate" className="mt-1" />
            <span>I confirm these notices go out today with less than 5 weeks&apos; notice (never less than the statutory 30 days).</span>
          </label>
        </div>
      )}
      {state.success && (
        <p className="text-sm text-green-700">
          {typeof state.data?.count === "number" && state.data.count > 0 ? `${state.data.count} notice(s) issued today.` : "No notices go out today."}
          {typeof state.data?.planned === "number" && state.data.planned > 0
            ? ` ${state.data.planned} planned: each goes out 5 weeks before it falls due${typeof state.data?.nextIssueOn === "string" ? `, the next on ${state.data.nextIssueOn.split("-").reverse().join("/")}` : ""}.`
            : ""}
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
        <p className="text-sm text-ink-muted">
          Levies are paid in advance: each instalment falls due on the first day of the period it covers. Each notice goes out by email 5 weeks before
          it falls due. Any whose 5-week mark has passed go out today, once you confirm.
        </p>
      )}
      <Button type="submit" disabled={pending || blocked}>
        {pending ? "Saving..." : isSpecial ? `Issue ${noticeCount} notice${noticeCount === 1 ? "" : "s"}` : `Plan ${noticeCount} notice${noticeCount === 1 ? "" : "s"}`}
      </Button>
    </form>
  );
}

/** Send, once confirmed, the planned notices past their 5-week mark. */
export function OverdueNoticesForm({ schemeId, scheduleId, count }: { schemeId: string; scheduleId: string; count: number }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(issueOverdueNoticesAction.bind(null, schemeId, scheduleId), {});
  const late = Array.isArray(state.data?.late) ? (state.data.late as string[]) : [];
  const missing = Array.isArray(state.data?.missing) ? (state.data.missing as { code: string; message: string }[]) : [];
  return (
    <form action={formAction} className="space-y-3 rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-medium">
        {count} planned notice{count === 1 ? " is" : "s are"} past {count === 1 ? "its" : "their"} 5-week mark and {count === 1 ? "has" : "have"} not gone out.
      </p>
      <p>They go out today once you confirm. Any with fewer than 30 days left fall due 30 days from today instead, the statutory minimum.</p>
      {late.length > 0 && (
        <ul className="list-disc space-y-1 pl-5">
          {late.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
      {missing.length > 0 && (
        <ul className="list-disc space-y-1 pl-5">
          {missing.map((m) => (
            <li key={m.message}>{m.message}</li>
          ))}
        </ul>
      )}
      <label className="flex items-start gap-2">
        <input type="checkbox" name="confirmLate" className="mt-1" />
        <span>I confirm these notices go out today with less than 5 weeks&apos; notice (never less than the statutory 30 days).</span>
      </label>
      {state.error && <p role="alert" className="text-red-700">{state.error}</p>}
      {state.success && <p className="text-green-700">{String(state.data?.count ?? 0)} notice(s) sent, {String(state.data?.emailed ?? 0)} emailed to owners.</p>}
      <Button type="submit" disabled={pending}>{pending ? "Sending..." : "Send them now"}</Button>
    </form>
  );
}

/** Stop the planned notices (for example when the budget is revised). */
export function StopPlannedNoticesForm({ schemeId, scheduleId, count }: { schemeId: string; scheduleId: string; count: number }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(stopPlannedNoticesAction.bind(null, schemeId, scheduleId), {});
  if (state.success) {
    return <p className="text-sm text-green-700">{String(state.data?.removed ?? 0)} planned notice(s) stopped. The schedule is superseded; notices already sent are unchanged.</p>;
  }
  return (
    <form action={formAction} className="space-y-3 text-sm">
      <p className="text-ink-muted">
        If the budget changes, stop the {count} planned notice{count === 1 ? "" : "s"} not yet sent. Notices already sent stay as they are.
      </p>
      <label className="flex items-start gap-2 text-ink">
        <input type="checkbox" name="confirmStop" className="mt-1" />
        <span>Stop the planned notices and supersede this schedule.</span>
      </label>
      {state.error && <p role="alert" className="text-red-700">{state.error}</p>}
      <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Stopping..." : "Stop planned notices"}</Button>
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
