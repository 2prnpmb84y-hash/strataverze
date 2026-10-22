import { getSelectedSchemeId } from "@/lib/actions/scheme-selection";
import { scopeToSelectedScheme } from "@/lib/owner/scheme-scope";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForOwner } from "@/lib/queries/schemes";
import {
  getWorksRequestsForScheme,
  getWorksDashboardData,
} from "@/lib/queries/works";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { StatusChip } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

function formatCurrency(value: number | string | null): string {
  const num = Number(value ?? 0);
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(num);
}

function formatDate(date: Date | string | null): string {
  if (!date) return "—";
  return new Date(String(date)).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const statusLabel: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under Review",
  APPROVED: "Approved",
  SCOPING: "Scoping",
  RFQ_ISSUED: "RFQ Issued",
  QUOTING: "Quoting",
  RECOMMENDED: "Recommended",
  CONTRACTING: "Contracting",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  CLOSED: "Closed",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

const priorityLabel: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export default async function OwnerWorksPage() {
  await connection();

  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = scopeToSelectedScheme(
    await getSchemesForOwner(profile.id),
    await getSelectedSchemeId(),
  );
  if (schemes.length === 0) notFound();

  const schemeId = schemes[0].id;

  const [requests, dashboard] = await Promise.all([
    getWorksRequestsForScheme(schemeId, { limit: 10 }),
    getWorksDashboardData(schemeId),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Works Overview"
        description="Current works and maintenance activity for your scheme."
        action={
          <Button href="/owner/maintenance/new">Report Issue</Button>
        }
      />

      {/* KPI summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Active Requests"
          value={dashboard.requests.total}
          accent="bg-turquoise"
        />
        <StatCard
          label="Active Contracts"
          value={dashboard.contracts.active}
          accent="bg-blue-500"
        />
        <StatCard
          label="Pending Invoices"
          value={dashboard.invoices.pending}
          accent="bg-amber-500"
        />
        <StatCard
          label="Urgent Items"
          value={dashboard.requests.urgent + dashboard.requests.emergency}
          accent="bg-red-500"
        />
      </div>

      {/* Recent works requests */}
      <Card>
        <CardHeader
          title="Recent Works Requests"
          description="Latest works and maintenance activity"
        />
        {requests.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState
              icon={
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 48 48"
                  fill="none"
                  aria-hidden="true"
                >
                  <rect
                    x="8"
                    y="6"
                    width="32"
                    height="36"
                    rx="4"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M16 18h16M16 24h16M16 30h10"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              }
              title="No works requests"
              description="There are no current works requests for your scheme."
            />
          </div>
        ) : (
          <div className="flex flex-col gap-2 px-5 pb-5">
            {requests.map((req) => (
              <div
                key={req.id}
                className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-ink-muted">
                      {req.requestNumber}
                    </span>
                    <StatusChip
                      status={statusLabel[req.status] ?? req.status}
                    />
                    {req.isEmergency && (
                      <span className="inline-flex items-center rounded-full h-[22px] px-2.5 text-[11px] font-medium bg-red-100 text-red-700">
                        Emergency
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-ink truncate">
                    {req.title}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-ink-muted">
                    {req.category && <span>{req.category.name}</span>}
                    <span>{formatDate(req.createdAt)}</span>
                    <span>
                      {priorityLabel[req.priority] ?? req.priority}
                    </span>
                  </div>
                </div>
                {req.estimatedCost && (
                  <span className="text-sm font-medium text-ink shrink-0 ml-4">
                    {formatCurrency(req.estimatedCost)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Financial overview */}
      {dashboard.invoices.total > 0 && (
        <Card>
          <CardHeader title="Invoice Summary" />
          <div className="px-5 pb-5">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
              <div>
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Total Invoices
                </dt>
                <dd className="text-sm text-ink">{dashboard.invoices.total}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Pending Amount
                </dt>
                <dd className="text-sm font-semibold text-amber-600">
                  {formatCurrency(dashboard.invoices.pendingTotal)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Overdue Invoices
                </dt>
                <dd className="text-sm text-ink">{dashboard.invoices.overdue}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Overdue Amount
                </dt>
                <dd className="text-sm font-semibold text-red-600">
                  {formatCurrency(dashboard.invoices.overdueTotal)}
                </dd>
              </div>
            </dl>
          </div>
        </Card>
      )}

      {/* Compliance */}
      {dashboard.compliance.expired > 0 && (
        <Card>
          <CardHeader
            title="Compliance Alerts"
            description="Items requiring attention"
          />
          <div className="px-5 pb-5">
            <div className="rounded-[var(--radius-card)] bg-red-50 p-4">
              <p className="text-sm font-medium text-red-700">
                {dashboard.compliance.expired} expired compliance check
                {dashboard.compliance.expired === 1 ? "" : "s"}
              </p>
              <p className="text-xs text-red-600 mt-1">
                Contact your strata manager for details.
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
