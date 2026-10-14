import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForAdviser } from "@/lib/queries/schemes";
import { getLeviesForSchemes } from "@/lib/queries/levies";
import { getWorkOrdersForSchemes } from "@/lib/queries/work-orders";
import { getComplianceForSchemes } from "@/lib/queries/compliance";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";

export default async function AdviserReportingPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = await getSchemesForAdviser(profile.id);
  const schemeIds = schemes.map((s) => s.id);

  const [levies, workOrders, complianceItems] = schemeIds.length > 0
    ? await Promise.all([
        getLeviesForSchemes(schemeIds),
        getWorkOrdersForSchemes(schemeIds),
        getComplianceForSchemes(schemeIds),
      ])
    : [[], [], []];

  const schemeNames = new Map(schemes.map((s) => [s.id, s.name]));

  // Levy stats
  const totalLevied = levies.reduce(
    (sum, l) => sum + Number(l.totalAmount),
    0,
  );
  const totalCollected = levies.reduce(
    (sum, l) =>
      sum + l.items.reduce((s, item) => s + Number(item.paidAmount), 0),
    0,
  );
  const collectionRate =
    totalLevied > 0 ? Math.round((totalCollected / totalLevied) * 100) : 0;

  // Work order stats
  const activeWorkOrders = workOrders.filter(
    (wo) => wo.status === "OPEN" || wo.status === "IN_PROGRESS",
  );
  const completedWorkOrders = workOrders.filter(
    (wo) => wo.status === "COMPLETED",
  );

  // Compliance stats
  const nonCompliant = complianceItems.filter(
    (c) => c.status === "NON_COMPLIANT" || c.status === "EXPIRED",
  );
  const compliant = complianceItems.filter((c) => c.status === "COMPLIANT");
  const complianceRate =
    complianceItems.length > 0
      ? Math.round((compliant.length / complianceItems.length) * 100)
      : 0;

  // Per-scheme summary
  const schemeSummaries = schemes.map((scheme) => {
    const sLevies = levies.filter((l) => l.schemeId === scheme.id);
    const sLevied = sLevies.reduce((sum, l) => sum + Number(l.totalAmount), 0);
    const sCollected = sLevies.reduce(
      (sum, l) =>
        sum + l.items.reduce((s, item) => s + Number(item.paidAmount), 0),
      0,
    );
    const sActiveWo = workOrders.filter(
      (wo) =>
        wo.schemeId === scheme.id &&
        (wo.status === "OPEN" || wo.status === "IN_PROGRESS"),
    ).length;
    const sNonCompliant = complianceItems.filter(
      (c) =>
        c.schemeId === scheme.id &&
        (c.status === "NON_COMPLIANT" || c.status === "EXPIRED"),
    ).length;

    return {
      id: scheme.id,
      name: scheme.name,
      totalLevied: sLevied,
      totalCollected: sCollected,
      outstanding: sLevied - sCollected,
      activeWorkOrders: sActiveWo,
      nonCompliant: sNonCompliant,
    };
  });

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Reporting"
        description="Portfolio overview across all managed schemes."
      />

      {/* Top-level stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatCard
          label="Schemes"
          value={schemes.length}
          accent="bg-adviser"
        />
        <StatCard
          label="Collection Rate"
          value={`${collectionRate}%`}
          accent="bg-green-500"
        />
        <StatCard
          label="Active Work Orders"
          value={activeWorkOrders.length}
          accent="bg-yellow-500"
        />
        <StatCard
          label="Compliance Rate"
          value={`${complianceRate}%`}
          accent={complianceRate >= 80 ? "bg-green-500" : "bg-red-500"}
        />
      </div>

      {schemes.length === 0 ? (
        <Card>
          <div className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              No schemes assigned yet. Create a scheme from the Schemes page to
              get started.
            </p>
          </div>
        </Card>
      ) : (
        <>
          {/* Financial overview */}
          <Card className="mb-6">
            <CardHeader
              title="Financial Summary"
              description="Levy collection across all schemes."
            />
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-muted px-4 py-3 text-center">
                  <p className="text-xs text-muted-foreground mb-0.5">
                    Total Levied
                  </p>
                  <p className="text-sm font-medium text-foreground font-variant-numeric tabular-nums">
                    ${totalLevied.toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="rounded-lg bg-muted px-4 py-3 text-center">
                  <p className="text-xs text-muted-foreground mb-0.5">
                    Collected
                  </p>
                  <p className="text-sm font-medium text-green-600 font-variant-numeric tabular-nums">
                    ${totalCollected.toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="rounded-lg bg-muted px-4 py-3 text-center">
                  <p className="text-xs text-muted-foreground mb-0.5">
                    Outstanding
                  </p>
                  <p className="text-sm font-medium text-red-600 font-variant-numeric tabular-nums">
                    ${(totalLevied - totalCollected).toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {/* Compliance alerts */}
          {nonCompliant.length > 0 && (
            <Card className="mb-6 border-red-200">
              <CardHeader
                title="Compliance Alerts"
                description={`${nonCompliant.length} item${nonCompliant.length === 1 ? "" : "s"} need${nonCompliant.length === 1 ? "s" : ""} attention.`}
              />
              <div className="flex flex-col gap-2">
                {nonCompliant.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg bg-muted px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {item.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {schemeNames.get(item.schemeId) ?? ""}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        item.status === "EXPIRED"
                          ? "bg-gray-100 text-gray-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {item.status.replace("_", " ")}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Per-scheme breakdown */}
          <Card>
            <CardHeader
              title="Scheme Breakdown"
              description="Summary by scheme."
            />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-2 font-medium text-muted-foreground">
                      Scheme
                    </th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">
                      Outstanding
                    </th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">
                      Work Orders
                    </th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">
                      Alerts
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {schemeSummaries.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="py-3 font-medium text-foreground">
                        {s.name}
                      </td>
                      <td className="py-3 text-right font-variant-numeric tabular-nums">
                        {s.outstanding > 0 ? (
                          <span className="text-red-600">
                            ${s.outstanding.toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">$0.00</span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        {s.activeWorkOrders > 0 ? (
                          <span className="text-yellow-600">
                            {s.activeWorkOrders}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        {s.nonCompliant > 0 ? (
                          <span className="text-red-600">
                            {s.nonCompliant}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
