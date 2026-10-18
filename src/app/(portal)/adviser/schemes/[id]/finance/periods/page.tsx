import { notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import { getFinancialPeriodsForScheme } from "@/lib/queries/financial-periods";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PeriodActions } from "./period-actions";
import { connection } from "next/server";

const statusStyles: Record<string, string> = {
  OPEN: "bg-green-100 text-green-700",
  CLOSED: "bg-amber-100 text-amber-700",
  LOCKED: "bg-red-100 text-red-700",
};

const statusLabels: Record<string, string> = {
  OPEN: "Open",
  CLOSED: "Closed",
  LOCKED: "Locked",
};

function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  return new Date(String(date)).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function FinancialPeriodsPage({
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

  const periods = await getFinancialPeriodsForScheme(id);

  const basePath = `/adviser/schemes/${id}/finance/periods`;

  const openCount = periods.filter((p) => p.status === "OPEN").length;
  const closedCount = periods.filter((p) => p.status === "CLOSED").length;
  const lockedCount = periods.filter((p) => p.status === "LOCKED").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financial Periods"
        description="Manage accounting periods for this scheme. Periods control when journal entries can be posted."
      />

      {/* Summary stats */}
      <div className="flex items-center gap-4 text-sm">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          {openCount} open
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          {closedCount} closed
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          {lockedCount} locked
        </span>
        <div className="ml-auto">
          <Button variant="primary" href={`${basePath}/new`}>
            Generate Periods
          </Button>
        </div>
      </div>

      {periods.length === 0 ? (
        <EmptyState
          icon={
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          }
          title="No financial periods"
          description="Generate monthly periods for a financial year to start tracking accounting periods."
          actionLabel="Generate Periods"
          actionHref={`${basePath}/new`}
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 font-medium text-muted-foreground">
                    Period
                  </th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">
                    Start Date
                  </th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">
                    End Date
                  </th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">
                    Type
                  </th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">
                    Closed
                  </th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {periods.map((period) => {
                  const now = new Date();
                  now.setHours(0, 0, 0, 0);
                  const start = new Date(String(period.startDate));
                  const end = new Date(String(period.endDate));
                  start.setHours(0, 0, 0, 0);
                  end.setHours(0, 0, 0, 0);
                  const isCurrent =
                    period.status === "OPEN" && start <= now && end >= now;

                  return (
                    <tr key={period.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">
                        <span className="flex items-center gap-2">
                          {String(period.name)}
                          {isCurrent && (
                            <span className="inline-flex items-center rounded-full bg-primary-100 text-primary-700 px-2 py-0.5 text-[10px] font-medium">
                              Current
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(period.startDate)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(period.endDate)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground capitalize">
                        {String(period.periodType ?? "MONTH").toLowerCase()}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            statusStyles[period.status] ?? "bg-zinc-100 text-zinc-600"
                          }`}
                        >
                          {statusLabels[period.status] ?? period.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {period.closedAt ? formatDate(period.closedAt) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <PeriodActions
                          schemeId={id}
                          periodId={period.id}
                          status={period.status}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
