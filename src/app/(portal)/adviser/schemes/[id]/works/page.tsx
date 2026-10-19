import Link from "next/link";
import { connection } from "next/server";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import {
  getWorksRequestsForScheme,
  getWorksDashboardData,
} from "@/lib/queries/works";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { StatusChip } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";

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

const priorityLabel: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

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

export default async function WorksDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    status?: string;
    priority?: string;
    search?: string;
  }>;
}) {
  await connection();
  const { id } = await params;
  const { status, priority, search } = await searchParams;

  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const [requests, dashboard] = await Promise.all([
    getWorksRequestsForScheme(id, { status, priority, search, limit: 50 }),
    getWorksDashboardData(id),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Works"
        description={`Procurement and works management for ${scheme.planNumber}`}
        backHref={`/adviser/schemes/${id}`}
        backLabel={scheme.planNumber}
        action={
          <Button href={`/adviser/schemes/${id}/works/new`}>
            New Request
          </Button>
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Requests"
          value={dashboard.requests.total}
          accent="bg-turquoise"
        />
        <StatCard
          label="Urgent / Overdue"
          value={dashboard.requests.urgent + dashboard.requests.overdue}
          accent="bg-amber-500"
        />
        <StatCard
          label="Active Contracts"
          value={dashboard.contracts.active}
          accent="bg-blue-500"
        />
        <StatCard
          label="Pending Invoices"
          value={dashboard.invoices.pending}
          accent="bg-orange-500"
        />
      </div>

      {/* Filter bar */}
      <Card>
        <form className="flex flex-wrap items-end gap-3 p-4">
          <div>
            <label
              htmlFor="search"
              className="block text-xs font-medium text-ink-muted mb-1"
            >
              Search
            </label>
            <input
              id="search"
              name="search"
              type="text"
              defaultValue={search}
              placeholder="Request number or title..."
              className="rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise w-56"
            />
          </div>
          <div>
            <label
              htmlFor="status"
              className="block text-xs font-medium text-ink-muted mb-1"
            >
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={status ?? ""}
              className="rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-turquoise w-40"
            >
              <option value="">All statuses</option>
              {Object.entries(statusLabel).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="priority"
              className="block text-xs font-medium text-ink-muted mb-1"
            >
              Priority
            </label>
            <select
              id="priority"
              name="priority"
              defaultValue={priority ?? ""}
              className="rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-turquoise w-32"
            >
              <option value="">All</option>
              {Object.entries(priorityLabel).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="secondary">
            Filter
          </Button>
        </form>
      </Card>

      {/* Requests list */}
      {requests.length === 0 ? (
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
          title="No works requests yet"
          description="Create a new works request to begin the procurement process for maintenance, repairs, or capital works."
          actionLabel="New Request"
          actionHref={`/adviser/schemes/${id}/works/new`}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {requests.map((req) => (
            <Link
              key={req.id}
              href={`/adviser/schemes/${id}/works/${req.id}`}
              className="flex items-center justify-between rounded-[var(--radius-card)] bg-white border border-line px-5 py-4 hover:border-turquoise/40 transition-colors"
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
                <div className="flex items-center gap-4 mt-1 text-xs text-ink-muted">
                  {req.category && <span>{req.category.name}</span>}
                  <span>{formatDate(req.createdAt)}</span>
                  {req.raisedBy && (
                    <span>
                      by {req.raisedBy.firstName} {req.raisedBy.lastName}
                    </span>
                  )}
                  {req.assignedTo && (
                    <span>
                      assigned to {req.assignedTo.firstName}{" "}
                      {req.assignedTo.lastName}
                    </span>
                  )}
                </div>
              </div>
              <div className="shrink-0 ml-4 text-right">
                {req.estimatedCost && (
                  <p className="text-sm font-medium text-ink">
                    {formatCurrency(req.estimatedCost)}
                  </p>
                )}
                <p className="text-xs text-ink-muted">
                  {priorityLabel[req.priority] ?? req.priority}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Quick links to other works sections */}
      {dashboard.requests.total > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card>
            <CardHeader
              title="Contractors"
              description="Manage contractor registry and compliance"
              action={
                <Button
                  href={`/adviser/schemes/${id}/works/contractors`}
                  variant="ghost"
                >
                  View
                </Button>
              }
            />
          </Card>
          <Card>
            <CardHeader
              title="Contracts"
              description={`${dashboard.contracts.active} active contract${dashboard.contracts.active === 1 ? "" : "s"}`}
              action={
                <Button
                  href={`/adviser/schemes/${id}/works/contracts`}
                  variant="ghost"
                >
                  View
                </Button>
              }
            />
          </Card>
          <Card>
            <CardHeader
              title="Invoices"
              description={`${dashboard.invoices.pending} pending invoice${dashboard.invoices.pending === 1 ? "" : "s"}`}
              action={
                <Button
                  href={`/adviser/schemes/${id}/works/invoices`}
                  variant="ghost"
                >
                  View
                </Button>
              }
            />
          </Card>
          <Card>
            <CardHeader
              title="Compliance"
              description="Manage contractor compliance requirements"
              action={
                <Button
                  href={`/adviser/schemes/${id}/works/compliance`}
                  variant="ghost"
                >
                  View
                </Button>
              }
            />
          </Card>
          <Card>
            <CardHeader
              title="Approvals"
              description="Approval routes and authority delegations"
              action={
                <Button
                  href={`/adviser/schemes/${id}/works/approvals`}
                  variant="ghost"
                >
                  View
                </Button>
              }
            />
          </Card>
          <Card>
            <CardHeader
              title="Work Orders"
              description="Track work orders and milestones"
              action={
                <Button
                  href={`/adviser/schemes/${id}/works/work-orders`}
                  variant="ghost"
                >
                  View
                </Button>
              }
            />
          </Card>
        </div>
      )}
    </div>
  );
}
