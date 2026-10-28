import { connection } from "next/server";
import { notFound } from "next/navigation";
import { requirePageAccess } from "@/lib/auth/require-access";
import { getSchemeById } from "@/lib/queries/schemes";
import { timeZoneOf } from "@/lib/jurisdiction/scheme-time";
import { formatDateTimeIn } from "@/lib/jurisdiction/time-zone";
import { getWorksAuditEvents } from "@/lib/queries/works";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/** An instant's date and time in the building's time zone (`tz`). */
function formatDateTime(date: Date | string | null, tz: string): string {
  if (!date) return "—";
  return formatDateTimeIn(tz, String(date), { hour: "2-digit" });
}

const entityTypeLabels: Record<string, string> = {
  REQUEST: "Request",
  CONTRACT: "Contract",
  WORK_ORDER: "Work Order",
  VARIATION: "Variation",
  INVOICE: "Invoice",
  PAYMENT: "Payment",
  COMPLIANCE: "Compliance",
  APPROVAL: "Approval",
  RFQ: "RFQ",
  QUOTE: "Quote",
};

const actionLabels: Record<string, string> = {
  CREATED: "Created",
  UPDATED: "Updated",
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
  ASSESSED: "Assessed",
  PAID: "Paid",
  AUTHORISED: "Authorised",
  RECONCILED: "Reconciled",
  EXPORTED: "Exported",
  INVALIDATED: "Invalidated",
  VERIFIED: "Verified",
  EXPIRED: "Expired",
  STATUS_CHANGED: "Status Changed",
  ASSIGNED: "Assigned",
  COMMENTED: "Commented",
};

function getActionColour(action: string): string {
  if (["APPROVED", "COMPLETED", "VERIFIED", "RECONCILED", "PAID"].includes(action)) return "bg-green-100 text-green-700";
  if (["REJECTED", "CANCELLED", "INVALIDATED", "EXPIRED"].includes(action)) return "bg-red-100 text-red-700";
  if (["SUBMITTED", "ASSESSED", "AUTHORISED"].includes(action)) return "bg-blue-100 text-blue-700";
  if (["CREATED", "UPDATED", "STATUS_CHANGED", "ASSIGNED"].includes(action)) return "bg-muted text-ink-muted";
  return "bg-muted text-ink-muted";
}

export default async function WorksAuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ entityType?: string }>;
}) {
  await connection();
  const { id } = await params;
  const { entityType } = await searchParams;

  // Role check on this scheme (SEC-004 / H5): a page is a privileged read.
  const access = await requirePageAccess(id, "works.read");
  if (!access) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();
  const tz = timeZoneOf(scheme);

  const events = await getWorksAuditEvents(id, {
    entityType: entityType || undefined,
    limit: 200,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Trail"
        description={`Works activity log for ${scheme.planNumber}`}
        backHref={`/adviser/schemes/${id}/works`}
        backLabel="Works"
      />

      {/* Filter */}
      <Card>
        <form className="flex flex-wrap items-end gap-3 p-4">
          <div>
            <label
              htmlFor="entityType"
              className="block text-xs font-medium text-ink-muted mb-1"
            >
              Entity Type
            </label>
            <select
              id="entityType"
              name="entityType"
              defaultValue={entityType ?? ""}
              className="rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-turquoise w-44"
            >
              <option value="">All types</option>
              {Object.entries(entityTypeLabels).map(([val, label]) => (
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

      {/* Events timeline */}
      {events.length === 0 ? (
        <EmptyState
          icon={
            <svg
              width="48"
              height="48"
              viewBox="0 0 48 48"
              fill="none"
              aria-hidden="true"
            >
              <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="2" />
              <path d="M24 14v10l7 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          }
          title="No audit events"
          description="Activity will appear here as works are created and managed."
        />
      ) : (
        <div className="flex flex-col gap-1">
          {events.map((event) => (
            <div
              key={event.id}
              className="flex items-start gap-4 rounded-[var(--radius-card)] bg-white border border-line px-5 py-4"
            >
              {/* Timeline dot */}
              <div className="mt-1.5 shrink-0">
                <div className="w-2.5 h-2.5 rounded-full bg-turquoise" />
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center flex-wrap gap-2 mb-1">
                  <span
                    className={`inline-flex items-center rounded-full h-[22px] px-2.5 text-[11px] font-medium ${getActionColour(event.action)}`}
                  >
                    {actionLabels[event.action] ?? event.action}
                  </span>
                  <span className="inline-flex items-center rounded-full h-[22px] px-2.5 text-[11px] font-medium bg-muted text-ink-muted">
                    {entityTypeLabels[event.entityType] ?? event.entityType}
                  </span>
                </div>
                <p className="text-sm text-ink">
                  {event.actor
                    ? `${event.actor.firstName} ${event.actor.lastName}`
                    : "System"}{" "}
                  {(actionLabels[event.action] ?? event.action).toLowerCase()}{" "}
                  {(entityTypeLabels[event.entityType] ?? event.entityType).toLowerCase()}
                </p>
                {event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata) && "note" in event.metadata && (
                  <p className="text-xs text-ink-muted mt-1">
                    {String((event.metadata as Record<string, unknown>).note)}
                  </p>
                )}
              </div>

              {/* Timestamp */}
              <div className="shrink-0 text-right">
                <p className="text-xs text-ink-muted">
                  {formatDateTime(event.createdAt, tz)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
