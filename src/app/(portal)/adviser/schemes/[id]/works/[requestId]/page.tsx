import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { Button } from "@/components/ui/button";
import { getWorksRequestById } from "@/lib/queries/works";
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import Link from "next/link";
import { WorksRequestActions } from "./works-request-actions";

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
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under Review",
  SCOPE_PREPARATION: "Scope Preparation",
  PROCUREMENT: "Procurement",
  CONTRACT_MANAGEMENT: "Contract Management",
  IN_PROGRESS: "In Progress",
  PRACTICAL_COMPLETION: "Practical Completion",
  DEFECTS_RECTIFICATION: "Defects Rectification",
  FINAL_COMPLETION: "Final Completion",
  CLOSED: "Closed",
};

const priorityLabel: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

const priorityColour: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-700",
  MEDIUM: "bg-blue-100 text-blue-700",
  HIGH: "bg-amber-100 text-amber-700",
  CRITICAL: "bg-red-100 text-red-700",
};

const reviewOutcomeLabel: Record<string, string> = {
  APPROVED: "Approved",
  RETURNED: "Returned",
  REJECTED: "Rejected",
  EMERGENCY_APPROVED: "Emergency Approved",
};

const reviewOutcomeColour: Record<string, string> = {
  APPROVED: "bg-green-100 text-green-700",
  RETURNED: "bg-amber-100 text-amber-700",
  REJECTED: "bg-red-100 text-red-700",
  EMERGENCY_APPROVED: "bg-purple-100 text-purple-700",
};

export default async function WorksRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string; requestId: string }>;
}) {
  await connection();
  const { id, requestId } = await params;

  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const request = await getWorksRequestById(requestId);

  if (!request || request.schemeId !== id) notFound();

  // Fetch scheme members for the assign dropdown
  const memberships = await db.orm.public.SchemeMembership
    .where((m) => and(m.schemeId.eq(id), m.isActive.eq(true)))
    .include("profile")
    .limit(200)
    .all();

  const members = memberships.map((m) => ({
    id: m.profileId,
    firstName: m.profile.firstName,
    lastName: m.profile.lastName,
  }));

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title={String(request.title)}
        description={`Works Request ${request.requestNumber}`}
        backHref={`/adviser/schemes/${id}/works`}
        backLabel="Works"
        action={
          <Button
            href={`/adviser/schemes/${id}/works/${requestId}/edit`}
            variant="secondary"
          >
            Edit
          </Button>
        }
      />

      {/* Status and priority badges */}
      <div className="flex flex-wrap items-center gap-3">
        <StatusChip status={statusLabel[request.status] ?? request.status} />
        <span
          className={`inline-flex items-center rounded-full h-[22px] px-2.5 text-[11px] font-medium ${priorityColour[request.priority] ?? "bg-slate-100 text-slate-700"}`}
        >
          {priorityLabel[request.priority] ?? request.priority}
        </span>
        {request.isEmergency && (
          <span className="inline-flex items-center rounded-full h-[22px] px-2.5 text-[11px] font-medium bg-red-100 text-red-700">
            Emergency
          </span>
        )}
        {request.isUrgent && (
          <span className="inline-flex items-center rounded-full h-[22px] px-2.5 text-[11px] font-medium bg-amber-100 text-amber-700">
            Urgent
          </span>
        )}
        {request.isOverdue && (
          <span className="inline-flex items-center rounded-full h-[22px] px-2.5 text-[11px] font-medium bg-red-100 text-red-700">
            Overdue
          </span>
        )}
        {request.hasComplianceIssue && (
          <span className="inline-flex items-center rounded-full h-[22px] px-2.5 text-[11px] font-medium bg-orange-100 text-orange-700">
            Compliance Issue
          </span>
        )}
        {request.hasDispute && (
          <span className="inline-flex items-center rounded-full h-[22px] px-2.5 text-[11px] font-medium bg-orange-100 text-orange-700">
            Dispute
          </span>
        )}
      </div>

      {/* Actions panel */}
      <WorksRequestActions
        requestId={requestId}
        schemeId={id}
        status={request.status}
        members={members}
      />

      {/* Details card */}
      <Card>
        <CardHeader title="Request Details" />
        <div className="px-5 pb-5">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                Raised By
              </dt>
              <dd className="text-sm text-ink">
                {request.raisedBy.firstName} {request.raisedBy.lastName}
              </dd>
            </div>
            {request.assignedTo && (
              <div>
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Assigned To
                </dt>
                <dd className="text-sm text-ink">
                  {request.assignedTo.firstName} {request.assignedTo.lastName}
                </dd>
              </div>
            )}
            {request.category && (
              <div>
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Category
                </dt>
                <dd className="text-sm text-ink">{request.category.name}</dd>
              </div>
            )}
            {request.estimatedCost && (
              <div>
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Estimated Cost
                </dt>
                <dd className="text-sm text-ink font-medium">
                  {formatCurrency(request.estimatedCost)}
                </dd>
              </div>
            )}
            {request.location && (
              <div>
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Location
                </dt>
                <dd className="text-sm text-ink">{request.location}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                Created
              </dt>
              <dd className="text-sm text-ink">
                {formatDateTime(request.createdAt)}
              </dd>
            </div>
            {request.submittedAt && (
              <div>
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Submitted
                </dt>
                <dd className="text-sm text-ink">
                  {formatDateTime(request.submittedAt)}
                </dd>
              </div>
            )}
            {request.closedAt && (
              <div>
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Closed
                </dt>
                <dd className="text-sm text-ink">
                  {formatDateTime(request.closedAt)}
                </dd>
              </div>
            )}
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                Description
              </dt>
              <dd className="text-sm text-ink whitespace-pre-wrap">
                {request.description}
              </dd>
            </div>
          </dl>
        </div>
      </Card>

      {/* Scope of Works */}
      {request.scopes.length > 0 && (
        <Card>
          <CardHeader
            title="Scope of Works"
            description={`${request.scopes.length} scope${request.scopes.length === 1 ? "" : "s"}`}
          />
          <div className="flex flex-col gap-2 px-5 pb-5">
            {request.scopes.map((scope) => (
              <div
                key={scope.id}
                className="rounded-[var(--radius-card)] bg-muted p-4"
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-ink">
                    {scope.title}
                  </p>
                  <StatusChip status={scope.status} />
                </div>
                {scope.description && (
                  <p className="text-xs text-ink-muted whitespace-pre-wrap mt-1">
                    {scope.description}
                  </p>
                )}
                <p className="text-xs text-ink-muted mt-1">
                  Version {Number(scope.currentVersion)}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Reviews */}
      {request.reviews.length > 0 && (
        <Card>
          <CardHeader
            title="Review History"
            description={`${request.reviews.length} review${request.reviews.length === 1 ? "" : "s"}`}
          />
          <div className="flex flex-col gap-2 px-5 pb-5">
            {request.reviews.map((review) => (
              <div
                key={review.id}
                className="rounded-[var(--radius-card)] bg-muted p-4"
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-ink">
                    {review.reviewer.firstName} {review.reviewer.lastName}
                  </p>
                  <span
                    className={`inline-flex items-center rounded-full h-[22px] px-2.5 text-[11px] font-medium ${reviewOutcomeColour[review.outcome] ?? "bg-slate-100 text-slate-700"}`}
                  >
                    {reviewOutcomeLabel[review.outcome] ?? review.outcome}
                  </span>
                </div>
                <p className="text-xs text-ink-muted">
                  {formatDateTime(review.reviewedAt)}
                </p>
                {review.procurementRoute && (
                  <p className="text-xs text-ink-muted mt-1">
                    Procurement route: {review.procurementRoute}
                  </p>
                )}
                {review.comments && (
                  <p className="text-sm text-ink whitespace-pre-wrap mt-2">
                    {review.comments}
                  </p>
                )}
                {review.returnReason && (
                  <p className="text-sm text-amber-700 whitespace-pre-wrap mt-2">
                    Return reason: {review.returnReason}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Version history */}
      {request.versions.length > 0 && (
        <Card>
          <CardHeader
            title="Version History"
            description={`${request.versions.length} version${request.versions.length === 1 ? "" : "s"}`}
          />
          <div className="flex flex-col gap-2 px-5 pb-5">
            {request.versions.map((ver) => (
              <div
                key={ver.id}
                className="flex items-start gap-3 rounded-[var(--radius-card)] bg-muted p-3"
              >
                <span className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-white border border-line text-xs font-mono">
                  {Number(ver.versionNumber)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{ver.title}</p>
                  {ver.changeReason && (
                    <p className="text-xs text-ink-muted mt-0.5">
                      {ver.changeReason}
                    </p>
                  )}
                  <p className="text-xs text-ink-muted mt-0.5">
                    {ver.createdBy.firstName} {ver.createdBy.lastName}
                    {" · "}
                    {formatDateTime(ver.createdAt)}
                  </p>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="font-medium text-ink">Priority:</span>{" "}
                      <span className="text-ink-muted">
                        {priorityLabel[ver.priority] ?? ver.priority}
                      </span>
                    </div>
                    {ver.location && (
                      <div>
                        <span className="font-medium text-ink">Location:</span>{" "}
                        <span className="text-ink-muted">{ver.location}</span>
                      </div>
                    )}
                    {ver.estimatedCost && (
                      <div>
                        <span className="font-medium text-ink">Estimated cost:</span>{" "}
                        <span className="text-ink-muted">
                          {formatCurrency(ver.estimatedCost)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Documents */}
      {request.documents.length > 0 && (
        <Card>
          <CardHeader
            title="Documents"
            description={`${request.documents.length} file${request.documents.length === 1 ? "" : "s"} attached`}
          />
          <div className="flex flex-col gap-1 px-5 pb-5">
            {request.documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted p-4"
              >
                <div>
                  <p className="text-sm font-medium text-ink">
                    {doc.fileName}
                  </p>
                  <p className="text-xs text-ink-muted">
                    Uploaded: {formatDate(doc.createdAt)}
                    {doc.uploadedBy &&
                      ` by ${doc.uploadedBy.firstName} ${doc.uploadedBy.lastName}`}
                  </p>
                </div>
                <span className="text-xs text-ink-muted">
                  {doc.documentType}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Related contracts */}
      {request.contracts.length > 0 && (
        <Card>
          <CardHeader
            title="Related Contracts"
            description={`${request.contracts.length} contract${request.contracts.length === 1 ? "" : "s"}`}
          />
          <div className="flex flex-col gap-2 px-5 pb-5">
            {request.contracts.map((contract) => (
              <Link
                key={contract.id}
                href={`/adviser/schemes/${id}/works/contracts/${contract.id}`}
                className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted p-4 hover:bg-muted/70 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-ink">
                    {contract.title}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {contract.contractNumber}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-ink">
                    {formatCurrency(contract.contractValue)}
                  </p>
                  <StatusChip status={contract.status} />
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* Related invoices */}
      {request.invoices.length > 0 && (
        <Card>
          <CardHeader
            title="Related Invoices"
            description={`${request.invoices.length} invoice${request.invoices.length === 1 ? "" : "s"}`}
          />
          <div className="flex flex-col gap-2 px-5 pb-5">
            {request.invoices.map((invoice) => (
              <Link
                key={invoice.id}
                href={`/adviser/schemes/${id}/works/invoices/${invoice.id}`}
                className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted p-4 hover:bg-muted/70 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-ink">
                    {invoice.invoiceNumber}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {formatDate(invoice.invoiceDate)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-ink">
                    {formatCurrency(invoice.claimedAmount)}
                  </p>
                  <StatusChip status={invoice.status} />
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
