"use client";

/**
 * A request's urgent work orders, and (for the committee or the Adviser)
 * sending one to a chosen contractor when none is preferred or the first
 * declined (works marketplace stage 2, 25 Oct 2026).
 */
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cancelUrgentOrderAction, issueUrgentOrderAction, type WorksFormState } from "@/lib/actions/works-marketplace";

function CancelOrder({ schemeId, workOrderId }: { schemeId: string; workOrderId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<WorksFormState, FormData>(async (prev, fd) => {
    const r = await cancelUrgentOrderAction(schemeId, workOrderId, prev, fd);
    if (r.done) router.refresh();
    return r;
  }, {});
  if (state.done) return <p className="text-sm text-emerald-700" role="status">{state.done}</p>;
  if (!open) return <Button type="button" variant="ghost" onClick={() => setOpen(true)}>No answer? Cancel this order</Button>;
  return (
    <form action={formAction} className="space-y-2">
      <label htmlFor={`cancel-${workOrderId}`} className="block text-sm text-ink">Why cancel? <span className="text-ink-muted">(the contractor is told)</span></label>
      <input id={`cancel-${workOrderId}`} name="reason" maxLength={2000} placeholder="e.g. No reply after two hours" className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-turquoise" />
      {state.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="danger" disabled={isPending}>{isPending ? "Cancelling..." : "Cancel the order"}</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Keep it</Button>
      </div>
    </form>
  );
}

export interface OrderRow {
  id: string;
  workOrderNumber: string;
  statusLabel: string;
  status: string;
  contractorName: string;
  amountLimit: number | null;
  declineReason: string | null;
}

const money = (n: number) => `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function UrgentOrderPanel({
  schemeId,
  requestId,
  orders,
  canIssue,
  mayChoose,
  amount,
  contractors,
  preferredContractorId,
  trade,
}: {
  schemeId: string;
  requestId: string;
  orders: OrderRow[];
  /** An order can go out now (urgent decided, none live). */
  canIssue: boolean;
  /** The viewer may send one (committee member or Adviser). */
  mayChoose: boolean;
  amount: number | null;
  contractors: Array<{ id: string; name: string; suburb: string | null; trades: string[] }>;
  preferredContractorId: string | null;
  trade: string | null;
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<WorksFormState, FormData>(async (prev, fd) => {
    const r = await issueUrgentOrderAction(schemeId, requestId, prev, fd);
    if (r.done) router.refresh();
    return r;
  }, {});
  const t = (trade ?? "").toLowerCase();
  const sorted = [...contractors].sort((a, b) => Number(b.trades.some((x) => x.toLowerCase() === t)) - Number(a.trades.some((x) => x.toLowerCase() === t)) || a.name.localeCompare(b.name));
  const declined = orders.some((o) => o.status === "DECLINED" || o.status === "CANCELLED");

  return (
    <div className="space-y-4">
      {orders.length > 0 ? (
        <ul className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-white">
          {orders.map((o) => (
            <li key={o.id} className="px-4 py-3 space-y-0.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-ink">
                  {o.workOrderNumber}: {o.contractorName}
                </p>
                <span className="text-xs text-ink-muted">{o.statusLabel}</span>
              </div>
              {o.amountLimit != null && <p className="text-xs text-ink-muted">Not to exceed {money(o.amountLimit)}</p>}
              {o.declineReason && <p className="text-sm text-ink-muted">{o.status === "CANCELLED" ? "Cancelled" : "Their reason"}: {o.declineReason}</p>}
              {mayChoose && o.status === "AWAITING_ACKNOWLEDGEMENT" && <CancelOrder schemeId={schemeId} workOrderId={o.id} />}
            </li>
          ))}
        </ul>
      ) : (
        !canIssue && <p className="text-sm text-ink-muted">No work order yet.</p>
      )}

      {canIssue && (
        <div className="rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 p-4 space-y-3">
          <p className="text-sm text-amber-900">
            {declined
              ? "The last order was declined or cancelled. Choose a contractor to send the work order to."
              : preferredContractorId
                ? "The work order has not gone out yet. Check the contractor and send it."
                : `There is no approved preferred contractor for ${trade ?? "this kind of work"}, so the work order has not gone out yet.`}
            {amount != null ? ` It will say not to exceed ${money(amount)}.` : ""}
          </p>
          {mayChoose ? (
            <form action={formAction} className="space-y-3">
              <label htmlFor="uo-contractor" className="block text-sm font-medium text-ink">Contractor</label>
              <select id="uo-contractor" name="contractorBusinessId" required defaultValue={declined ? "" : preferredContractorId ?? ""} className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-turquoise">
                <option value="">{sorted.length ? "Choose a contractor" : "No contractors are approved yet"}</option>
                {sorted.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.suburb ? `, ${c.suburb}` : ""}
                    {c.trades.some((x) => x.toLowerCase() === t) ? " (lists this trade)" : ""}
                  </option>
                ))}
              </select>
              {state.fieldErrors?.contractorBusinessId && <p className="text-xs text-red-500">{state.fieldErrors.contractorBusinessId}</p>}
              {state.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>}
              {state.done && <p className="text-sm text-emerald-700" role="status">{state.done}</p>}
              <Button type="submit" disabled={isPending || !sorted.length}>{isPending ? "Sending..." : "Send the work order"}</Button>
              <p className="text-xs text-ink-muted">This asks you to confirm with your authenticator if you have not recently. The contractor is emailed.</p>
            </form>
          ) : (
            <p className="text-sm text-amber-900">The committee or the Adviser will choose a contractor.</p>
          )}
        </div>
      )}
    </div>
  );
}
