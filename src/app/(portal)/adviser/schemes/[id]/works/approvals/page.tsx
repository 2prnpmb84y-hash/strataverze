import { connection } from "next/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePageAccess } from "@/lib/auth/require-access";
import { getSchemeById } from "@/lib/queries/schemes";
import { timeZoneOf } from "@/lib/jurisdiction/scheme-time";
import { formatDateIn } from "@/lib/jurisdiction/time-zone";
import {
  getApprovalRoutes,
  getPendingApprovals,
  getDelegations,
} from "@/lib/queries/works";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { Button } from "@/components/ui/button";

function formatCurrency(value: number | string | null): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value));
}

const entityTypeLabel: Record<string, string> = {
  QUOTATION: "Quotation",
  VARIATION: "Variation",
  INVOICE: "Invoice",
  PAYMENT: "Payment",
};

const authorityTypeLabel: Record<string, string> = {
  REQUEST: "Raise Request",
  INVITE_QUOTATIONS: "Invite Quotations",
  RECOMMEND: "Recommend",
  APPROVE_EXPENDITURE: "Approve Expenditure",
  SIGN_CONTRACT: "Sign Contract",
  CERTIFY_MILESTONE: "Certify Milestone",
  APPROVE_PAYMENT: "Approve Payment",
  RELEASE_PAYMENT: "Release Payment",
};

export default async function ApprovalsPage({
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
  const tz = timeZoneOf(scheme);

  const [approvalRoutes, pendingApprovals, delegations] = await Promise.all([
    getApprovalRoutes(id),
    getPendingApprovals(id),
    getDelegations(id, { isActive: true }),
  ]);

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Approvals & Delegations"
        description="Manage approval routes, pending approvals, and authority delegations."
        backHref={`/adviser/schemes/${id}/works`}
        backLabel="Works"
      />

      {/* Pending Approvals */}
      <Card className="mb-6">
        <CardHeader
          title="Pending Approvals"
          description={`${pendingApprovals.length} item${pendingApprovals.length === 1 ? "" : "s"} awaiting approval`}
        />
        {pendingApprovals.length === 0 ? (
          <div className="px-5 pb-5 text-center py-4">
            <p className="text-sm text-ink-muted">No pending approvals.</p>
          </div>
        ) : (
          <div className="px-5 pb-5 flex flex-col gap-2">
            {pendingApprovals.map((workflow) => (
              <div
                key={workflow.id}
                className="rounded-[var(--radius-card)] bg-surface-muted px-4 py-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {entityTypeLabel[workflow.entityType] ?? workflow.entityType} Approval
                    </p>
                    <p className="text-xs text-ink-muted mt-0.5">
                      Amount: {formatCurrency(workflow.totalAmount)}
                      {workflow.approvalRoute && (
                        <> &middot; Route: {String(workflow.approvalRoute.name)}</>
                      )}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {workflow.records.length} of{" "}
                      {workflow.approvalRoute
                        ? workflow.approvalRoute.requiredApprovers
                        : 1}{" "}
                      approver{workflow.approvalRoute?.requiredApprovers === 1 ? "" : "s"} responded
                    </p>
                  </div>
                  <StatusChip status="Pending" variant="warning" />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Approval Routes */}
      <Card className="mb-6">
        <CardHeader
          title="Approval Routes"
          description="Define approval thresholds and approver roles."
          action={
            <Button href={`/adviser/schemes/${id}/works/approvals/routes/new`} variant="ghost">
              Add Route
            </Button>
          }
        />
        {approvalRoutes.length === 0 ? (
          <div className="px-5 pb-5 text-center py-4">
            <p className="text-sm text-ink-muted">
              No approval routes defined. Add routes to configure approval thresholds.
            </p>
          </div>
        ) : (
          <div className="px-5 pb-5 flex flex-col gap-2">
            {approvalRoutes.map((route) => (
              <Link
                key={route.id}
                href={`/adviser/schemes/${id}/works/approvals/routes/${route.id}/edit`}
                className="block rounded-[var(--radius-card)] bg-surface-muted px-4 py-3 hover:bg-surface-muted/80 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-ink">{String(route.name)}</p>
                    {route.description && (
                      <p className="text-xs text-ink-muted mt-0.5">{String(route.description)}</p>
                    )}
                    <p className="text-xs text-ink-muted mt-1">
                      {route.minAmount || route.maxAmount
                        ? `${route.minAmount ? formatCurrency(route.minAmount) : "$0"} – ${route.maxAmount ? formatCurrency(route.maxAmount) : "unlimited"}`
                        : "All amounts"}
                      {" "}&middot; {route.requiredApprovers} approver{route.requiredApprovers === 1 ? "" : "s"}
                      {" "}&middot; Roles: {(route.approverRoles as string[]).join(", ")}
                    </p>
                  </div>
                  <StatusChip
                    status={route.isActive ? "Active" : "Inactive"}
                    variant={route.isActive ? "success" : "default"}
                  />
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* Delegations */}
      <Card>
        <CardHeader
          title="Authority Delegations"
          description="Delegate approval authority to specific team members."
          action={
            <Button href={`/adviser/schemes/${id}/works/delegations/new`} variant="ghost">
              Add Delegation
            </Button>
          }
        />
        {delegations.length === 0 ? (
          <div className="px-5 pb-5 text-center py-4">
            <p className="text-sm text-ink-muted">
              No active delegations. Add delegations to authorise team members for specific actions.
            </p>
          </div>
        ) : (
          <div className="px-5 pb-5 flex flex-col gap-2">
            {delegations.map((del) => (
              <div
                key={del.id}
                className="rounded-[var(--radius-card)] bg-surface-muted px-4 py-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {del.delegatedBy.firstName} {del.delegatedBy.lastName}
                      {" → "}
                      {del.delegatedTo.firstName} {del.delegatedTo.lastName}
                    </p>
                    <p className="text-xs text-ink-muted mt-0.5">
                      {authorityTypeLabel[del.authorityType] ?? del.authorityType}
                      {del.maxAmount && <> &middot; Up to {formatCurrency(del.maxAmount)}</>}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {formatDateIn(tz, String(del.startDate))}
                      {del.endDate && <> – {formatDateIn(tz, String(del.endDate))}</>}
                    </p>
                  </div>
                  <StatusChip
                    status={del.isActive ? "Active" : "Revoked"}
                    variant={del.isActive ? "success" : "default"}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
