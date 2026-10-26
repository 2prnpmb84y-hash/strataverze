/**
 * A works request's details and photos, for the owner and adviser pages
 * (works marketplace stage 1, 25 Oct 2026).
 */
import type { RequestView } from "@/lib/works/view";
import { formatDateTimeIn } from "@/lib/jurisdiction/time-zone";
import { APPROVAL_RULES } from "@/config/works";
import { votesRequired } from "@/lib/works/decision-rules";

function when(tz: string, iso: string | null) {
  if (!iso) return "";
  return formatDateTimeIn(tz, iso);
}

/** How many votes this building needs, in a sentence. */
export function ruleSentence(view: Pick<RequestView, "settings" | "committeeSize">): string {
  const r = votesRequired(view.settings.approvalRule, view.committeeSize);
  if (!r) return "The building has no committee members to decide.";
  const rule = APPROVAL_RULES[view.settings.approvalRule].toLowerCase();
  const urgent = view.settings.urgentLimit != null ? "An urgent order needs only one member." : "An urgent order needs the same votes until the committee sets an urgent spending limit.";
  return `This building's rule: ${rule} (${r.required} of ${view.committeeSize}). Your proposal counts as your vote. ${urgent}`;
}

export function RequestDetails({ view }: { view: RequestView }) {
  const r = view.request;
  return (
    <div className="space-y-5">
      {r.returnReason && r.status === "DRAFT" && (
        <div className="rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">The committee asked for more detail</p>
          <p className="text-sm text-amber-900 mt-1 whitespace-pre-wrap">{r.returnReason}</p>
        </div>
      )}
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
        <div>
          <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">Kind of work</dt>
          <dd className="text-sm text-ink">{r.trade ?? "Not given"}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">Where</dt>
          <dd className="text-sm text-ink">{r.location ?? "Not given"}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">Raised by</dt>
          <dd className="text-sm text-ink">{r.raisedByName}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">Sent to the committee</dt>
          <dd className="text-sm text-ink">{when(view.timeZone, r.submittedAt) || "Not yet"}</dd>
        </div>
      </dl>
      <div>
        <p className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">The problem</p>
        <p className="text-sm text-ink whitespace-pre-wrap" style={{ overflowWrap: "anywhere" }}>{r.description}</p>
      </div>
      {view.photos.length > 0 && (
        <div>
          <p className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-2">Photos</p>
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {view.photos.map((p) => (
              <li key={p.id}>
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-[var(--radius-card)] border border-line bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage link */}
                  <img src={p.url} alt={p.fileName} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-ink-muted">Photo links last 15 minutes. Reload the page if one does not open.</p>
        </div>
      )}
    </div>
  );
}
