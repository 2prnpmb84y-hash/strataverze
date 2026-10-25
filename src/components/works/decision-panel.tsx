"use client";

/**
 * The committee's decision on a works request (works marketplace stage 1,
 * 25 Oct 2026): propose how it is handled, vote on an open proposal, or
 * withdraw your own. Shown to committee members, and to the Adviser where
 * the building delegates works decisions.
 */
import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { proposeWorksRouteAction, voteWorksDecisionAction, withdrawWorksDecisionAction, type WorksFormState } from "@/lib/actions/works-marketplace";
import type { DecisionView, RequestViewer } from "@/lib/works/view";

const OUTCOME_CHOICES = [
  { value: "URGENT", label: "Urgent: order the work now", help: "Within the building's urgent spending limit, any one committee member can decide this. The work order goes straight to the preferred contractor for the trade." },
  { value: "QUOTES", label: "Get quotes", help: "The request goes to approved contractors in the trade who work in this area. The committee invites some to quote and approves one by vote. Over $30,000, two quotes are needed." },
  { value: "RETURN", label: "Return to the owner for more detail", help: "The owner is told what to add, and can send it again." },
  { value: "DECLINE", label: "Decline", help: "The request is closed and the owner is told why." },
] as const;

function Message({ state }: { state: WorksFormState }) {
  if (state.error) return <p className="text-sm text-red-600" role="alert">{state.error}</p>;
  if (state.done) return <p className="text-sm text-emerald-700" role="status">{state.done}</p>;
  return null;
}

function ProposeForm({ schemeId, requestId, ruleSentence, byDelegation, urgentLimit, requestTitle, requestDescription }: { schemeId: string; requestId: string; ruleSentence: string; byDelegation: boolean; urgentLimit: number | null; requestTitle: string; requestDescription: string }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<string>("");
  const [state, formAction, isPending] = useActionState<WorksFormState, FormData>(async (prev, fd) => {
    const r = await proposeWorksRouteAction(schemeId, requestId, prev, fd);
    if (r.done) router.refresh();
    return r;
  }, {});

  return (
    <form action={formAction} className="space-y-4">
      <p className="text-sm text-ink-muted">{byDelegation ? "The building delegates works decisions to you, so your decision takes effect at once and is recorded as made under the delegation." : ruleSentence}</p>
      <fieldset className="space-y-2">
        <legend className="sr-only">How should this request be handled?</legend>
        {OUTCOME_CHOICES.map((o) => (
          <label key={o.value} className={`flex items-start gap-3 rounded-[var(--radius-card)] border p-3 cursor-pointer ${outcome === o.value ? "border-turquoise bg-turquoise/5" : "border-line bg-white"}`}>
            <input type="radio" name="outcome" value={o.value} required checked={outcome === o.value} onChange={() => setOutcome(o.value)} className="mt-1 accent-turquoise" />
            <span className="text-sm">
              <span className="font-medium text-ink">{o.label}</span>
              <span className="block text-ink-muted mt-0.5">{o.help}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {outcome === "URGENT" && (
        <div>
          <label htmlFor="amount" className="block text-sm font-medium text-ink mb-1.5">Most the work may cost (dollars)<span className="text-red-500 ml-0.5">*</span></label>
          <input id="amount" name="amount" required inputMode="decimal" placeholder="e.g. 1500" className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-turquoise" />
          <p className="mt-1.5 text-xs text-ink-muted">
            {byDelegation
              ? "As Adviser you can decide this up to the limit the committee set for you."
              : urgentLimit != null
                ? `Up to $${urgentLimit.toLocaleString("en-AU")}, one member can decide. Over that, it needs the usual votes.`
                : "The building has no urgent spending limit yet, so this needs the usual votes."}{" "}
            The contractor sees this as the most they may charge without checking with the building.
          </p>
        </div>
      )}
      {outcome === "QUOTES" && (
        <div className="space-y-3 rounded-[var(--radius-card)] border border-line bg-muted p-3">
          <p className="text-sm text-ink">
            <span className="font-medium">What contractors see before they are invited.</span> Approved contractors in the trade who work in this postcode see this, the suburb and the photos. Take out names, unit numbers and anything private.
          </p>
          <div>
            <label htmlFor="summaryTitle" className="block text-sm font-medium text-ink mb-1.5">Title<span className="text-red-500 ml-0.5">*</span></label>
            <input id="summaryTitle" name="summaryTitle" required maxLength={300} defaultValue={requestTitle} className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-turquoise" />
          </div>
          <div>
            <label htmlFor="summary" className="block text-sm font-medium text-ink mb-1.5">Summary<span className="text-red-500 ml-0.5">*</span></label>
            <textarea id="summary" name="summary" required rows={4} maxLength={5000} defaultValue={requestDescription} className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-turquoise" />
          </div>
        </div>
      )}
      {outcome === "RETURN" ? (
        <div>
          <label htmlFor="returnReason" className="block text-sm font-medium text-ink mb-1.5">What does the owner need to add?<span className="text-red-500 ml-0.5">*</span></label>
          <textarea id="returnReason" name="returnReason" rows={3} required maxLength={2000} className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-turquoise" placeholder="The owner sees this. e.g. Which unit is affected, and a photo of the ceiling please." />
        </div>
      ) : (
        <div>
          <label htmlFor="note" className="block text-sm font-medium text-ink mb-1.5">Reason {outcome === "DECLINE" ? "" : <span className="font-normal text-ink-muted">(optional)</span>}{outcome === "DECLINE" && <span className="text-red-500 ml-0.5">*</span>}</label>
          <textarea id="note" name="note" rows={3} required={outcome === "DECLINE"} maxLength={2000} className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-turquoise" placeholder={outcome === "DECLINE" ? "The owner sees this. e.g. This is inside lot 4 and is the owner's to repair." : "For the committee's record."} />
        </div>
      )}
      <Message state={state} />
      <Button type="submit" disabled={isPending || !outcome}>{isPending ? "Recording..." : byDelegation ? "Decide" : "Propose and vote for it"}</Button>
    </form>
  );
}

function VoteForm({ schemeId, requestId, decisionId }: { schemeId: string; requestId: string; decisionId: string }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<WorksFormState, FormData>(async (prev, fd) => {
    const r = await voteWorksDecisionAction(schemeId, requestId, decisionId, prev, fd);
    if (r.done) router.refresh();
    return r;
  }, {});
  return (
    <form action={formAction} className="space-y-3 border-t border-line pt-4">
      <label htmlFor="comment" className="block text-sm font-medium text-ink">Your vote <span className="font-normal text-ink-muted">(a comment is optional)</span></label>
      <textarea id="comment" name="comment" rows={2} maxLength={2000} className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-turquoise" />
      <Message state={state} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" name="vote" value="FOR" disabled={isPending}>Vote for</Button>
        <Button type="submit" name="vote" value="AGAINST" variant="danger" disabled={isPending}>Vote against</Button>
      </div>
    </form>
  );
}

function WithdrawButton({ schemeId, requestId, decisionId }: { schemeId: string; requestId: string; decisionId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!confirming) return <Button type="button" variant="ghost" onClick={() => setConfirming(true)}>Withdraw the proposal</Button>;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm text-ink">Withdraw it? The votes so far are kept in the record.</span>
      <Button
        type="button"
        variant="danger"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await withdrawWorksDecisionAction(schemeId, requestId, decisionId);
            if (r.error) setError(r.error);
            else router.refresh();
          })
        }
      >
        {pending ? "Withdrawing..." : "Yes, withdraw"}
      </Button>
      <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>Keep it</Button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </div>
  );
}

const STATUS_TEXT: Record<string, string> = { OPEN: "Open for votes", DECIDED: "Decided", NOT_AGREED: "Not agreed", WITHDRAWN: "Withdrawn" };

function when(iso: string) {
  return new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" });
}

export function DecisionRecord({ decision }: { decision: DecisionView }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-white p-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink">{decision.outcomeLabel}</p>
        <span className="text-xs text-ink-muted">{STATUS_TEXT[decision.status] ?? decision.status}</span>
      </div>
      <p className="text-xs text-ink-muted">Proposed by {decision.proposedByName}, {when(decision.createdAt)}{decision.byDelegation ? ", as Adviser under the building's delegation" : ""}</p>
      {decision.amount != null && <p className="text-sm text-ink">Not to exceed ${decision.amount.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>}
      {decision.note && <p className="text-sm text-ink whitespace-pre-wrap">{decision.note}</p>}
      {decision.summary && (
        <div className="rounded-[var(--radius-card)] bg-muted p-3 text-sm">
          <p className="text-xs text-ink-muted mb-1">Contractors will see, before they are invited:</p>
          <p className="font-medium text-ink">{decision.summary.title}</p>
          <p className="text-ink whitespace-pre-wrap">{decision.summary.body}</p>
        </div>
      )}
      <p className="text-sm text-ink">{decision.votesSentence}</p>
      {decision.votes.length > 0 && (
        <ul className="text-sm divide-y divide-line">
          {decision.votes.map((v, i) => (
            <li key={i} className="py-1.5 flex flex-wrap gap-x-2">
              <span className={v.vote === "FOR" ? "text-emerald-700 font-medium" : "text-red-700 font-medium"}>{v.vote === "FOR" ? "For" : "Against"}</span>
              <span className="text-ink">{v.voterName}</span>
              <span className="text-ink-muted text-xs self-center">{when(v.at)}</span>
              {v.comment && <span className="basis-full text-ink-muted">{v.comment}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DecisionPanel({
  schemeId,
  requestId,
  can,
  decisions,
  openDecisionId,
  ruleSentence,
  urgentLimit = null,
  requestTitle = "",
  requestDescription = "",
}: {
  /** Pre-fill for the summary contractors see (Get quotes). */
  requestTitle?: string;
  requestDescription?: string;
  schemeId: string;
  requestId: string;
  /** The building's urgent spending limit, for the urgent amount hint. */
  urgentLimit?: number | null;
  can: RequestViewer;
  decisions: DecisionView[];
  openDecisionId: string | null;
  /** How many votes this building needs, in a sentence. */
  ruleSentence: string;
}) {
  const open = decisions.find((d) => d.id === openDecisionId) ?? null;
  const past = decisions.filter((d) => d.id !== openDecisionId);
  const delegated = can.isAdviser && !can.isCommitteeMember;
  return (
    <div className="space-y-4">
      {can.adviserNote && <p className="text-sm text-ink-muted">{can.adviserNote}</p>}
      {open && (
        <div className="space-y-3">
          <DecisionRecord decision={open} />
          {can.canVote && <VoteForm schemeId={schemeId} requestId={requestId} decisionId={open.id} />}
          {!can.canVote && can.isCommitteeMember && <p className="text-sm text-ink-muted">You have voted on this proposal.</p>}
          {can.canWithdraw && <WithdrawButton schemeId={schemeId} requestId={requestId} decisionId={open.id} />}
        </div>
      )}
      {can.canPropose && <ProposeForm schemeId={schemeId} requestId={requestId} ruleSentence={ruleSentence} byDelegation={delegated} urgentLimit={urgentLimit} requestTitle={requestTitle} requestDescription={requestDescription} />}
      {past.length > 0 && (
        <details className="group" open={!open && !can.canPropose}>
          <summary className="cursor-pointer text-sm font-medium text-ink">Decision record ({past.length})</summary>
          <div className="mt-3 space-y-3">
            {past.map((d) => (
              <DecisionRecord key={d.id} decision={d} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
