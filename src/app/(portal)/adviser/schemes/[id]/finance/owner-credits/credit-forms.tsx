"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  applyOwnerCreditNowAction,
  cancelOwnerCreditRefundAction,
  recordOwnerCreditRefundPaidAction,
  requestOwnerCreditRefundAction,
  setAutoApplyOwnerCreditAction,
  type CreditActionState,
} from "@/lib/actions/owner-credits";

const input = "w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm text-ink";

function Result({ state }: { state: CreditActionState }) {
  if (state.error) return <p role="alert" className="text-sm text-red-600">{state.error}</p>;
  if (state.success && state.message) return <p className="text-sm text-green-700">{state.message}</p>;
  return null;
}

/** Prepare a refund of a lot's credit in one fund. */
export function RefundRequestForm({ schemeId, lotId, fundId, availableCents }: { schemeId: string; lotId: string; fundId: string; availableCents: number }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<CreditActionState, FormData>(
    requestOwnerCreditRefundAction.bind(null, schemeId, lotId, fundId),
    {},
  );
  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)} disabled={availableCents <= 0}>
        Refund credit
      </Button>
    );
  }
  return (
    <form action={formAction} className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className="text-sm text-ink">
        <span className="mb-1 block font-medium">Amount</span>
        <input name="amount" type="number" step="0.01" min="0.01" max={(availableCents / 100).toFixed(2)} defaultValue={(availableCents / 100).toFixed(2)} required className={input} />
      </label>
      <label className="text-sm text-ink">
        <span className="mb-1 block font-medium">Name on the owner&apos;s account</span>
        <input name="payeeName" required maxLength={200} className={input} />
      </label>
      <label className="text-sm text-ink">
        <span className="mb-1 block font-medium">BSB</span>
        <input name="bsb" required inputMode="numeric" placeholder="000-000" className={input} />
      </label>
      <label className="text-sm text-ink">
        <span className="mb-1 block font-medium">Account number</span>
        <input name="accountNumber" required inputMode="numeric" className={input} />
      </label>
      <label className="text-sm text-ink sm:col-span-2">
        <span className="mb-1 block font-medium">How were these bank details confirmed with the owner?</span>
        <select name="verificationMethod" required defaultValue="" className={input}>
          <option value="" disabled>
            Choose one
          </option>
          <option value="CALLBACK">I called the owner on a number already on the strata roll</option>
          <option value="DOCUMENT">The owner gave a bank document (statement or letter)</option>
        </select>
      </label>
      <label className="text-sm text-ink sm:col-span-2">
        <span className="mb-1 block font-medium">Reason (optional)</span>
        <input name="reason" maxLength={300} placeholder="For example, lot sold and the owner asked for the credit back" className={input} />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Request refund"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          Close
        </Button>
        <Result state={state} />
      </div>
    </form>
  );
}

/** `today` is today in the building's time zone (the default payment date). */
export function RecordRefundPaidForm({ schemeId, refundId, today }: { schemeId: string; refundId: string; today: string }) {
  const [state, formAction, pending] = useActionState<CreditActionState, FormData>(
    recordOwnerCreditRefundPaidAction.bind(null, schemeId, refundId),
    {},
  );
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <label className="text-xs text-ink-muted">
        <span className="mb-1 block">Date paid</span>
        <input name="paidOn" type="date" defaultValue={today} required className="rounded-[var(--radius-card)] border border-line bg-white px-2 py-1.5 text-sm text-ink" />
      </label>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving..." : "Record refund paid"}
      </Button>
      <Result state={state} />
    </form>
  );
}

function useSimpleAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ error?: string; success?: boolean }>, ok?: (r: Record<string, unknown>) => string | null) =>
    start(async () => {
      setError(null);
      setMessage(null);
      const r = (await fn()) as Record<string, unknown> & { error?: string };
      if (r.error) setError(r.error);
      else {
        setMessage(ok ? ok(r) : null);
        router.refresh();
      }
    });
  return { pending, message, error, run };
}

export function CancelRefundButton({ schemeId, refundId }: { schemeId: string; refundId: string }) {
  const { pending, error, run } = useSimpleAction();
  return (
    <span className="inline-flex items-center gap-2">
      <Button type="button" variant="secondary" disabled={pending} onClick={() => run(() => cancelOwnerCreditRefundAction(schemeId, refundId))}>
        Cancel refund
      </Button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}

export function ApplyCreditNowButton({ schemeId }: { schemeId: string }) {
  const { pending, error, message, run } = useSimpleAction();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          run(
            () => applyOwnerCreditNowAction(schemeId),
            (r) => {
              const cents = Number(r.appliedCents ?? 0);
              return cents > 0 ? `$${(cents / 100).toFixed(2)} of credit applied to open notices.` : "No open notices to apply credit to.";
            },
          )
        }
      >
        {pending ? "Applying..." : "Apply credit to open notices now"}
      </Button>
      {message && <span className="text-sm text-green-700">{message}</span>}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}

export function AutoApplyToggle({ schemeId, enabled }: { schemeId: string; enabled: boolean }) {
  const { pending, error, run } = useSimpleAction();
  return (
    <label className="flex items-start gap-2 text-sm text-ink">
      <input
        type="checkbox"
        defaultChecked={enabled}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          run(() => setAutoApplyOwnerCreditAction(schemeId, next));
        }}
        className="mt-1"
      />
      <span>
        Apply an owner&apos;s credit to their next levy notice automatically when notices are issued.
        {error && <span className="block text-xs text-red-600">{error}</span>}
      </span>
    </label>
  );
}
