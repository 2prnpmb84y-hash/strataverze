import { auditActionLabel } from "@/lib/audit/labels";

export type SecurityEventRow = {
  seq: number;
  occurredAt: string;
  action: string;
  outcome: string;
  actor: string;
  actorRole: string | null;
  schemeId: string | null;
  resourceType: string | null;
  resourceId: string | null;
  reason: string | null;
  ipHash: string | null;
  metadata: Record<string, unknown>;
};

const outcomeStyle: Record<string, string> = {
  allowed: "bg-mint-soft text-ink",
  denied: "bg-red-50 text-red-700",
  failed: "bg-amber-50 text-amber-800",
};

function when(iso: string) {
  return new Date(iso).toLocaleString("en-AU", {
    timeZone: "Australia/Sydney",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function details(metadata: Record<string, unknown>) {
  return Object.entries(metadata)
    .filter(([k]) => k !== "inTransaction" || metadata[k] === true)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(" · ");
}

/** A read-only list of security audit events, newest first. */
export function SecurityEventList({ events, showScheme }: { events: SecurityEventRow[]; showScheme: boolean }) {
  return (
    <div className="overflow-x-auto -mx-6">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-[0.04em] text-ink-muted border-b border-line">
            <th className="px-6 py-2 font-medium">#</th>
            <th className="px-3 py-2 font-medium">When (Sydney)</th>
            <th className="px-3 py-2 font-medium">Event</th>
            <th className="px-3 py-2 font-medium">Who</th>
            <th className="px-3 py-2 font-medium">Result</th>
            <th className="px-6 py-2 font-medium">Details</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {events.map((e) => (
            <tr key={e.seq} className="align-top">
              <td className="px-6 py-2 text-xs text-ink-muted tabular-nums">{e.seq}</td>
              <td className="px-3 py-2 text-xs text-ink whitespace-nowrap tabular-nums">{when(e.occurredAt)}</td>
              <td className="px-3 py-2">
                <p className="text-ink">{auditActionLabel(e.action)}</p>
                <p className="text-xs text-ink-muted font-mono">{e.action}</p>
              </td>
              <td className="px-3 py-2">
                <p className="text-ink">{e.actor}</p>
                {e.actorRole && <p className="text-xs text-ink-muted">{e.actorRole}</p>}
              </td>
              <td className="px-3 py-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${outcomeStyle[e.outcome] ?? "bg-muted text-ink-muted"}`}>
                  {e.outcome}
                </span>
              </td>
              <td className="px-6 py-2 text-xs text-ink-muted max-w-[28rem] break-words">
                {e.reason && <p className="text-ink">{e.reason}</p>}
                {e.resourceType && (
                  <p>
                    {e.resourceType}
                    {e.resourceId ? ` ${e.resourceId.slice(0, 8)}` : ""}
                  </p>
                )}
                {showScheme && e.schemeId && <p>Building {e.schemeId.slice(0, 8)}</p>}
                {Object.keys(e.metadata).length > 0 && <p>{details(e.metadata)}</p>}
                {e.ipHash && <p>Source {e.ipHash}</p>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
