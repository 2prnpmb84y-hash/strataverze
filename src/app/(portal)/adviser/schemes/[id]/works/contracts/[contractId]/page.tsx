import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import { getWorksContractById } from "@/lib/queries/works";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { executeWorksContract } from "@/lib/actions/works";
import { FeeActionButton } from "@/components/billing/fee-action-button";
import { previewUsageFee } from "@/lib/billing/capture";

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
  PENDING_SIGNATURE: "Pending Signature",
  EXECUTED: "Executed",
  ACTIVE: "Active",
  PRACTICAL_COMPLETION: "Practical Completion",
  DEFECTS_LIABILITY: "Defects Liability",
  COMPLETED: "Completed",
  TERMINATED: "Terminated",
  SUSPENDED: "Suspended",
  DISPUTED: "Disputed",
};

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string; contractId: string }>;
}) {
  await connection();
  const { id, contractId } = await params;

  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const contract = await getWorksContractById(contractId);
  if (!contract || contract.schemeId !== id) notFound();

  const canExecute = contract.status === "DRAFT" || contract.status === "PENDING_SIGNATURE";
  const executionFee = canExecute
    ? await previewUsageFee({
        code: "WORKS_CONTRACT",
        bandValue: Math.round(Number(contract.contractValue) * 100),
      })
    : null;

  async function executeAction(feeConfirmedCents: number | null) {
    "use server";
    return executeWorksContract(contractId, id, feeConfirmedCents);
  }

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title={contract.title}
        description={`Contract ${contract.contractNumber}`}
        backHref={`/adviser/schemes/${id}/works/contracts`}
        backLabel="Contracts"
        action={
          <Button
            href={`/adviser/schemes/${id}/works/contracts/${contractId}/edit`}
            variant="secondary"
          >
            Edit
          </Button>
        }
      />

      <div className="flex items-center gap-3">
        <StatusChip
          status={statusLabel[contract.status] ?? contract.status}
        />
      </div>

      {canExecute && (
        <Card>
          <CardHeader
            title="Record execution"
            description="Record that the owners corporation has signed this contract."
          />
          <FeeActionButton
            fee={executionFee}
            scheduleHref={`/adviser/schemes/${id}/finance/platform-fees#fee-schedule`}
            label="Record contract as executed"
            pendingLabel="Recording..."
            successMessage="Contract recorded as executed."
            action={executeAction}
            idSuffix={`-${contractId}`}
          />
        </Card>
      )}

      {/* Contract details */}
      <Card>
        <CardHeader title="Contract Details" />
        <div className="px-5 pb-5">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                Contractor
              </dt>
              <dd className="text-sm text-ink">
                {contract.contractorBusiness.companyName}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                Contract Value
              </dt>
              <dd className="text-sm text-ink font-semibold">
                {formatCurrency(contract.contractValue)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                GST Amount
              </dt>
              <dd className="text-sm text-ink">
                {formatCurrency(contract.gstAmount)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                Total Value (incl. GST)
              </dt>
              <dd className="text-sm text-ink font-semibold">
                {formatCurrency(contract.totalValue)}
              </dd>
            </div>
            {contract.revisedContractValue && (
              <div>
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Revised Contract Value
                </dt>
                <dd className="text-sm text-ink font-semibold text-amber-600">
                  {formatCurrency(contract.revisedContractValue)}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                Approved Variations
              </dt>
              <dd className="text-sm text-ink">
                {formatCurrency(contract.approvedVariations)}
              </dd>
            </div>
            {contract.retentionPercentage && (
              <div>
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Retention
                </dt>
                <dd className="text-sm text-ink">
                  {Number(contract.retentionPercentage)}%
                  {contract.retentionAmount &&
                    ` (${formatCurrency(contract.retentionAmount)})`}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                Start Date
              </dt>
              <dd className="text-sm text-ink">
                {formatDate(contract.startDate)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                End Date
              </dt>
              <dd className="text-sm text-ink">
                {formatDate(contract.endDate)}
              </dd>
            </div>
            {contract.executedAt && (
              <div>
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Executed
                </dt>
                <dd className="text-sm text-ink">
                  {formatDateTime(contract.executedAt)}
                </dd>
              </div>
            )}
            {contract.signedBy && (
              <div>
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Signed By
                </dt>
                <dd className="text-sm text-ink">
                  {contract.signedBy.firstName} {contract.signedBy.lastName}
                </dd>
              </div>
            )}
            {contract.defectsLiabilityEnd && (
              <div>
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Defects Liability Period Ends
                </dt>
                <dd className="text-sm text-ink">
                  {formatDate(contract.defectsLiabilityEnd)}
                </dd>
              </div>
            )}
            {contract.completedAt && (
              <div>
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Completed
                </dt>
                <dd className="text-sm text-ink">
                  {formatDateTime(contract.completedAt)}
                </dd>
              </div>
            )}
            {contract.description && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Description
                </dt>
                <dd className="text-sm text-ink whitespace-pre-wrap">
                  {contract.description}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </Card>

      {/* Linked works request */}
      {contract.request && (
        <Card>
          <CardHeader title="Linked Works Request" />
          <div className="px-5 pb-5">
            <Link
              href={`/adviser/schemes/${id}/works/${contract.request.id}`}
              className="flex items-center gap-3 rounded-[var(--radius-card)] bg-muted p-4 hover:bg-muted/70 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">
                  {contract.request.title}
                </p>
                <p className="text-xs text-ink-muted">
                  {contract.request.requestNumber}
                </p>
              </div>
              <StatusChip status={contract.request.status} />
            </Link>
          </div>
        </Card>
      )}

      {/* Work orders */}
      {contract.workOrders.length > 0 && (
        <Card>
          <CardHeader
            title="Work Orders"
            description={`${contract.workOrders.length} work order${contract.workOrders.length === 1 ? "" : "s"}`}
          />
          <div className="flex flex-col gap-2 px-5 pb-5">
            {contract.workOrders.map((wo) => (
              <div
                key={wo.id}
                className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted p-4"
              >
                <div>
                  <p className="text-sm font-medium text-ink">
                    {wo.title}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {wo.workOrderNumber}
                  </p>
                </div>
                <StatusChip status={wo.status} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Variations */}
      <Card>
        <CardHeader
          title="Variations"
          description={`${contract.variations.length} variation${contract.variations.length === 1 ? "" : "s"}`}
          action={
            <Button
              variant="secondary"
              href={`/adviser/schemes/${id}/works/contracts/${contractId}/variations/new`}
            >
              New Variation
            </Button>
          }
        />
        {contract.variations.length > 0 ? (
          <div className="flex flex-col gap-2 px-5 pb-5">
            {contract.variations.map((variation) => (
              <div
                key={variation.id}
                className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted p-4"
              >
                <div>
                  <p className="text-sm font-medium text-ink">
                    #{variation.variationNumber} — {variation.title}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {variation.requestedBy.firstName}{" "}
                    {variation.requestedBy.lastName}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-ink">
                    {formatCurrency(variation.costImpact)}
                  </span>
                  <StatusChip status={variation.status} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 pb-5">
            <p className="text-sm text-ink-muted">No variations yet.</p>
          </div>
        )}
      </Card>

      {/* Invoices */}
      {contract.invoices.length > 0 && (
        <Card>
          <CardHeader
            title="Invoices"
            description={`${contract.invoices.length} invoice${contract.invoices.length === 1 ? "" : "s"}`}
          />
          <div className="flex flex-col gap-2 px-5 pb-5">
            {contract.invoices.map((invoice) => (
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
                    Due: {formatDate(invoice.dueDate)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-ink">
                    {formatCurrency(invoice.claimedAmount)}
                  </span>
                  <StatusChip status={invoice.status} />
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* Documents */}
      {contract.documents.length > 0 && (
        <Card>
          <CardHeader
            title="Documents"
            description={`${contract.documents.length} document${contract.documents.length === 1 ? "" : "s"}`}
          />
          <div className="flex flex-col gap-2 px-5 pb-5">
            {contract.documents.map((doc) => (
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
    </div>
  );
}
