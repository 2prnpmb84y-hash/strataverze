import type { InvoiceControlView } from "@/lib/finance/control-view";

const ROLE_LABELS: Record<string, string> = {
  TREASURER: "Treasurer",
  PAYMENT_AUTHORISER: "Payment authoriser",
  ADVISER: "Adviser",
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" });

/** Approvals so far and what is still needed before the invoice can be paid. */
export function ApprovalPanel({ view, status }: { view: InvoiceControlView; status: string }) {
  const done = view.approvals.length;
  const waiting = done < view.required && !["APPROVED", "PARTIALLY_PAID", "PAID", "PAYMENT_INSTRUCTED", "CANCELLED"].includes(status);
  return (
    <div className="space-y-3">
      {view.exception && (
        <p role="status" className="rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Single approver exception: {view.exception} This has been logged.
        </p>
      )}
      <div className="text-sm">
        <p className="text-ink">
          <span className="font-medium">
            {done} of {view.required} approval{view.required === 1 ? "" : "s"}
          </span>
          <span className="text-ink-muted"> · {view.thresholdText}</span>
        </p>
        {view.approvals.length > 0 && (
          <ul className="mt-2 space-y-1">
            {view.approvals.map((a, i) => (
              <li key={i} className="text-ink-muted">
                {i + 1}. {a.name} ({ROLE_LABELS[a.role] ?? a.role}), {when(a.approvedAt)}
              </li>
            ))}
          </ul>
        )}
        {waiting && (
          <p className="mt-2 text-ink-muted">
            {view.approverNames.length === 0
              ? "Nobody can approve payments yet. Flag a treasurer on the committee, or add a payment authoriser."
              : `Can approve: ${view.approverNames.join(", ")}. The person who prepared the invoice cannot approve it.`}
          </p>
        )}
      </div>
      {view.bank.message && (
        <p
          className={`rounded-[var(--radius-card)] px-4 py-3 text-sm ${
            view.bank.blocked ? "border border-red-200 bg-red-50 text-red-700" : "border border-line bg-muted text-ink"
          }`}
        >
          {view.bank.message}
        </p>
      )}
    </div>
  );
}
