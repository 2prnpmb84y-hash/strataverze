import { notFound } from "next/navigation";
import { requireFinancialReadAccess } from "@/lib/auth/require-accountant-access";
import { getSchemeById } from "@/lib/queries/schemes";
import { getLeviesForScheme } from "@/lib/queries/levies";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { connection } from "next/server";

function formatCurrency(value: number): string {
  if (value < 0) {
    return `($${Math.abs(value).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
  }
  return `$${value.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface ArrearRow {
  lotNumber: string;
  unitNumber: string | null;
  current: number;
  days30: number;
  days60: number;
  days90: number;
  days90Plus: number;
  total: number;
}

export default async function AccountantAgedArrearsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;

  await requireFinancialReadAccess(id);

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const levies = await getLeviesForScheme(id);
  const now = new Date();

  // Aggregate outstanding amounts by lot and age bracket
  const lotMap = new Map<string, ArrearRow>();

  for (const levy of levies) {
    if (String(levy.status) === "DRAFT") continue;

    const dueDate = new Date(String(levy.dueDate));
    const daysPastDue = Math.floor(
      (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    for (const item of levy.items) {
      const balance = Number(item.amount) - Number(item.paidAmount);
      if (balance <= 0.005) continue;

      const lotId = item.lotId;
      const lot = item.lot;

      if (!lotMap.has(lotId)) {
        lotMap.set(lotId, {
          lotNumber: lot?.lotNumber ? String(lot.lotNumber) : "0",
          unitNumber: lot?.unitNumber ? String(lot.unitNumber) : null,
          current: 0,
          days30: 0,
          days60: 0,
          days90: 0,
          days90Plus: 0,
          total: 0,
        });
      }

      const row = lotMap.get(lotId)!;
      row.total += balance;

      if (daysPastDue <= 0) {
        row.current += balance;
      } else if (daysPastDue <= 30) {
        row.days30 += balance;
      } else if (daysPastDue <= 60) {
        row.days60 += balance;
      } else if (daysPastDue <= 90) {
        row.days90 += balance;
      } else {
        row.days90Plus += balance;
      }
    }
  }

  const rows = Array.from(lotMap.values()).sort((a, b) =>
    a.lotNumber.localeCompare(b.lotNumber, undefined, { numeric: true }),
  );

  const totals = rows.reduce(
    (acc, r) => ({
      current: acc.current + r.current,
      days30: acc.days30 + r.days30,
      days60: acc.days60 + r.days60,
      days90: acc.days90 + r.days90,
      days90Plus: acc.days90Plus + r.days90Plus,
      total: acc.total + r.total,
    }),
    { current: 0, days30: 0, days60: 0, days90: 0, days90Plus: 0, total: 0 },
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Aged Arrears"
        description={`${String(scheme.name)} | As at ${now.toLocaleDateString("en-AU")}`}
        backHref={`/accountant/schemes/${id}/finance/reports`}
        backLabel="Reports"
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No outstanding arrears"
          description="All levies are fully paid or no levies have been issued."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard
              label="Current"
              value={formatCurrency(totals.current)}
              accent="bg-green-500"
            />
            <StatCard
              label="1 to 30 days"
              value={formatCurrency(totals.days30)}
              accent="bg-amber-400"
            />
            <StatCard
              label="31 to 60 days"
              value={formatCurrency(totals.days60)}
              accent="bg-amber-500"
            />
            <StatCard
              label="61 to 90 days"
              value={formatCurrency(totals.days90)}
              accent="bg-orange-500"
            />
            <StatCard
              label="90+ days"
              value={formatCurrency(totals.days90Plus)}
              accent="bg-red-500"
            />
            <StatCard
              label="Total Outstanding"
              value={formatCurrency(totals.total)}
              accent="bg-zinc-600"
            />
          </div>

          <Card>
            <CardHeader
              title="Arrears by Lot"
              description={`${rows.length} lot${rows.length !== 1 ? "s" : ""} with outstanding balances`}
            />

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                    <th scope="col" className="text-left px-6 py-2">Lot</th>
                    <th scope="col" className="text-left px-4 py-2">Unit</th>
                    <th scope="col" className="text-right px-4 py-2">Current</th>
                    <th scope="col" className="text-right px-4 py-2">1-30 days</th>
                    <th scope="col" className="text-right px-4 py-2">31-60 days</th>
                    <th scope="col" className="text-right px-4 py-2">61-90 days</th>
                    <th scope="col" className="text-right px-4 py-2">90+ days</th>
                    <th scope="col" className="text-right px-6 py-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.lotNumber}
                      className="border-b border-border/50"
                    >
                      <td className="px-6 py-2 font-medium text-foreground">
                        {row.lotNumber}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {row.unitNumber ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-foreground">
                        {row.current > 0 ? formatCurrency(row.current) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-foreground">
                        {row.days30 > 0 ? formatCurrency(row.days30) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-foreground">
                        {row.days60 > 0 ? formatCurrency(row.days60) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-foreground">
                        {row.days90 > 0 ? formatCurrency(row.days90) : "—"}
                      </td>
                      <td
                        className={`px-4 py-2 text-right tabular-nums ${
                          row.days90Plus > 0
                            ? "text-red-600 font-medium"
                            : "text-foreground"
                        }`}
                      >
                        {row.days90Plus > 0
                          ? formatCurrency(row.days90Plus)
                          : "—"}
                      </td>
                      <td className="px-6 py-2 text-right tabular-nums font-semibold text-foreground">
                        {formatCurrency(row.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border font-semibold">
                    <td className="px-6 py-3 text-foreground" colSpan={2}>
                      Total
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      {totals.current > 0
                        ? formatCurrency(totals.current)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      {totals.days30 > 0
                        ? formatCurrency(totals.days30)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      {totals.days60 > 0
                        ? formatCurrency(totals.days60)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      {totals.days90 > 0
                        ? formatCurrency(totals.days90)
                        : "—"}
                    </td>
                    <td
                      className={`px-4 py-3 text-right tabular-nums ${
                        totals.days90Plus > 0
                          ? "text-red-600"
                          : "text-foreground"
                      }`}
                    >
                      {totals.days90Plus > 0
                        ? formatCurrency(totals.days90Plus)
                        : "—"}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-foreground">
                      {formatCurrency(totals.total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
