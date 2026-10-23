import { connection } from "next/server";
import { notFound } from "next/navigation";
import { requirePageAccess } from "@/lib/auth/require-access";
import { getSchemeById } from "@/lib/queries/schemes";
import { getWorksReportData } from "@/lib/queries/works";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader } from "@/components/ui/card";

function formatCurrency(value: number | string | null): string {
  const num = Number(value ?? 0);
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(num);
}

export default async function WorksReportsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;

  // Role check on this scheme (SEC-004 / H5): a page is a privileged read.
  const access = await requirePageAccess(id, "works.read");
  if (!access) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const report = await getWorksReportData(id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Works Reports"
        description={`Financial and performance reports for ${scheme.planNumber}`}
        backHref={`/adviser/schemes/${id}/works`}
        backLabel="Works"
      />

      {/* Financial summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Contract Value"
          value={formatCurrency(report.totalContractValue)}
          accent="bg-turquoise"
        />
        <StatCard
          label="Total Invoiced"
          value={formatCurrency(report.totalInvoiced)}
          accent="bg-blue-500"
        />
        <StatCard
          label="Total Paid"
          value={formatCurrency(report.totalPaid)}
          accent="bg-green-500"
        />
        <StatCard
          label="Outstanding"
          value={formatCurrency(report.outstanding)}
          accent="bg-amber-500"
        />
      </div>

      {/* Contract status breakdown */}
      <Card>
        <CardHeader title="Contracts by Status" />
        <div className="px-5 pb-5">
          {Object.keys(report.contractsByStatus).length === 0 ? (
            <p className="text-sm text-ink-muted">No contracts yet.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {Object.entries(report.contractsByStatus).map(([status, count]) => (
                <div
                  key={status}
                  className="rounded-[var(--radius-card)] bg-muted p-4"
                >
                  <p className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                    {status.replace(/_/g, " ")}
                  </p>
                  <p className="text-lg font-semibold text-ink">{count}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Invoice aging */}
      <Card>
        <CardHeader title="Invoice Aging" />
        <div className="px-5 pb-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-[var(--radius-card)] bg-muted p-4">
              <p className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                Current
              </p>
              <p className="text-lg font-semibold text-ink">
                {formatCurrency(report.invoiceAging.current)}
              </p>
              <p className="text-xs text-ink-muted">
                {report.invoiceAging.currentCount} invoice{report.invoiceAging.currentCount === 1 ? "" : "s"}
              </p>
            </div>
            <div className="rounded-[var(--radius-card)] bg-amber-50 border border-amber-200 p-4">
              <p className="text-xs font-medium text-amber-700 uppercase tracking-wide mb-1">
                1 to 30 days overdue
              </p>
              <p className="text-lg font-semibold text-amber-700">
                {formatCurrency(report.invoiceAging.overdue30)}
              </p>
              <p className="text-xs text-amber-600">
                {report.invoiceAging.overdue30Count} invoice{report.invoiceAging.overdue30Count === 1 ? "" : "s"}
              </p>
            </div>
            <div className="rounded-[var(--radius-card)] bg-orange-50 border border-orange-200 p-4">
              <p className="text-xs font-medium text-orange-700 uppercase tracking-wide mb-1">
                31 to 60 days overdue
              </p>
              <p className="text-lg font-semibold text-orange-700">
                {formatCurrency(report.invoiceAging.overdue60)}
              </p>
              <p className="text-xs text-orange-600">
                {report.invoiceAging.overdue60Count} invoice{report.invoiceAging.overdue60Count === 1 ? "" : "s"}
              </p>
            </div>
            <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 p-4">
              <p className="text-xs font-medium text-red-700 uppercase tracking-wide mb-1">
                Over 60 days overdue
              </p>
              <p className="text-lg font-semibold text-red-700">
                {formatCurrency(report.invoiceAging.overdue60Plus)}
              </p>
              <p className="text-xs text-red-600">
                {report.invoiceAging.overdue60PlusCount} invoice{report.invoiceAging.overdue60PlusCount === 1 ? "" : "s"}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Top contractors by spend */}
      <Card>
        <CardHeader title="Contractor Spend" description="Top contractors by payment amount" />
        <div className="px-5 pb-5">
          {report.topContractors.length === 0 ? (
            <p className="text-sm text-ink-muted">No payment data yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {report.topContractors.map((contractor, i) => (
                <div
                  key={contractor.name}
                  className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted p-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-turquoise/10 text-turquoise text-xs font-semibold">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-ink">
                        {contractor.name}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {contractor.contractCount} contract{contractor.contractCount === 1 ? "" : "s"},
                        {" "}{contractor.invoiceCount} invoice{contractor.invoiceCount === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-ink">
                      {formatCurrency(contractor.totalPaid)}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {formatCurrency(contractor.totalContractValue)} contracted
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Request status breakdown */}
      <Card>
        <CardHeader title="Requests by Status" />
        <div className="px-5 pb-5">
          {Object.keys(report.requestsByStatus).length === 0 ? (
            <p className="text-sm text-ink-muted">No requests yet.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {Object.entries(report.requestsByStatus).map(([status, count]) => (
                <div
                  key={status}
                  className="rounded-[var(--radius-card)] bg-muted p-4"
                >
                  <p className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                    {status.replace(/_/g, " ")}
                  </p>
                  <p className="text-lg font-semibold text-ink">{count}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
