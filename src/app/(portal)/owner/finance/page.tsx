import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForOwner } from "@/lib/queries/schemes";
import { getLevyItemsForLot } from "@/lib/queries/levies";
import { getFundsForSchemes } from "@/lib/queries/funds";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";

function formatCurrency(value: number): string {
  if (value < 0) {
    return `($${Math.abs(value).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
  }
  return `$${value.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const statusStyle: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  ISSUED: "bg-blue-100 text-blue-700",
  PAID: "bg-green-100 text-green-700",
  OVERDUE: "bg-red-100 text-red-700",
};

export default async function OwnerFinancePage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = await getSchemesForOwner(profile.id);

  if (schemes.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Finance"
          description="Your levy contributions and fund balances."
        />
        <EmptyState
          title="No properties found"
          description="You are not currently registered as an owner in any strata scheme."
        />
      </div>
    );
  }

  const schemeIds = schemes.map((s) => s.id);
  const schemeNames = new Map(schemes.map((s) => [s.id, String(s.name)]));

  // Get the owner's lot IDs from their memberships
  const lotEntries = schemes.flatMap((s) =>
    s.memberships
      .filter((m) => m.lotId)
      .map((m) => ({
        lotId: m.lotId!,
        schemeId: s.id,
        lot: m.lot,
      })),
  );

  // Fetch levy items and funds in parallel
  const [allItemArrays, funds] = await Promise.all([
    Promise.all(lotEntries.map((entry) => getLevyItemsForLot(entry.lotId))),
    getFundsForSchemes(schemeIds),
  ]);

  const items = allItemArrays.flat();

  // Calculate totals
  const totalDue = items.reduce((sum, i) => sum + Number(i.amount), 0);
  const totalPaid = items.reduce((sum, i) => sum + Number(i.paidAmount), 0);
  const totalOutstanding = totalDue - totalPaid;

  // Group by levy
  const levyMap = new Map<
    string,
    {
      title: string;
      dueDate: string;
      levyType: string;
      status: string;
      schemeId: string;
      items: typeof items;
    }
  >();

  for (const item of items) {
    const levyId = item.levyId;
    if (!levyMap.has(levyId)) {
      levyMap.set(levyId, {
        title: item.levy.title,
        dueDate: String(item.levy.dueDate),
        levyType: item.levy.levyType,
        status: item.levy.status,
        schemeId: item.levy.schemeId,
        items: [],
      });
    }
    levyMap.get(levyId)!.items.push(item);
  }

  const levies = Array.from(levyMap.entries())
    .map(([id, data]) => ({ id, ...data }))
    .sort(
      (a, b) =>
        new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime(),
    );

  const outstandingLevies = levies.filter(
    (l) => l.status === "ISSUED" || l.status === "OVERDUE",
  );
  const paidLevies = levies.filter((l) => l.status === "PAID");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance"
        description="Your levy contributions and fund balances."
      />

      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Total Levied"
          value={formatCurrency(totalDue)}
          accent="bg-blue-500"
        />
        <StatCard
          label="Paid"
          value={formatCurrency(totalPaid)}
          accent="bg-green-500"
        />
        <StatCard
          label="Outstanding"
          value={formatCurrency(totalOutstanding)}
          accent={totalOutstanding > 0 ? "bg-red-500" : "bg-green-500"}
        />
      </div>

      {/* Fund Balances */}
      {funds.length > 0 && (
        <Card>
          <CardHeader
            title="Fund Balances"
            description="Current balances across your scheme funds."
          />
          <div className="flex flex-col gap-2 px-6 pb-6">
            {funds.map((fund) => {
              const balance = Number(fund.balance);
              return (
                <div
                  key={fund.id}
                  className="flex items-center justify-between rounded-lg bg-muted px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {fund.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {schemeNames.get(fund.schemeId) ?? ""}
                      {" · "}
                      {String(fund.fundType).replace("_", " ")}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-semibold tabular-nums ${
                      balance >= 0 ? "text-green-700" : "text-red-700"
                    }`}
                  >
                    {formatCurrency(balance)}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {items.length === 0 ? (
        <EmptyState
          title="No levies yet"
          description="No levies have been issued for your lots. Your strata manager will create levy notices when contributions are due."
        />
      ) : (
        <>
          {/* Outstanding levies */}
          {outstandingLevies.length > 0 && (
            <Card>
              <CardHeader
                title="Outstanding Levies"
                description={`${outstandingLevies.length} lev${outstandingLevies.length === 1 ? "y" : "ies"} with amounts due.`}
              />
              <div className="flex flex-col gap-2 px-6 pb-6">
                {outstandingLevies.map((levy) => {
                  const dueDate = new Date(levy.dueDate);
                  const levyTotal = levy.items.reduce(
                    (sum, i) => sum + Number(i.amount),
                    0,
                  );
                  const levyPaid = levy.items.reduce(
                    (sum, i) => sum + Number(i.paidAmount),
                    0,
                  );
                  const levyBalance = levyTotal - levyPaid;
                  const pct =
                    levyTotal > 0
                      ? Math.round((levyPaid / levyTotal) * 100)
                      : 0;

                  return (
                    <div
                      key={levy.id}
                      className="rounded-lg bg-muted px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <p className="text-sm font-medium text-foreground">
                          {levy.title}
                        </p>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${statusStyle[levy.status] ?? "bg-gray-100 text-gray-700"}`}
                        >
                          {levy.status === "OVERDUE"
                            ? "Overdue"
                            : levy.status.charAt(0) +
                              levy.status.slice(1).toLowerCase()}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-1">
                        {schemeNames.get(levy.schemeId) ?? ""}
                        {" · "}
                        {levy.levyType === "ORDINARY"
                          ? "Ordinary"
                          : "Special"}{" "}
                        levy · Due{" "}
                        {dueDate.toLocaleDateString("en-AU", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                      <div className="flex items-center justify-between text-sm mt-2">
                        <span className="text-muted-foreground">
                          Balance due
                        </span>
                        <span className="font-semibold tabular-nums text-red-600">
                          {formatCurrency(levyBalance)}
                        </span>
                      </div>
                      {levyPaid > 0 && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                            <span>{pct}% paid</span>
                            <span>
                              {formatCurrency(levyPaid)} of{" "}
                              {formatCurrency(levyTotal)}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-border overflow-hidden">
                            <div
                              className="h-full rounded-full bg-green-500"
                              style={{
                                width: `${Math.min(100, pct)}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Paid levies */}
          {paidLevies.length > 0 && (
            <Card>
              <CardHeader
                title="Paid Levies"
                description={`${paidLevies.length} lev${paidLevies.length === 1 ? "y" : "ies"} fully paid.`}
              />
              <div className="flex flex-col gap-2 px-6 pb-6">
                {paidLevies.map((levy) => {
                  const dueDate = new Date(levy.dueDate);
                  const levyTotal = levy.items.reduce(
                    (sum, i) => sum + Number(i.amount),
                    0,
                  );

                  return (
                    <div
                      key={levy.id}
                      className="flex items-center justify-between rounded-lg bg-muted px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {levy.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {schemeNames.get(levy.schemeId) ?? ""}
                          {" · Paid · "}
                          {dueDate.toLocaleDateString("en-AU", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium tabular-nums text-foreground">
                          {formatCurrency(levyTotal)}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                          Paid
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
