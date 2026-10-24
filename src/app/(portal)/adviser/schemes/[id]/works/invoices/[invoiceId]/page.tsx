import { connection } from "next/server";
import { notFound } from "next/navigation";
import { requirePageAccess } from "@/lib/auth/require-access";
import { getSchemeById } from "@/lib/queries/schemes";
import { getWorksInvoiceById } from "@/lib/queries/works";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { getInvoiceControlView } from "@/lib/finance/control-view";
import { ApprovalPanel } from "@/components/finance/approval-panel";
import { ApproveButton } from "@/components/finance/approve-button";
import { approveWorksInvoiceAction } from "@/lib/actions/works";

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
  SUBMITTED: "Submitted",
  UNDER_ASSESSMENT: "Under Assessment",
  FURTHER_INFORMATION: "Further Information",
  AWAITING_AUTHORISATION: "Awaiting Approval",
  APPROVED: "Approved",
  PARTIALLY_APPROVED: "Partially Approved",
  REJECTED: "Rejected",
  PAYMENT_INSTRUCTED: "Payment Instructed",
  PAID: "Paid",
  RECONCILED: "Reconciled",
  DISPUTED: "Disputed",
  DUPLICATE: "Duplicate",
  VOIDED: "Voided",
};

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string; invoiceId: string }>;
}) {
  await connection();
  const { id, invoiceId } = await params;

  // Role check on this scheme (SEC-004 / H5): a page is a privileged read.
  const access = await requirePageAccess(id, "works.read");
  if (!access) return null;
  const { profile } = access;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const invoice = await getWorksInvoiceById(invoiceId);
  if (!invoice || invoice.schemeId !== id) notFound();

  const controls = ["AWAITING_AUTHORISATION", "APPROVED", "PAYMENT_INSTRUCTED", "PAID"].includes(invoice.status)
    ? await getInvoiceControlView(id, { worksInvoiceId: invoiceId }, profile.id)
    : null;
  async function approveAction() {
    "use server";
    return approveWorksInvoiceAction(id, invoiceId);
  }

  const isOverdue =
    !["PAID", "RECONCILED", "VOIDED", "DUPLICATE"].includes(invoice.status) &&
    new Date(invoice.dueDate) < new Date();

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title={`Invoice ${invoice.invoiceNumber}`}
        description={`From ${invoice.contractorBusiness.companyName}`}
        backHref={`/adviser/schemes/${id}/works/invoices`}
        backLabel="Invoices"
        action={
          <div className="flex items-center gap-2">
            {invoice.status === "SUBMITTED" && (
              <Button
                href={`/adviser/schemes/${id}/works/invoices/${invoiceId}/assess`}
              >
                Assess Invoice
              </Button>
            )}
            {(invoice.status === "APPROVED" || invoice.status === "PARTIALLY_APPROVED") && (
              <Button
                href={`/adviser/schemes/${id}/works/invoices/${invoiceId}/payment`}
              >
                Authorise Payment
              </Button>
            )}
            {invoice.status === "PAYMENT_INSTRUCTED" && (
              <Button
                href={`/adviser/schemes/${id}/works/invoices/${invoiceId}/record-payment`}
              >
                Record Payment
              </Button>
            )}
            {invoice.status === "SUBMITTED" && (
              <Button
                href={`/adviser/schemes/${id}/works/invoices/${invoiceId}/edit`}
                variant="secondary"
              >
                Edit
              </Button>
            )}
          </div>
        }
      />

      {controls && (
        <Card>
          <CardHeader title="Approval for payment" />
          <div className="px-5 pb-5 space-y-4">
            <ApprovalPanel view={controls} status={invoice.status} />
            {invoice.status === "AWAITING_AUTHORISATION" && (
              <ApproveButton
                action={approveAction}
                blockedReason={controls.approve.result === "blocked" ? controls.approve.reason : null}
              />
            )}
          </div>
        </Card>
      )}

      <div className="flex items-center gap-3">
        <StatusChip
          status={statusLabel[invoice.status] ?? invoice.status}
        />
        {isOverdue && (
          <span className="inline-flex items-center rounded-full h-[22px] px-2.5 text-[11px] font-medium bg-red-100 text-red-700">
            Overdue
          </span>
        )}
        {invoice.isDuplicate && (
          <span className="inline-flex items-center rounded-full h-[22px] px-2.5 text-[11px] font-medium bg-amber-100 text-amber-700">
            Potential Duplicate
          </span>
        )}
        {invoice.isStatutoryClaim && (
          <span className="inline-flex items-center rounded-full h-[22px] px-2.5 text-[11px] font-medium bg-blue-100 text-blue-700">
            Statutory Claim
          </span>
        )}
        {invoice.bankDetailChangeFlag && (
          <span className="inline-flex items-center rounded-full h-[22px] px-2.5 text-[11px] font-medium bg-orange-100 text-orange-700">
            Bank Details Changed
          </span>
        )}
      </div>

      {/* Invoice amounts */}
      <Card>
        <CardHeader title="Invoice Amounts" />
        <div className="px-5 pb-5">
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-4">
            <div>
              <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                Claimed Amount
              </dt>
              <dd className="text-lg font-semibold text-ink">
                {formatCurrency(invoice.claimedAmount)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                GST Amount
              </dt>
              <dd className="text-lg font-semibold text-ink">
                {formatCurrency(invoice.gstAmount)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                Paid Amount
              </dt>
              <dd className="text-lg font-semibold text-green-600">
                {formatCurrency(invoice.paidAmount)}
              </dd>
            </div>
            {invoice.assessedAmount && (
              <div>
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Assessed Amount
                </dt>
                <dd className="text-sm text-ink">
                  {formatCurrency(invoice.assessedAmount)}
                </dd>
              </div>
            )}
            {invoice.approvedAmount && (
              <div>
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Approved Amount
                </dt>
                <dd className="text-sm text-ink">
                  {formatCurrency(invoice.approvedAmount)}
                </dd>
              </div>
            )}
            {invoice.scheduledAmount && (
              <div>
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Scheduled Amount
                </dt>
                <dd className="text-sm text-ink">
                  {formatCurrency(invoice.scheduledAmount)}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </Card>

      {/* Invoice details */}
      <Card>
        <CardHeader title="Invoice Details" />
        <div className="px-5 pb-5">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                Invoice Date
              </dt>
              <dd className="text-sm text-ink">
                {formatDate(invoice.invoiceDate)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                Date Received
              </dt>
              <dd className="text-sm text-ink">
                {formatDate(invoice.dateReceived)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                Due Date
              </dt>
              <dd className={`text-sm ${isOverdue ? "text-red-600 font-medium" : "text-ink"}`}>
                {formatDate(invoice.dueDate)}
              </dd>
            </div>
            {invoice.responseDeadline && (
              <div>
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Response Deadline
                </dt>
                <dd className="text-sm text-ink">
                  {formatDateTime(invoice.responseDeadline)}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                Submitted By
              </dt>
              <dd className="text-sm text-ink">
                {invoice.submittedBy.firstName} {invoice.submittedBy.lastName}
              </dd>
            </div>
            {invoice.assessedBy && (
              <div>
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Assessed By
                </dt>
                <dd className="text-sm text-ink">
                  {invoice.assessedBy.firstName} {invoice.assessedBy.lastName}
                  <span className="text-xs text-ink-muted ml-2">
                    {formatDateTime(invoice.assessedAt)}
                  </span>
                </dd>
              </div>
            )}
            {invoice.assessmentNotes && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Assessment Notes
                </dt>
                <dd className="text-sm text-ink whitespace-pre-wrap">
                  {invoice.assessmentNotes}
                </dd>
              </div>
            )}
            {invoice.differenceReasons && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                  Difference Reasons
                </dt>
                <dd className="text-sm text-ink whitespace-pre-wrap">
                  {invoice.differenceReasons}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </Card>

      {/* Linked contract */}
      {invoice.contract && (
        <Card>
          <CardHeader title="Linked Contract" />
          <div className="px-5 pb-5">
            <Link
              href={`/adviser/schemes/${id}/works/contracts/${invoice.contract.id}`}
              className="flex items-center gap-3 rounded-[var(--radius-card)] bg-muted p-4 hover:bg-muted/70 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">
                  {invoice.contract.title}
                </p>
                <p className="text-xs text-ink-muted">
                  {invoice.contract.contractNumber}
                </p>
              </div>
              <span className="text-sm text-ink">
                {formatCurrency(invoice.contract.contractValue)}
              </span>
            </Link>
          </div>
        </Card>
      )}

      {/* Payment assessments */}
      {invoice.paymentAssessments.length > 0 && (
        <Card>
          <CardHeader
            title="Payment Assessments"
            description={`${invoice.paymentAssessments.length} assessment${invoice.paymentAssessments.length === 1 ? "" : "s"}`}
          />
          <div className="flex flex-col gap-2 px-5 pb-5">
            {invoice.paymentAssessments.map((pa) => (
              <div
                key={pa.id}
                className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted p-4"
              >
                <div>
                  <p className="text-sm font-medium text-ink">
                    {pa.assessor.firstName} {pa.assessor.lastName}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {formatDateTime(pa.assessedAt)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-ink">
                    {formatCurrency(pa.assessedAmount)}
                  </p>
                  {pa.comments && (
                    <p className="text-xs text-ink-muted mt-1">{pa.comments}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Payment instructions */}
      {invoice.paymentInstructions.length > 0 && (
        <Card>
          <CardHeader
            title="Payment Instructions"
            description={`${invoice.paymentInstructions.length} instruction${invoice.paymentInstructions.length === 1 ? "" : "s"}`}
          />
          <div className="flex flex-col gap-2 px-5 pb-5">
            {invoice.paymentInstructions.map((pi) => (
              <div
                key={pi.id}
                className="rounded-[var(--radius-card)] bg-muted p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-ink">
                    {pi.beneficiary}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink">
                      {formatCurrency(pi.approvedAmount)}
                    </span>
                    <StatusChip status={pi.status} />
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-ink-muted">
                  {pi.authorisedAt && (
                    <span>Authorised: {formatDateTime(pi.authorisedAt)}</span>
                  )}
                  {pi.authorisedBy && (
                    <span>
                      Authorised by: {pi.authorisedBy.firstName}{" "}
                      {pi.authorisedBy.lastName}
                    </span>
                  )}
                </div>

                {/* Payment records under this instruction */}
                {pi.paymentRecords.length > 0 && (
                  <div className="mt-3 border-t border-line pt-3">
                    {pi.paymentRecords.map((pr) => (
                      <div
                        key={pr.id}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="text-ink-muted">
                          {pr.paymentMethod} &mdash;{" "}
                          {formatDate(pr.paymentDate)}
                          {pr.externalReference &&
                            ` (Ref: ${pr.externalReference})`}
                        </span>
                        <span className="text-ink font-medium">
                          {formatCurrency(pr.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Documents */}
      {invoice.documents.length > 0 && (
        <Card>
          <CardHeader
            title="Supporting Documents"
            description={`${invoice.documents.length} document${invoice.documents.length === 1 ? "" : "s"}`}
          />
          <div className="flex flex-col gap-2 px-5 pb-5">
            {invoice.documents.map((doc) => (
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
