import { formatAud } from "@/lib/billing/money";
import type { ReferralIncomeRow } from "@/lib/queries/referral-income";

const day = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

/** Referral income StrataVerze received, in dollars, with its disclosure wording. */
export function ReferralIncomeDisclosure({ rows, title = "StrataVerze referral income" }: { rows: ReferralIncomeRow[]; title?: string }) {
  if (rows.length === 0) return null;
  const total = rows.reduce((s, r) => s + r.amountCents, 0);
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-white p-5 mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="font-heading font-semibold text-base text-ink">{title}</h2>
        <p className="font-semibold tabular-nums text-ink">{formatAud(total)}</p>
      </div>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="text-sm">
            <p className="text-ink">
              <span className="font-medium">{formatAud(r.amountCents)}</span> from {r.partnerName}, received {day(r.receivedAt)}
            </p>
            <p className="text-ink-muted mt-0.5">{r.disclosureText}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
