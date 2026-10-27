"use client";

/**
 * The committee's view of a request's marketplace quotes (works stage 3,
 * 25 Oct 2026): deadlines, who is interested, inviting, the quotes side by
 * side, and proposing one to approve. Approving goes to the committee's vote.
 */
import { useActionState, useState, useTransition } from "react";
import { dayIn, formatDateTimeIn } from "@/lib/jurisdiction/time-zone";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  cancelRfqAction,
  inviteContractorsAction,
  openForQuotesAction,
  sendQuoteOrderAction,
  proposeQuoteApprovalAction,
  setRfqDeadlinesAction,
  type WorksFormState,
} from "@/lib/actions/works-marketplace";
import type { rfqForCommittee } from "@/lib/works/marketplace";

type Rfq = NonNullable<Awaited<ReturnType<typeof rfqForCommittee>>>;
const money = (n: number) => `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** Deadlines are shown, and entered, as days in the building's time zone (the server reads them the same way). */
const when = (tz: string, iso: string | null) => (iso ? formatDateTimeIn(tz, iso, { weekday: "short", year: undefined }) : "Not set");
const dateInput = (tz: string, iso: string | null, plusDays = 0) => dayIn(tz, iso ? new Date(iso) : new Date(Date.now() + plusDays * 86_400_000));
const field = "w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-turquoise";

function Message({ state }: { state: WorksFormState }) {
  if (state.error) return <p className="text-sm text-red-600" role="alert">{state.error}</p>;
  if (state.done) return <p className="text-sm text-emerald-700" role="status">{state.done}</p>;
  return null;
}

function useRefreshingAction(action: (prev: WorksFormState, fd: FormData) => Promise<WorksFormState>) {
  const router = useRouter();
  return useActionState<WorksFormState, FormData>(async (prev, fd) => {
    const r = await action(prev, fd);
    if (r.done) router.refresh();
    return r;
  }, {});
}

export function OpenForQuotes({ schemeId, requestId, needsSummary, ownerTitle, ownerDescription }: { schemeId: string; requestId: string; needsSummary: boolean; ownerTitle: string; ownerDescription: string }) {
  const [state, formAction, pending] = useRefreshingAction((p, fd) => openForQuotesAction(schemeId, requestId, p, fd));
  return (
    <form action={formAction} className="space-y-3">
      <p className="text-sm text-ink-muted">The committee decided to get quotes, but the request has not gone to contractors yet.</p>
      {needsSummary && (
        <div className="space-y-3 rounded-[var(--radius-card)] border border-line bg-muted p-3">
          <p className="text-sm text-ink">Write what contractors see before they are invited. Leave out names, unit numbers and anything private.</p>
          <details className="text-xs text-ink-muted">
            <summary className="cursor-pointer">The owner&apos;s words, for reference (not shown to contractors)</summary>
            <p className="mt-1 font-medium">{ownerTitle}</p>
            <p className="mt-1 whitespace-pre-wrap">{ownerDescription}</p>
          </details>
          <div>
            <label htmlFor="ofq-title" className="block text-sm font-medium text-ink mb-1.5">Title<span className="text-red-500 ml-0.5">*</span></label>
            <input id="ofq-title" name="summaryTitle" required maxLength={300} className={field} />
          </div>
          <div>
            <label htmlFor="ofq-summary" className="block text-sm font-medium text-ink mb-1.5">Summary<span className="text-red-500 ml-0.5">*</span></label>
            <textarea id="ofq-summary" name="summary" required rows={4} maxLength={5000} className={field} />
          </div>
        </div>
      )}
      <Message state={state} />
      <Button type="submit" disabled={pending}>{pending ? "Opening..." : "Open to contractors"}</Button>
    </form>
  );
}

function SendQuoteOrder({ schemeId, requestId }: { schemeId: string; requestId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState<WorksFormState>({});
  return (
    <div className="space-y-2 rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm text-amber-900">A quote was approved, but its work order has not gone out.</p>
      <Button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await sendQuoteOrderAction(schemeId, requestId);
            setState(r);
            if (r.done) router.refresh();
          })
        }
      >
        {pending ? "Sending..." : "Send the work order"}
      </Button>
      <Message state={state} />
    </div>
  );
}

function CancelRfq({ schemeId, requestId, rfqId }: { schemeId: string; requestId: string; rfqId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useRefreshingAction((p, fd) => cancelRfqAction(schemeId, requestId, rfqId, p, fd));
  if (state.done) return <Message state={state} />;
  if (!open) return <Button type="button" variant="ghost" onClick={() => setOpen(true)}>Take off the marketplace</Button>;
  return (
    <form action={formAction} className="space-y-2">
      <p className="text-sm text-ink">Contractors who were interested or invited are told it is no longer going ahead. The request goes back to the committee to decide again.</p>
      <label htmlFor="rfq-cancel" className="block text-sm text-ink">Reason <span className="text-ink-muted">(for the record)</span></label>
      <input id="rfq-cancel" name="reason" maxLength={2000} className={field} />
      <Message state={state} />
      <div className="flex gap-2">
        <Button type="submit" variant="danger" disabled={pending}>{pending ? "Saving..." : "Take it off"}</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Keep it open</Button>
      </div>
    </form>
  );
}

function Deadlines({ schemeId, requestId, rfq }: { schemeId: string; requestId: string; rfq: Rfq }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useRefreshingAction((p, fd) => setRfqDeadlinesAction(schemeId, requestId, rfq.id, p, fd));
  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide">Interest closes</dt>
          <dd className="text-ink">{when(rfq.timeZone, rfq.interestClosesAt)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide">Quotes close</dt>
          <dd className="text-ink">{rfq.quoteClosesAt ? when(rfq.timeZone, rfq.quoteClosesAt) : "Set when you invite"}</dd>
        </div>
      </dl>
      {rfq.canChangeDeadlines && !open && (
        <Button type="button" variant="ghost" onClick={() => setOpen(true)}>Change a deadline</Button>
      )}
      {open && (
        <form action={formAction} className="grid gap-3 sm:grid-cols-2 items-end">
          {rfq.status === "INTEREST" && (
            <div>
              <label htmlFor="d-interest" className="block text-sm text-ink mb-1">Interest closes (end of day)</label>
              <input id="d-interest" name="interestClosesAt" type="date" defaultValue={dateInput(rfq.timeZone, rfq.interestClosesAt)} className={field} />
            </div>
          )}
          {(rfq.status === "QUOTING" || rfq.status === "CLOSED") && (
            <div>
              <label htmlFor="d-quote" className="block text-sm text-ink mb-1">Quotes close (end of day)</label>
              <input id="d-quote" name="quoteClosesAt" type="date" defaultValue={dateInput(rfq.timeZone, rfq.quoteClosesAt)} className={field} />
            </div>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Save"}</Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
          <div className="sm:col-span-2"><Message state={state} /></div>
        </form>
      )}
    </div>
  );
}

function Invite({ schemeId, requestId, rfq, direct }: { schemeId: string; requestId: string; rfq: Rfq; direct: Array<{ id: string; name: string; suburb: string | null; listsTrade: boolean }> }) {
  const [state, formAction, pending] = useRefreshingAction((p, fd) => inviteContractorsAction(schemeId, requestId, rfq.id, p, fd));
  const notInvited = rfq.interested.filter((i) => !i.invited && i.approved);
  const invitedIds = new Set(rfq.invitations.map((i) => i.businessId));
  const directOptions = direct.filter((d) => !invitedIds.has(d.id) && !notInvited.some((n) => n.businessId === d.id));
  return (
    <form action={formAction} className="space-y-3 rounded-[var(--radius-card)] border border-line bg-white p-4">
      <p className="text-sm font-medium text-ink">Invite contractors to quote</p>
      {notInvited.length ? (
        <fieldset className="space-y-1.5">
          <legend className="text-xs text-ink-muted mb-1">Interested ({notInvited.length})</legend>
          {notInvited.map((i) => (
            <label key={i.businessId} className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="businessId" value={i.businessId} className="accent-turquoise" />
              {i.name}
              {i.suburb ? <span className="text-ink-muted">, {i.suburb}</span> : null}
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="text-sm text-ink-muted">{rfq.interested.length ? "Everyone interested has been invited." : "No contractor has expressed interest yet."}</p>
      )}
      <div>
        <label htmlFor="inv-direct" className="block text-xs text-ink-muted mb-1">Or invite an approved contractor directly</label>
        <select id="inv-direct" name="businessId" defaultValue="" className={field}>
          <option value="">No one else</option>
          {directOptions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
              {d.suburb ? `, ${d.suburb}` : ""}
              {d.listsTrade ? " (lists this trade)" : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="inv-limit" className="block text-xs text-ink-muted mb-1">How many to invite in all</label>
          <input id="inv-limit" name="inviteLimit" type="number" min={1} max={10} defaultValue={rfq.inviteLimit} className={field} />
        </div>
        <div>
          <label htmlFor="inv-closes" className="block text-xs text-ink-muted mb-1">Quotes close (end of day)</label>
          <input id="inv-closes" name="quoteClosesAt" type="date" defaultValue={dateInput(rfq.timeZone, rfq.quoteClosesAt, 7)} className={field} />
        </div>
      </div>
      <Message state={state} />
      <Button type="submit" disabled={pending}>{pending ? "Inviting..." : "Invite"}</Button>
      <p className="text-xs text-ink-muted">Invited contractors see the address, where in the building, and your name and contact details. They are emailed.</p>
    </form>
  );
}

function ProposeApproval({ schemeId, requestId, quotationId, name }: { schemeId: string; requestId: string; quotationId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useRefreshingAction((p, fd) => proposeQuoteApprovalAction(schemeId, requestId, quotationId, p, fd));
  if (state.done) return <p className="text-sm text-emerald-700" role="status">{state.done}</p>;
  if (!open) return <Button type="button" variant="secondary" onClick={() => setOpen(true)}>Propose approving</Button>;
  return (
    <form action={formAction} className="space-y-2">
      <label htmlFor={`note-${quotationId}`} className="block text-sm text-ink">Why this quote? <span className="text-ink-muted">(for the committee&apos;s record)</span></label>
      <textarea id={`note-${quotationId}`} name="note" rows={2} maxLength={2000} className={field} />
      <Message state={state} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Proposing..." : `Propose approving ${name}`}</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}

export function QuotesPanel({
  schemeId,
  requestId,
  rfq,
  canAct,
  canPropose,
  decisionOpen,
  direct,
}: {
  schemeId: string;
  requestId: string;
  rfq: Rfq;
  /** Committee member or Adviser: may invite and change deadlines. */
  canAct: boolean;
  /** May propose approving a quote (committee member, or the Adviser under delegation). */
  canPropose: boolean;
  /** A decision on this request is open: vote on it first. */
  decisionOpen: boolean;
  direct: Array<{ id: string; name: string; suburb: string | null; listsTrade: boolean }>;
}) {
  const over = rfq.quotes.some((q) => q.total > rfq.twoQuoteThreshold);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink">
          <span className="font-medium">{rfq.rfqNumber}</span> · {rfq.statusLabel}
        </p>
        <p className="text-xs text-ink-muted">{rfq.trade} · postcode {rfq.postcode}</p>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-ink-muted">What contractors see before they are invited</summary>
        <p className="mt-2 font-medium text-ink">{rfq.title}</p>
        <p className="mt-1 text-ink whitespace-pre-wrap">{rfq.summary}</p>
      </details>

      <Deadlines schemeId={schemeId} requestId={requestId} rfq={canAct ? rfq : { ...rfq, canChangeDeadlines: false }} />

      {rfq.invitations.length > 0 && (
        <div>
          <p className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">Invited</p>
          <ul className="text-sm divide-y divide-line rounded-[var(--radius-card)] border border-line bg-white">
            {rfq.invitations.map((i) => (
              <li key={i.businessId} className="px-3 py-2 flex flex-wrap justify-between gap-2">
                <span className="text-ink">{i.name}</span>
                <span className="text-ink-muted">
                  {i.status === "ACCEPTED" ? "Quoted" : i.status === "DECLINED" ? `Declined${i.declineReason ? `: ${i.declineReason}` : ""}` : i.status === "PENDING" ? "Not quoted yet" : i.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {canAct && rfq.needsOrder && <SendQuoteOrder schemeId={schemeId} requestId={requestId} />}

      {canAct && rfq.canInvite && <Invite schemeId={schemeId} requestId={requestId} rfq={rfq} direct={direct} />}

      <div>
        <p className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">Quotes ({rfq.quotes.length})</p>
        {rfq.quotes.length === 0 ? (
          <p className="text-sm text-ink-muted">No quotes yet.</p>
        ) : rfq.sealed ? (
          <div className="space-y-1">
            <ul className="text-sm text-ink list-disc pl-5">
              {rfq.quotes.map((q) => (
                <li key={q.id}>{q.name} has quoted</li>
              ))}
            </ul>
            <p className="text-xs text-ink-muted">Quotes stay sealed until quotes close, or every invited contractor has quoted, so no price can reach a contractor still able to change theirs.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted">
                  <th className="py-2 pr-3 font-medium">Contractor</th>
                  <th className="py-2 pr-3 font-medium text-right">Total (inc GST)</th>
                  <th className="py-2 pr-3 font-medium">Takes</th>
                  <th className="py-2 pr-3 font-medium">Valid until</th>
                  <th className="py-2 font-medium">Quote</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rfq.quotes.map((q) => (
                  <tr key={q.id} className="align-top">
                    <td className="py-2 pr-3 text-ink">
                      {q.name}
                      {q.status === "ACCEPTED" && <span className="ml-2 text-xs text-emerald-700">Approved</span>}
                      {(q.inclusions || q.exclusions || q.conditions) && (
                        <details className="mt-1 text-xs text-ink-muted">
                          <summary className="cursor-pointer">Details</summary>
                          {q.inclusions && <p className="mt-1 whitespace-pre-wrap"><span className="font-medium text-ink">Includes:</span> {q.inclusions}</p>}
                          {q.exclusions && <p className="mt-1 whitespace-pre-wrap"><span className="font-medium text-ink">Excludes:</span> {q.exclusions}</p>}
                          {q.conditions && <p className="mt-1 whitespace-pre-wrap"><span className="font-medium text-ink">Conditions:</span> {q.conditions}</p>}
                        </details>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-ink">{money(q.total)}<span className="block text-xs text-ink-muted">GST {money(q.gst)}</span></td>
                    <td className="py-2 pr-3 text-ink">{q.durationDays != null ? `${q.durationDays} day${q.durationDays === 1 ? "" : "s"}` : "Not given"}</td>
                    <td className="py-2 pr-3 text-ink">{q.validUntil ?? "Not given"}</td>
                    <td className="py-2 text-ink">
                      {q.documentUrl ? <a href={q.documentUrl} target="_blank" rel="noopener noreferrer" className="text-turquoise underline">{q.documentName ?? "Open"}</a> : <span className="text-ink-muted">None attached</span>}
                      {canPropose && rfq.readyToApprove && !decisionOpen && q.status === "SUBMITTED" && rfq.status !== "AWARDED" && (
                        <div className="mt-2"><ProposeApproval schemeId={schemeId} requestId={requestId} quotationId={q.id} name={q.name} /></div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rfq.quotes.length > 0 && !rfq.readyToApprove && !rfq.sealed && rfq.status !== "AWARDED" && <p className="mt-2 text-xs text-ink-muted">You can approve a quote once quotes close, or once every invited contractor has quoted.</p>}
        {canAct && rfq.canCancel && <div className="mt-4"><CancelRfq schemeId={schemeId} requestId={requestId} rfqId={rfq.id} /></div>}
        {over && <p className="mt-2 text-xs text-ink-muted">{rfq.twoQuoteSentence}</p>}
        {decisionOpen && <p className="mt-2 text-xs text-ink-muted">A proposal is open above. Vote on it first.</p>}
        <p className="mt-2 text-xs text-ink-muted">Quote links last 15 minutes. Reload the page if one does not open.</p>
      </div>
    </div>
  );
}
