import { notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import { getFinancialDocumentById } from "@/lib/queries/financial-documents";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { DocumentActions } from "./document-actions";
import { connection } from "next/server";
import { formatLotLabel } from "@/lib/format";

const docTypeLabels: Record<string, string> = {
  RECEIPT: "Receipt",
  INVOICE: "Invoice",
  BANK_STATEMENT: "Bank Statement",
  LEVY_NOTICE: "Levy Notice",
  INSURANCE: "Insurance",
  CONTRACTOR_QUOTE: "Contractor Quote",
  TAX_DOCUMENT: "Tax Document",
  OTHER: "Other",
};

const statusStyles: Record<string, string> = {
  UPLOADED: "bg-blue-100 text-blue-700",
  REVIEWED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  ARCHIVED: "bg-zinc-100 text-zinc-600",
};

const statusLabels: Record<string, string> = {
  UPLOADED: "Uploaded",
  REVIEWED: "Reviewed",
  REJECTED: "Rejected",
  ARCHIVED: "Archived",
};

const verificationStyles: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  VERIFIED: "bg-green-100 text-green-700",
  FLAGGED: "bg-red-100 text-red-700",
};

const verificationLabels: Record<string, string> = {
  PENDING: "Pending",
  VERIFIED: "Verified",
  FLAGGED: "Flagged",
};

function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  return new Date(String(date)).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string; docId: string }>;
}) {
  await connection();
  const { id, docId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const doc = await getFinancialDocumentById(docId);
  if (!doc || doc.schemeId !== id) notFound();

  const basePath = `/adviser/schemes/${id}/finance/documents`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={String(doc.fileName)}
        description={docTypeLabels[doc.documentType] ?? doc.documentType}
        backHref={basePath}
        backLabel="Documents"
      />

      {/* Status badges */}
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${statusStyles[doc.documentStatus] ?? "bg-zinc-100 text-zinc-600"}`}
        >
          {statusLabels[doc.documentStatus] ?? doc.documentStatus}
        </span>
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${verificationStyles[doc.verificationStatus] ?? "bg-zinc-100 text-zinc-600"}`}
        >
          {verificationLabels[doc.verificationStatus] ?? doc.verificationStatus}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Document details */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader title="Document Details" />
            <div className="px-6 pb-6">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                <DetailItem label="Document Type">
                  {docTypeLabels[doc.documentType] ?? doc.documentType}
                </DetailItem>
                <DetailItem label="File Name">
                  {String(doc.fileName)}
                </DetailItem>
                <DetailItem label="File Size">
                  {formatFileSize(doc.fileSize)}
                </DetailItem>
                <DetailItem label="File Type">
                  {String(doc.mimeType)}
                </DetailItem>
                <DetailItem label="Uploaded">
                  {formatDate(doc.uploadedAt)}
                </DetailItem>
                {doc.documentDate && (
                  <DetailItem label="Document Date">
                    {formatDate(doc.documentDate)}
                  </DetailItem>
                )}
                {doc.amount && (
                  <DetailItem label="Amount">
                    ${Number(doc.amount).toLocaleString("en-AU", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </DetailItem>
                )}
                {doc.payerName && (
                  <DetailItem label="Payer Name">
                    {String(doc.payerName)}
                  </DetailItem>
                )}
                {doc.payeeReference && (
                  <DetailItem label="Payee / Reference">
                    {String(doc.payeeReference)}
                  </DetailItem>
                )}
              </dl>
            </div>
          </Card>

          {/* Linked records */}
          <Card>
            <CardHeader
              title="Linked Records"
              description="Financial records associated with this document."
            />
            <div className="px-6 pb-6 space-y-3">
              {doc.lot && (
                <LinkedRecord
                  label="Lot"
                  value={`${formatLotLabel(doc.lot.lotNumber)}${doc.lot.unitNumber ? ` (Unit ${String(doc.lot.unitNumber)})` : ""}`}
                />
              )}
              {doc.supplier && (
                <LinkedRecord
                  label="Supplier"
                  value={String(
                    doc.supplier.tradingName || doc.supplier.companyName,
                  )}
                  href={`/adviser/schemes/${id}/finance/suppliers/${doc.supplier.id}`}
                />
              )}
              {doc.supplierInvoice && (
                <LinkedRecord
                  label="Supplier Invoice"
                  value={`Invoice ${String(doc.supplierInvoice.invoiceNumber)}`}
                  href={`/adviser/schemes/${id}/finance/invoices/${doc.supplierInvoice.id}`}
                />
              )}
              {doc.levyNotice && (
                <LinkedRecord
                  label="Levy Notice"
                  value={`Notice ${String(doc.levyNotice.noticeNumber)}`}
                />
              )}
              {doc.bankTransaction && (
                <LinkedRecord
                  label="Bank Transaction"
                  value={String(doc.bankTransaction.description)}
                />
              )}
              {!doc.lot &&
                !doc.supplier &&
                !doc.supplierInvoice &&
                !doc.levyNotice &&
                !doc.bankTransaction && (
                  <p className="text-sm text-ink-muted">
                    No linked records. This document can be linked to a lot,
                    supplier, invoice, levy notice, or bank transaction.
                  </p>
                )}
            </div>
          </Card>

          {/* Review information */}
          {doc.reviewedAt && (
            <Card>
              <CardHeader title="Review" />
              <div className="px-6 pb-6">
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                  <DetailItem label="Reviewed">
                    {formatDate(doc.reviewedAt)}
                  </DetailItem>
                  {doc.reviewNotes && (
                    <div className="sm:col-span-2">
                      <DetailItem label="Review Notes">
                        {String(doc.reviewNotes)}
                      </DetailItem>
                    </div>
                  )}
                </dl>
              </div>
            </Card>
          )}
        </div>

        {/* Actions sidebar */}
        <div className="space-y-6">
          <DocumentActions
            schemeId={id}
            documentId={docId}
            currentStatus={doc.documentStatus}
            currentVerification={doc.verificationStatus}
          />
        </div>
      </div>
    </div>
  );
}

function DetailItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-ink">{children}</dd>
    </div>
  );
}

function LinkedRecord({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted px-4 py-3">
      <div>
        <p className="text-xs font-medium text-ink-muted uppercase tracking-wide">
          {label}
        </p>
        <p className="text-sm font-medium text-ink mt-0.5">{value}</p>
      </div>
      {href && (
        <Link
          href={href}
          className="text-xs font-medium text-turquoise hover:text-turquoise/80"
        >
          View
        </Link>
      )}
    </div>
  );
}
