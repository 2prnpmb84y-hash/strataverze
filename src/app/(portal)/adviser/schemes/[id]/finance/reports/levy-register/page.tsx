import { notFound } from "next/navigation";
import { schemeToday } from "@/lib/jurisdiction/scheme-time";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getIssuedLevyNoticesForScheme } from "@/lib/queries/levy-schedules";
import { levyRegister, STATUS_LABELS } from "@/lib/levies/levy-ledger";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { connection } from "next/server";
import { OwnerCreditsCard } from "@/components/finance/owner-credits-card";

function formatCurrency(value: number): string {
  if (value < 0) {
    return `($${Math.abs(value).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
  }
  return `$${value.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-AU");
}

export default async function LevyRegisterPage({
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

  const levies = levyRegister(
    await getIssuedLevyNoticesForScheme(id),
    await schemeToday(id),
  );

  // Calculate totals
  let totalRaised = 0;
  let totalPaid = 0;
  let totalOutstanding = 0;
  let itemCount = 0;

  for (const levy of levies) {
    for (const item of levy.items) {
      totalRaised += item.amount;
      totalPaid += item.paidAmount;
      totalOutstanding += item.balance;
      itemCount++;
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Levy Register"
        description={String(scheme.name)}
        backHref={`/adviser/schemes/${id}/finance/reports`}
        backLabel="Reports"
      />

      {levies.length === 0 ? (
        <EmptyState
          title="No levies raised"
          description="Create a levy to see it appear in the register."
          actionLabel="Go to Levies"
          actionHref={`/adviser/schemes/${id}/finance/levies/new`}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <StatCard
              label="Total Raised"
              value={formatCurrency(totalRaised)}
              accent="bg-blue-500"
            />
            <StatCard
              label="Total Collected"
              value={formatCurrency(totalPaid)}
              accent="bg-green-500"
            />
            <StatCard
              label="Outstanding"
              value={formatCurrency(totalOutstanding)}
              accent="bg-amber-500"
            />
            <StatCard
              label="Levy Notices"
              value={String(itemCount)}
              accent="bg-zinc-400"
            />
          </div>

          {levies.map((levy) => (
            <Card key={levy.id}>
              <CardHeader
                title={levy.title}
                description={`${levy.levyType} levy | First due: ${formatDate(levy.dueDate)} | ${levy.items.length} notice${levy.items.length === 1 ? "" : "s"}`}
              />

              {/* Table header */}
              <div className="hidden sm:grid sm:grid-cols-[80px_80px_1fr_100px_100px_100px_90px] gap-4 px-6 pb-2 text-xs font-medium text-ink-muted uppercase tracking-wide border-b border-line">
                <div>Lot</div>
                <div>Unit</div>
                <div>Notice</div>
                <div className="text-right">Amount</div>
                <div className="text-right">Paid</div>
                <div className="text-right">Balance</div>
                <div className="text-right">Status</div>
              </div>

              <div className="divide-y divide-line">
                {levy.items
                  .sort((a, b) =>
                    (a.lot?.lotNumber ?? "").localeCompare(
                      b.lot?.lotNumber ?? "",
                      undefined,
                      { numeric: true },
                    ) || a.label.localeCompare(b.label),
                  )
                  .map((item) => {
                    const amount = item.amount;
                    const paid = item.paidAmount;
                    const balance = item.balance;

                    return (
                      <div
                        key={item.id}
                        className="grid grid-cols-1 sm:grid-cols-[80px_80px_1fr_100px_100px_100px_90px] gap-2 sm:gap-4 px-6 py-3 items-center"
                      >
                        <div className="text-sm text-ink font-medium">
                          {item.lot?.lotNumber ?? "—"}
                        </div>
                        <div className="text-sm text-ink-muted">
                          {item.lot?.unitNumber ? String(item.lot.unitNumber) : "—"}
                        </div>
                        <div className="text-sm text-ink">
                          {item.label}
                        </div>
                        <div className="text-sm text-right tabular-nums text-ink">
                          {formatCurrency(amount)}
                        </div>
                        <div className="text-sm text-right tabular-nums text-green-600">
                          {formatCurrency(paid)}
                        </div>
                        <div
                          className={`text-sm text-right tabular-nums font-medium ${
                            balance > 0 ? "text-red-600" : "text-ink"
                          }`}
                        >
                          {formatCurrency(balance)}
                        </div>
                        <div className="text-right">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              String(item.status) === "PAID"
                                ? "bg-green-100 text-green-700"
                                : String(item.status) === "OVERDUE"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {STATUS_LABELS[item.status] ?? item.status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Levy total */}
              <div className="px-6 py-3 border-t border-line bg-muted/20">
                <div className="grid grid-cols-1 sm:grid-cols-[80px_80px_1fr_100px_100px_100px_90px] gap-2 sm:gap-4 items-center">
                  <div className="sm:col-span-3 text-sm font-semibold text-ink">
                    Levy Total
                  </div>
                  <div className="text-sm text-right tabular-nums font-semibold text-ink">
                    {formatCurrency(levy.totalAmount)}
                  </div>
                  <div className="text-sm text-right tabular-nums font-semibold text-green-600">
                    {formatCurrency(
                      levy.items.reduce((s, i) => s + i.paidAmount, 0),
                    )}
                  </div>
                  <div className="text-sm text-right tabular-nums font-semibold text-ink">
                    {formatCurrency(
                      levy.items.reduce((s, i) => s + i.balance, 0),
                    )}
                  </div>
                  <div />
                </div>
              </div>
            </Card>
          ))}
        </>
      )}
      <OwnerCreditsCard schemeId={id} />
    </div>
  );
}
