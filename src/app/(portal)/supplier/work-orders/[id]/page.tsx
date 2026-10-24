import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import { Card, CardHeader } from "@/components/ui/card";
import { WorkOrderActions } from "./work-order-actions";
const statusConfig: Record<string, { label: string; className: string }> = {
  AWARDED: { label: "Awarded", className: "bg-gold-100 text-gold-500" },
  IN_PROGRESS: { label: "In Progress", className: "bg-mint-soft text-turquoise" },
  COMPLETED: { label: "Completed", className: "bg-success/10 text-success" },
  CANCELLED: { label: "Cancelled", className: "bg-muted text-ink-muted" },
};

const priorityConfig: Record<string, { label: string; className: string }> = {
  LOW: { label: "Low", className: "bg-muted text-ink-muted" },
  MEDIUM: { label: "Medium", className: "bg-gold-100 text-gold-500" },
  HIGH: { label: "High", className: "bg-warning/10 text-warning" },
  URGENT: { label: "Urgent", className: "bg-danger/10 text-danger" },
};

const invoiceStatusConfig: Record<string, { label: string; className: string }> = {
  SUBMITTED: { label: "Submitted", className: "bg-gold-100 text-gold-500" },
  APPROVED: { label: "Approved", className: "bg-mint-soft text-turquoise" },
  PAID: { label: "Paid", className: "bg-success/10 text-success" },
  DISPUTED: { label: "Disputed", className: "bg-danger/10 text-danger" },
  CANCELLED: { label: "Cancelled", className: "bg-muted text-ink-muted" },
};

export default async function SupplierWorkOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const workOrder = await db.orm.public.WorkOrder
    .where((wo) => and(wo.id.eq(id), wo.deletedAt.eq(null)))
    .include("scheme")
    .include("comments", (c) => c.include("author").orderBy((cm) => cm.createdAt.desc()))
    // Only the caller's own invoices, even if the job was once awarded to someone else.
    .include("invoices", (inv) =>
      inv.where((i) => i.supplierId.eq(profile.id)).orderBy((i) => i.createdAt.desc()),
    )
    .first();

  if (!workOrder) notFound();

  // Verify the supplier is assigned to this work order and still an active
  // supplier on its scheme.
  if (workOrder.supplierId !== profile.id) notFound();
  const membership = await db.orm.public.SchemeMembership
    .where((m) =>
      and(
        m.profileId.eq(profile.id),
        m.schemeId.eq(workOrder.schemeId),
        m.role.eq("SUPPLIER"),
        m.isActive.eq(true),
      ),
    )
    .first();
  if (!membership) notFound();

  const status = statusConfig[workOrder.status] ?? statusConfig.AWARDED;
  const priority = priorityConfig[workOrder.priority] ?? priorityConfig.MEDIUM;

  return (
    <div className="max-w-4xl">
      <Link
        href="/supplier/work-orders"
        className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink transition-colors mb-6"
      >
        &larr; Back to Work Orders
      </Link>

      {/* Work order details */}
      <Card className="mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-xl font-heading font-bold text-ink">
              {workOrder.title}
            </h1>
            <p className="text-sm text-ink-muted mt-0.5">
              {workOrder.scheme?.name}
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${priority.className}`}
            >
              {priority.label}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}
            >
              {status.label}
            </span>
          </div>
        </div>

        {workOrder.description && (
          <p className="text-sm text-ink whitespace-pre-wrap mb-4">
            {workOrder.description}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-line">
          {workOrder.category && (
            <div>
              <p className="text-xs text-ink-muted">Category</p>
              <p className="text-sm font-medium text-ink">
                {workOrder.category}
              </p>
            </div>
          )}
          <div>
            <p className="text-xs text-ink-muted">Created</p>
            <p className="text-sm font-medium text-ink">
              {new Date(String(workOrder.createdAt)).toLocaleDateString(
                "en-AU",
                { day: "numeric", month: "long", year: "numeric" },
              )}
            </p>
          </div>
          {workOrder.completedAt && (
            <div>
              <p className="text-xs text-ink-muted">Completed</p>
              <p className="text-sm font-medium text-ink">
                {new Date(String(workOrder.completedAt)).toLocaleDateString(
                  "en-AU",
                  { day: "numeric", month: "long", year: "numeric" },
                )}
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Actions: status updates + invoice creation */}
      <WorkOrderActions
        workOrderId={id}
        currentStatus={workOrder.status}
      />

      {/* Comments */}
      <Card className="mb-6">
        <CardHeader
          title="Comments"
          description={`${workOrder.comments?.length ?? 0} comment${(workOrder.comments?.length ?? 0) === 1 ? "" : "s"}`}
        />

        {workOrder.comments && workOrder.comments.length > 0 ? (
          <div className="flex flex-col gap-3">
            {workOrder.comments.map((comment) => (
              <div
                key={comment.id}
                className="rounded-[var(--radius-card)] bg-muted px-4 py-3"
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-ink">
                    {comment.author?.firstName} {comment.author?.lastName}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {new Date(String(comment.createdAt)).toLocaleDateString(
                      "en-AU",
                      { day: "numeric", month: "short", year: "numeric" },
                    )}
                  </p>
                </div>
                <p className="text-sm text-ink whitespace-pre-wrap">
                  {comment.content}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-muted">
            No comments yet.
          </p>
        )}
      </Card>

      {/* Invoices */}
      <Card>
        <CardHeader
          title="Invoices"
          description={`${workOrder.invoices?.length ?? 0} invoice${(workOrder.invoices?.length ?? 0) === 1 ? "" : "s"}`}
        />

        {workOrder.invoices && workOrder.invoices.length > 0 ? (
          <div className="flex flex-col gap-2">
            {workOrder.invoices.map((inv) => {
              const invStatus =
                invoiceStatusConfig[inv.status] ?? invoiceStatusConfig.SUBMITTED;

              return (
                <div
                  key={inv.id}
                  className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {inv.invoiceNumber}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {inv.description}
                      {inv.dueDate &&
                        ` · Due ${new Date(String(inv.dueDate)).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`}
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center gap-3">
                    <span className="text-sm font-medium text-ink">
                      ${Number(inv.totalAmount).toLocaleString("en-AU", {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${invStatus.className}`}
                    >
                      {invStatus.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-ink-muted">
            No invoices have been submitted for this work order.
          </p>
        )}
      </Card>
    </div>
  );
}
