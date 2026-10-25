import { connection } from "next/server";
import { notFound } from "next/navigation";
import { requirePageAccess } from "@/lib/auth/require-access";
import { getSchemeById } from "@/lib/queries/schemes";
import { getWorksWorkOrderById } from "@/lib/queries/works";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { Button } from "@/components/ui/button";
import Link from "next/link";

function formatDate(date: Date | string | null): string {
  if (!date) return "—";
  return new Date(String(date)).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(date: Date | string | null): string {
  if (!date) return "—";
  return new Date(String(date)).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
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

export default async function WorkOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string; workOrderId: string }>;
}) {
  await connection();
  const { id, workOrderId } = await params;

  // Role check on this scheme (SEC-004 / H5): a page is a privileged read.
  const access = await requirePageAccess(id, "works.read");
  if (!access) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const wo = await getWorksWorkOrderById(workOrderId);
  if (!wo || wo.schemeId !== id) notFound();

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title={wo.title}
        description={`Work Order ${wo.workOrderNumber}`}
        backHref={`/adviser/schemes/${id}/works/work-orders`}
        backLabel="Work Orders"
        action={
          <Button
            href={`/adviser/schemes/${id}/works/work-orders/${workOrderId}/edit`}
            variant="secondary"
          >
            Edit
          </Button>
        }
      />

      <div className="flex items-center gap-3">
        <StatusChip
          status={statusLabel[wo.status] ?? wo.status}
        />
      </div>

      {/* Work order details */}
      <Card>
        <CardHeader title="Work Order Details" />
        <div className="px-5 pb-5">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                Contractor
              </dt>
              <dd className="text-sm text-ink">
                {wo.contractorBusiness.companyName}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                Contract
              </dt>
              <dd className="text-sm text-ink">
                {wo.contract ? (
                  <Link
                    href={`/adviser/schemes/${id}/works/contracts/${wo.contract.id}`}
                    className="text-turquoise hover:underline"
                  >
                    {wo.contract.contractNumber} &mdash; {wo.contract.title}
                  </Link>
                ) : (
                  "None (urgent work order)"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                Scheduled Start
              </dt>
              <dd className="text-sm text-ink">
                {formatDate(wo.scheduledStart)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                Scheduled End
              </dt>
              <dd className="text-sm text-ink">
                {formatDate(wo.scheduledEnd)}
              </dd>
            </div>
            {wo.actualStart && (
              <div>
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Actual Start
                </dt>
                <dd className="text-sm text-ink">
                  {formatDate(wo.actualStart)}
                </dd>
              </div>
            )}
            {wo.actualEnd && (
              <div>
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Actual End
                </dt>
                <dd className="text-sm text-ink">
                  {formatDate(wo.actualEnd)}
                </dd>
              </div>
            )}
            {wo.authorisedBy && (
              <div>
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Authorised By
                </dt>
                <dd className="text-sm text-ink">
                  {wo.authorisedBy.firstName} {wo.authorisedBy.lastName}
                  {wo.authorisedAt && (
                    <span className="text-xs text-ink-muted ml-2">
                      {formatDateTime(wo.authorisedAt)}
                    </span>
                  )}
                </dd>
              </div>
            )}
            {wo.acknowledgedAt && (
              <div>
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Acknowledged
                </dt>
                <dd className="text-sm text-ink">
                  {formatDateTime(wo.acknowledgedAt)}
                </dd>
              </div>
            )}
            {wo.description && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Description
                </dt>
                <dd className="text-sm text-ink whitespace-pre-wrap">
                  {wo.description}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </Card>

      {/* Milestones */}
      {wo.milestones.length > 0 && (
        <Card>
          <CardHeader
            title="Milestones"
            description={`${wo.milestones.length} milestone${wo.milestones.length === 1 ? "" : "s"}`}
          />
          <div className="flex flex-col gap-2 px-5 pb-5">
            {wo.milestones.map((ms) => (
              <div
                key={ms.id}
                className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted p-4"
              >
                <div>
                  <p className="text-sm font-medium text-ink">
                    {ms.name}
                  </p>
                  <p className="text-xs text-ink-muted">
                    Due: {formatDate(ms.dueDate)}
                    {ms.completedAt && ` · Completed: ${formatDate(ms.completedAt)}`}
                  </p>
                </div>
                <StatusChip status={ms.status} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Site visits */}
      {wo.siteVisits.length > 0 && (
        <Card>
          <CardHeader
            title="Site Visits"
            description={`${wo.siteVisits.length} visit${wo.siteVisits.length === 1 ? "" : "s"}`}
          />
          <div className="flex flex-col gap-2 px-5 pb-5">
            {wo.siteVisits.map((sv) => (
              <div
                key={sv.id}
                className="rounded-[var(--radius-card)] bg-muted p-4"
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-ink">
                    {formatDate(sv.visitDate)}
                  </p>
                  <span className="text-xs text-ink-muted">
                    {sv.conductedBy.firstName} {sv.conductedBy.lastName}
                  </span>
                </div>
                {sv.purpose && (
                  <p className="text-xs text-ink-muted">
                    Purpose: {sv.purpose}
                  </p>
                )}
                {sv.findings && (
                  <p className="text-xs text-ink-muted whitespace-pre-wrap mt-1">
                    {sv.findings}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Progress reports */}
      {wo.progressReports.length > 0 && (
        <Card>
          <CardHeader
            title="Progress Reports"
            description={`${wo.progressReports.length} report${wo.progressReports.length === 1 ? "" : "s"}`}
          />
          <div className="flex flex-col gap-2 px-5 pb-5">
            {wo.progressReports.map((pr) => (
              <div
                key={pr.id}
                className="rounded-[var(--radius-card)] bg-muted p-4"
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-ink">
                    {formatDate(pr.reportDate)}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-ink">
                      {Number(pr.percentComplete)}%
                    </span>
                    <span className="text-xs text-ink-muted">
                      {pr.submittedBy.firstName} {pr.submittedBy.lastName}
                    </span>
                  </div>
                </div>
                {pr.summary && (
                  <p className="text-xs text-ink-muted whitespace-pre-wrap">
                    {pr.summary}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Inspections */}
      {wo.inspections.length > 0 && (
        <Card>
          <CardHeader
            title="Inspections"
            description={`${wo.inspections.length} inspection${wo.inspections.length === 1 ? "" : "s"}`}
          />
          <div className="flex flex-col gap-2 px-5 pb-5">
            {wo.inspections.map((ins) => (
              <div
                key={ins.id}
                className="rounded-[var(--radius-card)] bg-muted p-4"
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-ink">
                    {ins.inspectionType} &mdash; {formatDate(ins.inspectionDate)}
                  </p>
                  {ins.outcome && <StatusChip status={ins.outcome} />}
                </div>
                <p className="text-xs text-ink-muted">
                  Inspector: {ins.inspector.firstName} {ins.inspector.lastName}
                </p>
                {ins.findings && (
                  <p className="text-xs text-ink-muted mt-1 whitespace-pre-wrap">
                    {ins.findings}
                  </p>
                )}
                {ins.defects.length > 0 && (
                  <div className="mt-2 border-t border-line pt-2">
                    <p className="text-xs font-medium text-ink mb-1">
                      Defects ({ins.defects.length})
                    </p>
                    {ins.defects.map((d) => (
                      <div
                        key={d.id}
                        className="flex items-center justify-between text-xs mb-1"
                      >
                        <span className="text-ink-muted">
                          {d.description}
                        </span>
                        <StatusChip status={d.status} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Completion submissions */}
      {wo.completionSubmissions.length > 0 && (
        <Card>
          <CardHeader
            title="Completion Submissions"
            description={`${wo.completionSubmissions.length} submission${wo.completionSubmissions.length === 1 ? "" : "s"}`}
          />
          <div className="flex flex-col gap-2 px-5 pb-5">
            {wo.completionSubmissions.map((cs) => (
              <div
                key={cs.id}
                className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted p-4"
              >
                <div>
                  <p className="text-sm font-medium text-ink">
                    Submitted: {formatDateTime(cs.submittedAt)}
                  </p>
                  <p className="text-xs text-ink-muted">
                    By: {cs.submittedBy.firstName} {cs.submittedBy.lastName}
                  </p>
                  {cs.reviewedBy && (
                    <p className="text-xs text-ink-muted">
                      Reviewed by: {cs.reviewedBy.firstName} {cs.reviewedBy.lastName}
                      {cs.reviewedAt && ` on ${formatDateTime(cs.reviewedAt)}`}
                    </p>
                  )}
                </div>
                <StatusChip status={cs.status} />
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
