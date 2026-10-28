import type { FundRequirementView } from "@/lib/jurisdiction/funds";

/**
 * Which funds the building must have and why, in its rule pack's words (VIC,
 * ACT and WA stage 2, PR 3). Shown only for a pack whose funds have
 * conditions: the server page passes null for NSW and Queensland, and nothing
 * renders. A fund that cannot be worked out says what to record.
 */
export function FundRequirements({ requirements, className = "" }: { requirements: readonly FundRequirementView[] | null | undefined; className?: string }) {
  if (!requirements?.length) return null;
  return (
    <div className={className}>
      <p className="text-xs font-medium text-ink-muted mb-2">Which funds this building needs</p>
      <ul className="flex flex-col gap-2">
        {requirements.map((r) => (
          <li key={r.key} className="rounded-[var(--radius-card)] border border-line px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium text-ink">{r.label}</p>
              <span
                className={`text-xs font-medium rounded-full px-2 py-0.5 ${
                  r.need === "REQUIRED" ? "bg-emerald-50 text-emerald-700" : r.need === "UNDECIDED" ? "bg-[#FFF3E0] text-ink" : "bg-muted text-ink-muted"
                }`}
              >
                {r.needLabel}
              </span>
            </div>
            {(r.reason ?? r.problem) && <p className="mt-1 text-xs text-ink">{r.reason ?? r.problem}</p>}
            <p className="mt-0.5 text-xs text-ink-muted">
              {r.provision}
              {r.statusNote ? ` · ${r.statusNote}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
