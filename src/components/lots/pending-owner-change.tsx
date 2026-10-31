"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Hourglass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmOwnerChangeAction, rejectOwnerChangeAction, type OwnerChangeReviewState } from "@/lib/actions/change-owner-review";
import type { PendingOwnerChangeView } from "@/lib/owner/owner-change-requests";

const ddmmyyyy = (d: string) => d.split("-").reverse().join("/");

/**
 * A change of owner a committee member recorded, waiting for review (H-1,
 * 31 Oct 2026). For the Adviser (and StrataVerze), `canDecide` shows Confirm
 * and Reject; for the committee it says who it is waiting for.
 */
export function PendingOwnerChange({
  schemeId,
  lotLabel,
  change,
  canDecide,
}: {
  schemeId: string;
  lotLabel: string;
  change: PendingOwnerChangeView;
  canDecide: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<OwnerChangeReviewState>({});
  const [busy, start] = useTransition();
  const decide = (action: typeof confirmOwnerChangeAction, confirmText: string) => {
    if (!window.confirm(confirmText)) return;
    start(async () => {
      const r = await action(schemeId, change.id);
      setState(r);
      router.refresh();
    });
  };

  const rows: Array<[string, string]> = [
    ["New owner (as it will appear on the strata roll)", change.ownerName],
    ["Settlement date", ddmmyyyy(change.settlementDate)],
    ["Email", change.email || "—"],
    ["Mobile", change.mobile || "—"],
    ["Phone", change.phone || "—"],
    ["Postal address", change.address || "—"],
    ["Invite the new owner", change.invite ? `Yes, to ${change.email}` : "No"],
    ["Notice of transfer", change.hasNotice ? "Filed in the document library (managers only)" : "None attached"],
    ["Recorded by", `${change.recordedByName}${canDecide && change.recordedByEmail ? ` (${change.recordedByEmail})` : ""}, ${ddmmyyyy(change.recordedOn)}`],
  ];

  const e = change.effect;
  const invitation = {
    SEND: `Yes: an invitation is sent to ${change.email}.`,
    ALREADY: `No new one: ${change.email} already has an invitation waiting.`,
    NOT_ASKED: "No (not asked for).",
    NO_EMAIL: "No (no email given).",
  }[e.invitation];
  const effects: Array<[string, string]> = [
    ["Owner on the strata roll now", e.rollOwnerName || "None recorded"],
    [
      "Portal access to this lot that ends",
      e.accessEnding.length ? e.accessEnding.map((a) => `${a.name}${a.email ? ` (${a.email})` : ""}`).join("; ") : "None (nobody has owner access to this lot)",
    ],
    ["Committee seats that end", e.seatsEnding.length ? e.seatsEnding.join("; ") : "None"],
    ...(e.seatsKept.length
      ? ([["Committee seats that continue", e.seatsKept.map((k) => `${k.name} (owner access to ${k.lotNumbers.map((n) => `Lot ${n}`).join(", ")})`).join("; ")]] as Array<[string, string]>)
      : []),
    ["New owner invited", invitation],
  ];
  const resemblance =
    change.resemblance === "local"
      ? "The new owner's email has the same name before the @ as the email of the committee member who recorded this change."
      : change.resemblance === "domain"
        ? "The new owner's email is at the same domain as the email of the committee member who recorded this change."
        : null;

  return (
    <section aria-labelledby={`pending-owner-${change.id}`} className="mb-6 rounded-[var(--radius-card)] border border-amber-300 bg-amber-50 px-5 py-4">
      <h2 id={`pending-owner-${change.id}`} className="flex items-center gap-2 font-heading text-sm font-semibold text-ink">
        <Hourglass size={14} aria-hidden="true" />
        Change of owner waiting for {canDecide ? "your review" : change.reviewer}, {lotLabel}
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        {canDecide
          ? "A committee member recorded this change. Nothing has changed yet: the strata roll still shows the current owner, who keeps their portal access and any committee seat, and no invitation has been sent. Confirming applies it as if you had recorded it; rejecting changes nothing."
          : `Nothing changes until ${change.reviewer} confirms it: the strata roll still shows the current owner, who keeps their portal access, and no invitation has been sent.`}
      </p>
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-xs text-ink-muted">{k}</dt>
            <dd className="break-words text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      {canDecide && (
        <div className="mt-4 rounded-[var(--radius-card)] border border-amber-200 bg-white px-4 py-3">
          <h3 className="text-xs font-semibold text-ink">If you confirm</h3>
          <dl className="mt-2 grid grid-cols-1 gap-y-2 text-sm">
            {effects.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-xs text-ink-muted">{k}</dt>
                <dd className="break-words text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-ink-muted">
            Access is never moved to another lot. If an outgoing owner owns another lot here, assign them to it from that lot&apos;s page.
          </p>
        </div>
      )}
      {canDecide && resemblance && (
        <p role="note" className="mt-3 rounded-[var(--radius-card)] border border-[#B33A3A] bg-white px-3 py-2 text-sm font-medium text-[#B33A3A]">
          Check before confirming: {resemblance}
        </p>
      )}
      {state.done && <p role="status" className="mt-3 text-sm text-[#1A7A63]">{state.done}</p>}
      {state.error && <p role="alert" className="mt-3 text-sm text-[#B33A3A]">{state.error}</p>}
      {canDecide && !state.done && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            disabled={busy}
            onClick={() => decide(confirmOwnerChangeAction, `Confirm the change of owner of ${lotLabel} to ${change.ownerName}? The outgoing owner's portal access ends${change.invite ? " and the new owner is invited" : ""}.`)}
          >
            {busy ? "Saving…" : "Confirm change of owner"}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => decide(rejectOwnerChangeAction, `Reject the change of owner of ${lotLabel} to ${change.ownerName}? Nothing changes on the strata roll.`)}>
            Reject
          </Button>
          <p className="w-full text-xs text-ink-muted">You may be asked for your authenticator code first.</p>
        </div>
      )}
    </section>
  );
}
