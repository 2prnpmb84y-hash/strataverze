import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
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

  const levies = await getLeviesForScheme(id);

  // Calculate totals
  let totalRaised = 0;
  let totalPaid = 0;
  let totalOutstanding = 0;
  let itemCount = 0;

  for (const levy of levies) {
    for (const item of levy.items) {
      const amount = Number(item.amount);
      const paid = Number(item.paidAmount);
      totalRaised += amount;
      totalPaid += paid;
      totalOutstanding += amount - paid;
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
          actionLabel="Create Levy"
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
                title={String(levy.title)}
                description={`${levy.levyType} levy | Due: ${formatDate(String(levy.dueDate))} | Status: ${String(levy.status)}`}
              />

              {/* Table header */}
              <div className="hidden sm:grid sm:grid-cols-[80px_80px_1fr_100px_100px_100px_90px] gap-4 px-6 pb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b border-border">
                <div>Lot</div>
                <div>Unit</div>
                <div>Owner</div>
                <div className="text-right">Amount</div>
                <div className="text-right">Paid</div>
                <div className="text-right">Balance</div>
                <div className="text-right">Status</div>
              </div>

              <div className="divide-y divide-border">
                {levy.items
                  .sort((a, b) =>
                    (String(a.lot?.lotNumber ?? "")).localeCompare(
                      String(b.lot?.lotNumber ?? ""),
                      undefined,
                      { numeric: true },
                    ),
                  )
                  .map((item) => {
                    const amount = Number(item.amount);
                    const paid = Number(item.paidAmount);
                    const balance = amount - paid;

                    return (
                      <div
                        key={item.id}
                        className="grid grid-cols-1 sm:grid-cols-[80px_80px_1fr_100px_100px_100px_90px] gap-2 sm:gap-4 px-6 py-3 items-center"
                      >
                        <div className="text-sm text-foreground font-medium">
                          {item.lot?.lotNumber ?? "—"}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {item.lot?.unitNumber ? String(item.lot.unitNumber) : "—"}
                        </div>
                        <div className="text-sm text-foreground">
                          Lot {item.lot?.lotNumber}
                        </div>
                        <div className="text-sm text-right tabular-nums text-foreground">
                          {formatCurrency(amount)}
                        </div>
                        <div className="text-sm text-right tabular-nums text-green-600">
                          {formatCurrency(paid)}
                        </div>
                        <div
                          className={`text-sm text-right tabular-nums font-medium ${
                            balance > 0 ? "text-red-600" : "text-foreground"
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
                            {String(item.status)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Levy total */}
              <div className="px-6 py-3 border-t border-border bg-muted/20">
                <div className="grid grid-cols-1 sm:grid-cols-[80px_80px_1fr_100px_100px_100px_90px] gap-2 sm:gap-4 items-center">
                  <div className="sm:col-span-3 text-sm font-semibold text-foreground">
                    Levy Total
                  </div>
                  <div className="text-sm text-right tabular-nums font-semibold text-foreground">
                    {formatCurrency(Number(levy.totalAmount))}
                  </div>
                  <div className="text-sm text-right tabular-nums font-semibold text-green-600">
                    {formatCurrency(
                      levy.items.reduce((s, i) => s + Number(i.paidAmount), 0),
                    )}
                  </div>
                  <div className="text-sm text-right tabular-nums font-semibold text-foreground">
                    {formatCurrency(
                      Number(levy.totalAmount) -
                        levy.items.reduce(
                          (s, i) => s + Number(i.paidAmount),
                          0,
                        ),
                    )}
                  </div>
                  <div />
                </div>
              </div>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
