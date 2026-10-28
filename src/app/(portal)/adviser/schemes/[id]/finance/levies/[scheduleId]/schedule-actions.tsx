"use client";

import { useActionState, useState } from "react";
import type { NoticeTimingWords } from "@/lib/jurisdiction/wording";
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

/**
 * How the confirmations name the minimum notice: "statutory" (NSW,
 * Queensland, or a minimum the law sets), or "minimum of" where it is a
 * StrataVerze choice (VIC, ACT and WA stage 2, PR 6a).
 */
function minimumWords(timing: NoticeTimingWords): string {
  return timing.minimumIsStatutory === false ? "StrataVerze minimum of" : "statutory";
}

/** Record the owners corporation's approval (resolution date). `ownersCorporation` is the building's word for it, from its rule pack. */
export function ApproveScheduleForm({ schemeId, scheduleId, ownersCorporation }: { schemeId: string; scheduleId: string; ownersCorporation: string }) {
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
        helpText={`Date of the general meeting at which the ${ownersCorporation} set these contributions.`}
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
  timing,
  levyWords,
}: {
  schemeId: string;
  scheduleId: string;
  isSpecial: boolean;
  noticeCount: number;
  blocked: boolean;
  /** The building's words for a levy, from its rule pack ("levy", "contribution"). */
  levyWords: { levy: string; levies: string };
  /** The building's levy notice timing (5 weeks, the statutory 30 days in NSW). */
  timing: NoticeTimingWords;
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
          <p className="font-medium">These instalments cannot be given {timing.lead}&apos; notice:</p>
          <ul className="list-disc space-y-1 pl-5">
            {late.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <label className="flex items-start gap-2">
            <input type="checkbox" name="confirmLate" className="mt-1" />
            <span>I confirm these notices go out today with less than {timing.lead}&apos; notice (never less than the {minimumWords(timing)} {timing.minimumDays} days).</span>
          </label>
        </div>
      )}
      {state.success && (
        <p className="text-sm text-green-700">
          {typeof state.data?.count === "number" && state.data.count > 0 ? `${state.data.count} notice(s) issued today.` : "No notices go out today."}
          {typeof state.data?.planned === "number" && state.data.planned > 0
            ? ` ${state.data.planned} planned: each goes out ${timing.lead} before it falls due${typeof state.data?.nextIssueOn === "string" ? `, the next on ${state.data.nextIssueOn.split("-").reverse().join("/")}` : ""}.`
            : ""}
          {typeof state.data?.emailed === "number" ? ` ${state.data.emailed} emailed to owners.` : ""}
          {typeof state.data?.creditApplied === "number" && state.data.creditApplied > 0
            ? ` $${state.data.creditApplied.toFixed(2)} of owner credit applied.`
            : ""}
        </p>
      )}
      {isSpecial && timing.urgentDays != null && (
        <label className="flex items-start gap-2 text-sm text-ink">
          <input type="checkbox" name="urgentSpecialLevy" className="mt-1" />
          <span>
            This is an urgent special {levyWords.levy} for emergency repairs. The minimum notice to pay is {timing.urgentDays} days instead of {timing.minimumDays}.
          </span>
        </label>
      )}
      {!isSpecial && (
        <p className="text-sm text-ink-muted">
          {levyWords.levies[0].toUpperCase() + levyWords.levies.slice(1)} are paid in advance: each instalment falls due on the first day of the period it covers. Each notice goes out by email {timing.lead} before
          it falls due. Any whose {timing.mark} has passed go out today, once you confirm.
        </p>
      )}
      <Button type="submit" disabled={pending || blocked}>
        {pending ? "Saving..." : isSpecial ? `Issue ${noticeCount} notice${noticeCount === 1 ? "" : "s"}` : `Plan ${noticeCount} notice${noticeCount === 1 ? "" : "s"}`}
      </Button>
    </form>
  );
}

/** Send, once confirmed, the planned notices past their 5-week mark. */
export function OverdueNoticesForm({ schemeId, scheduleId, count, timing }: { schemeId: string; scheduleId: string; count: number; timing: NoticeTimingWords }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(issueOverdueNoticesAction.bind(null, schemeId, scheduleId), {});
  const late = Array.isArray(state.data?.late) ? (state.data.late as string[]) : [];
  const missing = Array.isArray(state.data?.missing) ? (state.data.missing as { code: string; message: string }[]) : [];
  const held = Array.isArray(state.data?.held) ? (state.data.held as string[]) : [];
  return (
    <form action={formAction} className="space-y-3 rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-medium">
        {count} planned notice{count === 1 ? " is" : "s are"} past {count === 1 ? "its" : "their"} {timing.mark} and {count === 1 ? "has" : "have"} not gone out.
      </p>
      {timing.dueDateMayMove === false ? (
        <p>They go out today once you confirm. Any with fewer than {timing.minimumDays} days left cannot go out, because this building&apos;s rules do not let their due date move.</p>
      ) : (
        <p>They go out today once you confirm. Any with fewer than {timing.minimumDays} days left fall due {timing.minimumDays} days from today instead, the {timing.minimumIsStatutory === false ? "StrataVerze" : "statutory"} minimum.</p>
      )}
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
        <span>I confirm these notices go out today with less than {timing.lead}&apos; notice (never less than the {minimumWords(timing)} {timing.minimumDays} days).</span>
      </label>
      {state.error && <p role="alert" className="text-red-700">{state.error}</p>}
      {state.success && <p className="text-green-700">{String(state.data?.count ?? 0)} notice(s) sent, {String(state.data?.emailed ?? 0)} emailed to owners.</p>}
      {state.success && held.length > 0 && (
        <div role="status" className="space-y-1">
          <p className="font-medium">These notices were not sent:</p>
          <ul className="list-disc space-y-1 pl-5">
            {held.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
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
  today,
}: {
  schemeId: string;
  noticeId: string;
  balance: number;
  isSpecialLevy?: boolean;
  /** Today in the building's time zone (the default payment date). */
  today: string;
  /** StrataVerze transaction fee rows, or null when no fee is charged. */
  feeTable?: TransactionFeeTable | null;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    recordLevyPaymentFormAction.bind(null, schemeId, noticeId),
    {},
  );
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
