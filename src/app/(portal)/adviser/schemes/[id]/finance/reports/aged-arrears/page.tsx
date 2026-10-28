import { notFound } from "next/navigation";
import { formatDateIn, todayIn } from "@/lib/jurisdiction/time-zone";
import { timeZoneOf } from "@/lib/jurisdiction/scheme-time";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getIssuedLevyNoticesForScheme } from "@/lib/queries/levy-schedules";
import { agedArrears } from "@/lib/levies/levy-ledger";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { connection } from "next/server";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { packWordsFor } from "@/lib/jurisdiction/screen-words";

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

export default async function AgedArrearsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const notices = await getIssuedLevyNoticesForScheme(id);
  const w = packWordsFor(rulesForState(scheme.state).rules);
  // Arrears as at today in the building's time zone.
  const tz = timeZoneOf(scheme);
  const now = new Date();
  const lotInfo = new Map(
    notices.map((n) => [
      n.lotId,
      {
        lotNumber: n.lot?.lotNumber ? String(n.lot.lotNumber) : "0",
        unitNumber: n.lot?.unitNumber ? String(n.lot.unitNumber) : null,
      },
    ]),
  );

  // Outstanding balances by lot, bucketed by days past the due date
  const lotMap = new Map<string, ArrearRow>(
    agedArrears(notices, todayIn(tz, now)).map((r) => [
      r.lotId,
      {
        lotNumber: lotInfo.get(r.lotId)?.lotNumber ?? "0",
        unitNumber: lotInfo.get(r.lotId)?.unitNumber ?? null,
        current: r.current,
        days30: r.days30,
        days60: r.days60,
        days90: r.days90,
        days90Plus: r.days90Plus,
        total: r.total,
      },
    ]),
  );

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
        description={`${String(scheme.name)} | As at ${formatDateIn(tz, now, { day: "2-digit", month: "2-digit", year: "numeric" })}`}
        backHref={`/adviser/schemes/${id}/finance/reports`}
        backLabel="Reports"
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No outstanding arrears"
          description={`All ${w.levies} are fully paid or no ${w.levies} have been issued.`}
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
                  <tr className="border-b border-line text-xs text-ink-muted uppercase tracking-wide">
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
                      className="border-b border-line/50"
                    >
                      <td className="px-6 py-2 font-medium text-ink">
                        {row.lotNumber}
                      </td>
                      <td className="px-4 py-2 text-ink-muted">
                        {row.unitNumber ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-ink">
                        {row.current > 0 ? formatCurrency(row.current) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-ink">
                        {row.days30 > 0 ? formatCurrency(row.days30) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-ink">
                        {row.days60 > 0 ? formatCurrency(row.days60) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-ink">
                        {row.days90 > 0 ? formatCurrency(row.days90) : "—"}
                      </td>
                      <td
                        className={`px-4 py-2 text-right tabular-nums ${
                          row.days90Plus > 0
                            ? "text-red-600 font-medium"
                            : "text-ink"
                        }`}
                      >
                        {row.days90Plus > 0
                          ? formatCurrency(row.days90Plus)
                          : "—"}
                      </td>
                      <td className="px-6 py-2 text-right tabular-nums font-semibold text-ink">
                        {formatCurrency(row.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-line font-semibold">
                    <td className="px-6 py-3 text-ink" colSpan={2}>
                      Total
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink">
                      {totals.current > 0
                        ? formatCurrency(totals.current)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink">
                      {totals.days30 > 0
                        ? formatCurrency(totals.days30)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink">
                      {totals.days60 > 0
                        ? formatCurrency(totals.days60)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink">
                      {totals.days90 > 0
                        ? formatCurrency(totals.days90)
                        : "—"}
                    </td>
                    <td
                      className={`px-4 py-3 text-right tabular-nums ${
                        totals.days90Plus > 0
                          ? "text-red-600"
                          : "text-ink"
                      }`}
                    >
                      {totals.days90Plus > 0
                        ? formatCurrency(totals.days90Plus)
                        : "—"}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-ink">
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
