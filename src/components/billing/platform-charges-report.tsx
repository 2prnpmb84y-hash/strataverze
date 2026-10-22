import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { formatAud } from "@/lib/billing/money";
import { monthLabel } from "@/lib/billing/invoice";
import { AGENT_BENCHMARK, costPerLotPerYear, feesByCodeAndMonth } from "@/lib/billing/platform-report";
import type { PlatformFeesData } from "@/lib/queries/platform-billing";

const CODE_LABELS: Record<string, string> = {
  SUBSCRIPTION_SMALL: "Subscription",
  SUBSCRIPTION_MEDIUM: "Subscription",
  SUBSCRIPTION_LARGE: "Subscription",
  SUBSCRIPTION_ENTERPRISE: "Subscription",
  PROMOTIONAL_CREDIT: "Promotional credit",
  TXN_FEE: "Transaction fees",
  TXN_FEE_FLAT: "Transaction fees",
  MEETING_EGM: "General meetings",
  BALLOT: "Electronic ballots",
  RECOVERY_STEP: "Debt recovery",
  YEAR_END_PACK: "Year-end pack",
  ACCOUNTANT_SEAT: "Accountant seats",
  CLAIM_HANDLING: "Insurance claims",
  WORKS_CONTRACT: "Works contracts",
  WORKS_VARIATION: "Contract variations",
};

const STATUS: Record<string, string> = {
  DRAFT: "Draft",
  ISSUED: "Issued",
  APPROVED: "Approved",
  PAID: "Paid",
  CANCELLED: "Cancelled",
};

/** Platform charges report: by fee type and month, invoices, and cost per lot per year. */
export function PlatformChargesReport({ data, asAt = new Date() }: { data: PlatformFeesData; asAt?: Date }) {
  const events = data.events.map((e) => ({
    code: e.code,
    status: e.status,
    occurredAt: e.occurredAt,
    exGstCents: e.exGstCents,
    gstCents: e.gstCents,
  }));
  const lots = data.subscription.lotCount;
  const perLot = costPerLotPerYear(events, lots, asAt);
  const last12 = events
    .filter((e) => e.status !== "WAIVED" && new Date(e.occurredAt).getTime() > asAt.getTime() - 365 * 86_400_000)
    .reduce((s, e) => s + e.exGstCents + e.gstCents, 0);

  // Roll the codes up to readable categories, by month.
  const cells = feesByCodeAndMonth(events);
  const rows = new Map<string, { month: string; label: string; totalCents: number; count: number }>();
  for (const c of cells) {
    const label = CODE_LABELS[c.code] ?? c.code;
    const key = `${c.month}|${label}`;
    const row = rows.get(key) ?? { month: c.month, label, totalCents: 0, count: 0 };
    row.totalCents += c.totalCents;
    row.count += c.count;
    rows.set(key, row);
  }
  const byMonth = [...rows.values()].sort((a, b) => b.month.localeCompare(a.month) || a.label.localeCompare(b.label));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="StrataVerze charges, last 12 months" value={formatAud(last12)} />
        <StatCard
          label={`Cost per lot per year (${lots} lots)`}
          value={perLot == null ? "No lots" : formatAud(perLot)}
          accent="bg-[#B9F3E9]"
        />
        <StatCard label="Agency benchmark per lot per year" value={formatAud(AGENT_BENCHMARK.centsPerLotPerYear)} accent="bg-[#FFD18B]" />
      </div>
      <p className="text-xs text-ink-muted -mt-3">
        Amounts include GST. The benchmark is the {AGENT_BENCHMARK.label}. It has not been independently verified, and agency
        fees vary with the services included.
      </p>

      <Card>
        <CardHeader title="Charges by month" description="Net of reversals. Waived charges are not included." />
        {byMonth.length === 0 ? (
          <p className="text-sm text-ink-muted">No charges have been recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-ink-muted border-b border-line">
                  <th className="py-2 pr-4 font-medium">Month</th>
                  <th className="py-2 pr-4 font-medium">Charge</th>
                  <th className="py-2 pr-4 font-medium text-right">Count</th>
                  <th className="py-2 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {byMonth.map((r) => (
                  <tr key={`${r.month}-${r.label}`}>
                    <td className="py-2 pr-4 whitespace-nowrap">{monthLabel(r.month)}</td>
                    <td className="py-2 pr-4">{r.label}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{r.count}</td>
                    <td className="py-2 text-right tabular-nums">{formatAud(r.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="StrataVerze invoices" />
        {data.invoices.length === 0 ? (
          <p className="text-sm text-ink-muted">No invoices have been issued.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-ink-muted border-b border-line">
                  <th className="py-2 pr-4 font-medium">Invoice</th>
                  <th className="py-2 pr-4 font-medium">Period</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.invoices.map((i) => (
                  <tr key={i.id}>
                    <td className="py-2 pr-4">
                      <a href={`/api/platform-invoices/${i.id}/pdf`} target="_blank" rel="noopener" className="text-turquoise hover:underline">
                        {i.invoiceNumber}
                      </a>
                    </td>
                    <td className="py-2 pr-4">{monthLabel(i.periodStart.slice(0, 7))}</td>
                    <td className="py-2 pr-4">{STATUS[i.status] ?? i.status}</td>
                    <td className="py-2 text-right tabular-nums">{formatAud(i.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
