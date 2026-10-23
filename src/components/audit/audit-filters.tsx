import { AUDIT_CATEGORIES, AUDIT_OUTCOMES } from "@/lib/queries/security-audit";

const categoryLabels: Record<string, string> = {
  auth: "Sign-in and passwords",
  mfa: "Two-step sign-in",
  session: "Sessions",
  access: "Refusals",
  view: "Page views",
  export: "Exports",
  document: "Document downloads",
  activity: "Changes (activity)",
  scheme: "Buildings",
  contractor: "Contractor review",
  admin: "Administration",
  action: "Actions taken (every form and button)",
  lot: "Lots",
  membership: "Owners and memberships",
};

/** A plain GET form, so filters live in the address and work without script. */
export function AuditFilters({ action, category, outcome }: { action: string; category: string; outcome: string }) {
  return (
    <form method="get" action={action} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs font-medium text-ink">
        Type
        <select name="category" defaultValue={category} className="rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm">
          <option value="">All</option>
          {AUDIT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {categoryLabels[c] ?? c}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-ink">
        Result
        <select name="outcome" defaultValue={outcome} className="rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm">
          <option value="">All</option>
          {AUDIT_OUTCOMES.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="rounded-full px-5 h-9 text-[13px] font-semibold uppercase tracking-[0.04em] bg-turquoise text-white">
        Filter
      </button>
    </form>
  );
}
