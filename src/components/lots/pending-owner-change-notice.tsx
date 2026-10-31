import { Hourglass } from "lucide-react";
import type { CommitteePendingOwnerChangeView } from "@/lib/owner/owner-change-requests";

const ddmmyyyy = (d: string) => d.split("-").reverse().join("/");

/**
 * The committee's notice of a change of owner waiting for review (H-1 review
 * M1). A server component from a reduced view: what was recorded and who
 * reviews it. It never receives the outgoing owners' addresses, the
 * committee seats, the invitation plan or the recorder's addresses, so none
 * of them reach the committee member's browser.
 */
export function PendingOwnerChangeNotice({ lotLabel, change }: { lotLabel: string; change: CommitteePendingOwnerChangeView }) {
  return (
    <section aria-label={`Change of owner waiting, ${lotLabel}`} className="mb-6 rounded-[var(--radius-card)] border border-amber-300 bg-amber-50 px-5 py-4">
      <h2 className="flex items-center gap-2 font-heading text-sm font-semibold text-ink">
        <Hourglass size={14} aria-hidden="true" />
        Change of owner waiting for {change.reviewer}, {lotLabel}
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Nothing changes until {change.reviewer} confirms it: the strata roll still shows the current owner, who keeps their portal access, and no invitation has
        been sent.
      </p>
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-xs text-ink-muted">New owner (as it will appear on the strata roll)</dt>
          <dd className="break-words text-ink">{change.ownerName}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-ink-muted">Settlement date</dt>
          <dd className="text-ink">{ddmmyyyy(change.settlementDate)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-ink-muted">Recorded by</dt>
          <dd className="break-words text-ink">
            {change.recordedByName}, {ddmmyyyy(change.recordedOn)}
          </dd>
        </div>
      </dl>
    </section>
  );
}
