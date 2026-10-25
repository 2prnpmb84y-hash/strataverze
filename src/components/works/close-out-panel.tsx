"use client";

/**
 * Finishing and paying for a request's work, for the committee and the
 * Adviser (works stage 4, 25 Oct 2026): confirm the contractor's report that
 * the work is done, check their invoice, agree any extra cost by vote, and
 * send it for the building's payment approvals with the fund and account.
 */
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { answerCompletionAction, returnWorksInvoiceAction, sendWorksInvoiceToFinanceAction } from "@/lib/actions/works-completion";
import { proposeVariationAction, type WorksFormState } from "@/lib/actions/works-marketplace";
import type { closeOutForCommittee } from "@/lib/works/completion";

export type CloseOutView = NonNullable<Awaited<ReturnType<typeof closeOutForCommittee>>>;

const field = "w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-turquoise";
const dollars = (n: number | null) => (n == null ? "not set" : `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const day = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "");

function Message({ state }: { state: WorksFormState }) {
  if (state.error) return <p className="text-sm text-red-600" role="alert">{state.error}</p>;
  if (state.done) return <p className="text-sm text-emerald-700" role="status">{state.done}</p>;
  return null;
}

function useRefreshing(action: (prev: WorksFormState, fd: FormData) => Promise<WorksFormState>) {
  const router = useRouter();
  return useActionState<WorksFormState, FormData>(async (prev, fd) => {
    const r = await action(prev, fd);
    if (r.done) router.refresh();
    return r;
  }, {});
}

function AnswerCompletion({ schemeId, workOrderId }: { schemeId: string; workOrderId: string }) {
  const [mode, setMode] = useState<"" | "BACK">("");
  const [state, formAction, pending] = useRefreshing(answerCompletionAction.bind(null, schemeId, workOrderId));
  return (
    <form action={formAction} className="space-y-3">
      {mode === "BACK" && (
        <div>
          <label htmlFor="co-comments" className="block text-sm font-medium text-ink mb-1.5">What still needs doing<span className="text-red-500 ml-0.5">*</span></label>
          <textarea id="co-comments" name="comments" required rows={3} maxLength={2000} className={field} />
        </div>
      )}
      <Message state={state} />
      <div className="flex flex-wrap gap-2">
        {mode === "BACK" ? (
          <>
            <Button type="submit" name="answer" value="SEND_BACK" variant="danger" disabled={pending}>{pending ? "Sending..." : "Send it back"}</Button>
            <Button type="button" variant="ghost" onClick={() => setMode("")}>Back</Button>
          </>
        ) : (
          <>
            <Button type="submit" name="answer" value="CONFIRM" disabled={pending}>{pending ? "Saving..." : "Confirm the work is done"}</Button>
            <Button type="button" variant="ghost" onClick={() => setMode("BACK")}>It is not finished</Button>
          </>
        )}
      </div>
    </form>
  );
}

function ReturnInvoice({ schemeId, invoiceId }: { schemeId: string; invoiceId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useRefreshing(returnWorksInvoiceAction.bind(null, schemeId, invoiceId));
  if (!open) return <Button type="button" variant="ghost" onClick={() => setOpen(true)}>Send the invoice back</Button>;
  return (
    <form action={formAction} className="space-y-2">
      <label htmlFor={`ri-${invoiceId}`} className="block text-sm font-medium text-ink">What is wrong with it<span className="text-red-500 ml-0.5">*</span> <span className="font-normal text-ink-muted">(the contractor is told)</span></label>
      <textarea id={`ri-${invoiceId}`} name="reason" required rows={2} maxLength={2000} className={field} />
      <Message state={state} />
      <div className="flex gap-2">
        <Button type="submit" variant="danger" disabled={pending}>{pending ? "Sending..." : "Send it back"}</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Back</Button>
      </div>
    </form>
  );
}

function ProposeVariation({ schemeId, requestId, invoiceId }: { schemeId: string; requestId: string; invoiceId: string }) {
  const [state, formAction, pending] = useRefreshing(proposeVariationAction.bind(null, schemeId, requestId, invoiceId));
  return (
    <form action={formAction} className="space-y-2">
      <label htmlFor={`pv-${invoiceId}`} className="block text-sm text-ink">Note for the committee <span className="text-ink-muted">(optional)</span></label>
      <input id={`pv-${invoiceId}`} name="note" maxLength={2000} className={field} />
      <Message state={state} />
      <Button type="submit" disabled={pending}>{pending ? "Proposing..." : "Propose agreeing the extra"}</Button>
      <p className="text-xs text-ink-muted">Your proposal counts as your vote. If it is not agreed, send the invoice back saying what the building will pay.</p>
    </form>
  );
}

function SendToFinance({ schemeId, invoiceId, choices }: { schemeId: string; invoiceId: string; choices: NonNullable<CloseOutView["choices"]> }) {
  const [fundId, setFundId] = useState("");
  const [state, formAction, pending] = useRefreshing(sendWorksInvoiceToFinanceAction.bind(null, schemeId, invoiceId));
  const accounts = fundId ? choices.accounts.filter((a) => !a.fundId || a.fundId === fundId) : [];
  const err = state.fieldErrors ?? {};
  const fundHelp: Record<string, string> = {
    ADMINISTRATIVE: "day-to-day repairs and running costs",
    CAPITAL_WORKS: "major repairs and replacements in the capital works plan",
  };
  return (
    <form action={formAction} className="space-y-3 rounded-[var(--radius-card)] border border-line bg-muted p-3">
      <p className="text-sm font-medium text-ink">Send for payment approval</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <label htmlFor={`sf-fund-${invoiceId}`} className="block text-sm text-ink mb-1.5">Paid from<span className="text-red-500 ml-0.5">*</span></label>
          <select id={`sf-fund-${invoiceId}`} name="fundId" required value={fundId} onChange={(e) => setFundId(e.target.value)} className={field}>
            <option value="">Choose the fund</option>
            {choices.funds.map((f) => (
              <option key={f.id} value={f.id}>{f.name}{fundHelp[f.fundType] ? ` (${fundHelp[f.fundType]})` : ""}</option>
            ))}
          </select>
          {err.fundId && <p className="mt-1 text-xs text-red-500">{err.fundId}</p>}
        </div>
        <div className="min-w-0">
          <label htmlFor={`sf-acct-${invoiceId}`} className="block text-sm text-ink mb-1.5">Expense account<span className="text-red-500 ml-0.5">*</span></label>
          <select id={`sf-acct-${invoiceId}`} name="accountCodeId" required disabled={!fundId} className={`${field} disabled:bg-muted`}>
            <option value="">{fundId ? (accounts.length ? "Choose an account" : "No expense accounts for this fund") : "Choose the fund first"}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.code} {a.name}</option>
            ))}
          </select>
          {err.accountCodeId && <p className="mt-1 text-xs text-red-500">{err.accountCodeId}</p>}
        </div>
      </div>
      {choices.funds.length === 0 && <p className="text-sm text-red-600">The building has no funds set up in its accounts yet. The Adviser sets them up under Finance.</p>}
      <Message state={state} />
      <Button type="submit" disabled={pending || !fundId}>{pending ? "Sending..." : "Send for payment approval"}</Button>
      <p className="text-xs text-ink-muted">It then needs the building&apos;s usual payment approvals. You prepared it, so you cannot also approve it. Asks you to confirm with your authenticator if you have not recently.</p>
    </form>
  );
}

export function CloseOutPanel({ schemeId, requestId, view, financeHref }: { schemeId: string; requestId: string; view: CloseOutView; financeHref: string }) {
  const { order, completion, live, can } = view;
  return (
    <div className="space-y-6">
      {can.conflicted && (
        <p className="rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          You are a contact of {order.contractorName}, so you take no part in confirming, agreeing or approving this job. Someone else on the committee does.
        </p>
      )}
      <div className="space-y-2">
        <p className="text-sm text-ink">
          <span className="font-medium">{order.contractorName}</span>, work order {order.workOrderNumber}. Not to exceed {dollars(order.amountLimit)}.
        </p>
        {!completion && <p className="text-sm text-ink-muted">The contractor has not reported the work done yet.</p>}
        {completion && (
          <div className="space-y-2 rounded-[var(--radius-card)] border border-line bg-white p-3">
            <p className="text-sm font-medium text-ink">{completion.statusLabel}{order.completedOn ? `, finished ${day(order.completedOn)}` : ""}</p>
            <p className="text-sm text-ink whitespace-pre-wrap" style={{ overflowWrap: "anywhere" }}>{completion.summary}</p>
            {completion.reviewComments && <p className="text-sm text-ink-muted">Building&apos;s note: {completion.reviewComments}</p>}
            {view.photos.length > 0 && (
              <>
                <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                  {view.photos.map((p) => (
                    <li key={p.id}>
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-[var(--radius-card)] border border-line bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage link */}
                        <img src={p.url} alt={p.fileName} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                      </a>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-ink-muted">Photo links last 15 minutes. Reload the page if one does not open.</p>
              </>
            )}
            {can.answerCompletion && <AnswerCompletion schemeId={schemeId} workOrderId={order.id} />}
          </div>
        )}
        {view.earlierReports.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-ink-muted">Earlier reports ({view.earlierReports.length})</summary>
            <ul className="mt-2 space-y-2">
              {view.earlierReports.map((r) => (
                <li key={r.id} className="text-ink-muted">
                  {r.statusLabel}: {r.summary}
                  {r.reviewComments ? ` Building's note: ${r.reviewComments}` : ""}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium text-ink">Invoices</p>
        {view.invoices.length === 0 && <p className="text-sm text-ink-muted">No invoice yet.</p>}
        {view.invoices.map((inv) => {
          const isLive = live?.id === inv.id;
          return (
            <div key={inv.id} className={`space-y-3 rounded-[var(--radius-card)] border p-3 ${isLive ? "border-line bg-white" : "border-line bg-muted"}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-medium text-ink">Invoice {inv.invoiceNumber}, {day(inv.invoiceDate)}</span>
                <span className="tabular-nums font-semibold text-ink">{dollars(inv.total)}</span>
              </div>
              <p className="text-sm text-ink-muted">
                {inv.statusLabel}. GST {dollars(inv.gst)}. Due {day(inv.dueDate)}.{inv.paid > 0 ? ` Paid so far ${dollars(inv.paid)}.` : ""}{" "}
                {inv.documentUrl && (
                  <a href={inv.documentUrl} target="_blank" rel="noopener noreferrer" className="text-turquoise underline">
                    Open the invoice{inv.documentName ? ` (${inv.documentName})` : ""}
                  </a>
                )}
              </p>
              {inv.returnReason && <p className="text-sm text-ink-muted">Sent back: {inv.returnReason}</p>}
              {inv.variation.overLimit && (
                <div className="rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <p>
                    More than the {dollars(inv.variation.limit)} the work order allowed.{" "}
                    {inv.variation.agreed ? "The committee agreed the extra." : inv.variation.openDecisionId ? "The committee is voting on the extra (see the committee's decision on this page)." : inv.variation.notAgreed ? "The committee did not agree the extra." : "The committee must agree the extra before it can be paid."}
                  </p>
                  {inv.excessReason && <p className="mt-1">The contractor&apos;s reason: {inv.excessReason}</p>}
                </div>
              )}
              {isLive && inv.status === "SUBMITTED" && order.status !== "COMPLETE" && <p className="text-sm text-ink-muted">Confirm the work is done before sending it for payment.</p>}
              {isLive && can.proposeVariation && <ProposeVariation schemeId={schemeId} requestId={requestId} invoiceId={inv.id} />}
              {isLive && can.sendToFinance && view.approvalWarning && <p className="rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{view.approvalWarning}</p>}
              {isLive && can.sendToFinance && view.choices && <SendToFinance schemeId={schemeId} invoiceId={inv.id} choices={view.choices} />}
              {isLive && inv.status === "SUBMITTED" && !can.maySend && order.status === "COMPLETE" && (
                <p className="text-sm text-ink-muted">A committee member chooses the fund and account and sends it for payment approval. The building has not asked the Adviser to.</p>
              )}
              {isLive && can.returnInvoice && <ReturnInvoice schemeId={schemeId} invoiceId={inv.id} />}
              {inv.supplierInvoiceId && ["WITH_FINANCE", "APPROVED", "PARTIALLY_PAID"].includes(inv.status) && (
                <div className="text-sm text-ink-muted space-y-1">
                  {inv.bank && <p className={inv.bank.status === "VERIFIED" ? "" : "text-amber-800"}>{inv.bank.label}</p>}
                  <p>
                    <Link href={financeHref} className="text-turquoise underline">
                      {inv.status === "WITH_FINANCE" ? "Payment approvals" : "The building's finance"}
                    </Link>
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
