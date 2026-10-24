import Link from "next/link";
import { connection } from "next/server";
import { requirePageAccess } from "@/lib/auth/require-access";
import { getSchemeById } from "@/lib/queries/schemes";
import { getWorksWorkOrdersForScheme } from "@/lib/queries/works";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { StatusChip } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

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
  ISSUED: "Issued",
  ACKNOWLEDGED: "Acknowledged",
  IN_PROGRESS: "In Progress",
  ON_HOLD: "On Hold",
  PRACTICAL_COMPLETION: "Practical Completion",
  DEFECTS_RECTIFICATION: "Defects Rectification",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export default async function WorkOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  await connection();
  const { id } = await params;
  const { status } = await searchParams;

  // Role check on this scheme (SEC-004 / H5): a page is a privileged read.
  const access = await requirePageAccess(id, "works.read");
  if (!access) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const workOrders = await getWorksWorkOrdersForScheme(id, { status });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Work Orders"
        description="Track and manage work orders for contracts"
        backHref={`/adviser/schemes/${id}/works`}
        backLabel="Works"
        action={
          <Button href={`/adviser/schemes/${id}/works/work-orders/new`}>
            New Work Order
          </Button>
        }
      />

      {/* Filter bar */}
      <Card>
        <form className="flex flex-wrap items-end gap-3 p-4">
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
              className="rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-turquoise w-48"
            >
              <option value="">All statuses</option>
              {Object.entries(statusLabel).map(([val, label]) => (
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

      {/* Work orders list */}
      {workOrders.length === 0 ? (
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
                x="6"
                y="10"
                width="36"
                height="28"
                rx="3"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M14 20h20M14 26h14M14 32h8"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          }
          title="No work orders found"
          description="Work orders are created from active contracts to manage on-site delivery."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {workOrders.map((wo) => (
            <Link
              key={wo.id}
              href={`/adviser/schemes/${id}/works/work-orders/${wo.id}`}
              className="flex items-center justify-between rounded-[var(--radius-card)] bg-white border border-line px-5 py-4 hover:border-turquoise/40 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-ink-muted">
                    {wo.workOrderNumber}
                  </span>
                  <StatusChip
                    status={statusLabel[wo.status] ?? wo.status}
                  />
                </div>
                <p className="text-sm font-medium text-ink truncate">
                  {wo.title}
                </p>
                <div className="flex items-center gap-4 text-xs text-ink-muted mt-1">
                  <span>{wo.contractorBusiness.companyName}</span>
                  {wo.scheduledStart && (
                    <span>Start: {formatDate(wo.scheduledStart)}</span>
                  )}
                  {wo.scheduledEnd && (
                    <span>End: {formatDate(wo.scheduledEnd)}</span>
                  )}
                </div>
              </div>
              <div className="shrink-0 ml-4 text-right text-xs text-ink-muted">
                {wo.contract && (
                  <p>{wo.contract.contractNumber}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
