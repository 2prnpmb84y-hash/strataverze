import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getWorkOrderById } from "@/lib/queries/work-orders";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { WorkOrderEditForm } from "../work-order-form";
import { DeleteWorkOrderButton } from "./delete-work-order-button";
import { WorkOrderStatusButton } from "./work-order-status-button";
import { CommentThread } from "./comment-thread";
import { CommentForm } from "./comment-form";
import { connection } from "next/server";

const priorityStyle: Record<string, string> = {
  LOW: "bg-gray-100 text-gray-700",
  MEDIUM: "bg-blue-100 text-blue-700",
  HIGH: "bg-orange-100 text-orange-700",
  URGENT: "bg-red-100 text-red-700",
};

const statusStyle: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-yellow-100 text-yellow-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-gray-100 text-gray-700",
};

const categoryLabels: Record<string, string> = {
  PLUMBING: "Plumbing",
  ELECTRICAL: "Electrical",
  STRUCTURAL: "Structural",
  LANDSCAPING: "Landscaping",
  CLEANING: "Cleaning",
  SECURITY: "Security",
  OTHER: "Other",
};

export default async function WorkOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string; workOrderId: string }>;
}) {
  await connection();
  const { id, workOrderId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const workOrder = await getWorkOrderById(workOrderId);
  if (!workOrder || workOrder.schemeId !== id) notFound();

  const raisedByName =
    `${workOrder.raisedBy.firstName} ${workOrder.raisedBy.lastName}`.trim() ||
    workOrder.raisedBy.email;
  const createdDate = new Date(String(workOrder.createdAt));
  const isOpen = workOrder.status === "OPEN" || workOrder.status === "IN_PROGRESS";

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={workOrder.title}
        description={`Raised by ${raisedByName} on ${createdDate.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`}
        backHref={`/adviser/schemes/${id}/work-orders`}
        backLabel="Work Orders"
      />

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="rounded-[var(--radius-card)] border border-line bg-white p-4">
          <p className="text-xs text-ink-muted mb-1">Status</p>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[workOrder.status] ?? "bg-gray-100 text-gray-700"}`}
          >
            {workOrder.status.replace("_", " ")}
          </span>
        </div>
        <div className="rounded-[var(--radius-card)] border border-line bg-white p-4">
          <p className="text-xs text-ink-muted mb-1">Priority</p>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${priorityStyle[workOrder.priority] ?? "bg-gray-100 text-gray-700"}`}
          >
            {workOrder.priority}
          </span>
        </div>
        <StatCard
          label="Comments"
          value={workOrder.comments.length}
          accent="bg-adviser"
        />
        <StatCard
          label="Est. Cost"
          value={
            workOrder.estimatedCost
              ? `$${Number(workOrder.estimatedCost).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`
              : "N/A"
          }
          accent="bg-adviser"
        />
      </div>

      {/* Details */}
      <Card className="mb-6">
        <CardHeader title="Details" />
        <div className="flex flex-col gap-3">
          <div className="rounded-[var(--radius-card)] bg-muted px-4 py-3">
            <p className="text-sm text-ink whitespace-pre-wrap">
              {workOrder.description}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {workOrder.category && (
              <div className="rounded-[var(--radius-card)] bg-muted px-4 py-3">
                <p className="text-xs text-ink-muted mb-0.5">Category</p>
                <p className="text-sm font-medium text-ink">
                  {categoryLabels[workOrder.category] ?? workOrder.category}
                </p>
              </div>
            )}
            {workOrder.assignedTo && (
              <div className="rounded-[var(--radius-card)] bg-muted px-4 py-3">
                <p className="text-xs text-ink-muted mb-0.5">
                  Assigned To
                </p>
                <p className="text-sm font-medium text-ink">
                  {workOrder.assignedTo}
                </p>
              </div>
            )}
            {workOrder.actualCost && (
              <div className="rounded-[var(--radius-card)] bg-muted px-4 py-3">
                <p className="text-xs text-ink-muted mb-0.5">
                  Actual Cost
                </p>
                <p className="text-sm font-medium text-ink">
                  ${Number(workOrder.actualCost).toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                </p>
              </div>
            )}
            {workOrder.completedAt && (
              <div className="rounded-[var(--radius-card)] bg-muted px-4 py-3">
                <p className="text-xs text-ink-muted mb-0.5">
                  Completed
                </p>
                <p className="text-sm font-medium text-ink">
                  {new Date(String(workOrder.completedAt)).toLocaleDateString(
                    "en-AU",
                    { day: "numeric", month: "short", year: "numeric" },
                  )}
                </p>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Status actions */}
      {isOpen && (
        <Card className="mb-6">
          <CardHeader
            title="Update Status"
            description="Progress this work order through its lifecycle."
          />
          <WorkOrderStatusButton
            schemeId={id}
            workOrderId={workOrderId}
            currentStatus={workOrder.status}
          />
        </Card>
      )}

      {/* Comments */}
      <Card className="mb-6">
        <CardHeader
          title="Comments"
          description={
            workOrder.comments.length === 0
              ? "No comments yet."
              : `${workOrder.comments.length} comment${workOrder.comments.length === 1 ? "" : "s"}`
          }
        />
        <div className="flex flex-col gap-4">
          <CommentThread schemeId={id} workOrderId={workOrderId} />
          <CommentForm schemeId={id} workOrderId={workOrderId} />
        </div>
      </Card>

      {/* Edit form */}
      {isOpen && (
        <div className="mb-6">
          <h2 className="font-heading font-semibold text-ink mb-4">
            Edit Work Order
          </h2>
          <WorkOrderEditForm
            schemeId={id}
            workOrderId={workOrderId}
            defaults={{
              title: workOrder.title,
              description: workOrder.description,
              priority: workOrder.priority,
              category: workOrder.category,
              estimatedCost: workOrder.estimatedCost
                ? String(Number(workOrder.estimatedCost))
                : null,
              assignedTo: workOrder.assignedTo,
            }}
          />
        </div>
      )}

      {/* Danger zone */}
      <Card className="border-red-200">
        <CardHeader
          title="Danger Zone"
          description="Irreversible actions for this work order."
        />
        <DeleteWorkOrderButton
          schemeId={id}
          workOrderId={workOrderId}
          workOrderTitle={workOrder.title}
        />
      </Card>
    </div>
  );
}
