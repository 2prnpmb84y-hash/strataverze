import Link from "next/link";
import { getFinancialDocumentsForScheme, getUnreviewedDocuments } from "@/lib/queries/financial-documents";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";

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
  return new Date(String(date)).toLocaleDateString("en-AU");
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function FinanceDocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    type?: string;
    status?: string;
    verification?: string;
  }>;
}) {
  const { id } = await params;
  const { type, status, verification } = await searchParams;

  const [documents, unreviewedDocs] = await Promise.all([
    getFinancialDocumentsForScheme(id, {
      documentType: type || undefined,
      documentStatus: status || undefined,
      verificationStatus: verification || undefined,
    }),
    getUnreviewedDocuments(id),
  ]);

  const totalCount = documents.length;
  const pendingReviewCount = unreviewedDocs.length;
  const verifiedCount = documents.filter(
    (d) => d.verificationStatus === "VERIFIED",
  ).length;

  const basePath = `/adviser/schemes/${id}/finance/documents`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">
          Financial Documents
        </h2>
        <Button variant="primary" href={`${basePath}/upload`}>
          Upload Document
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Total Documents"
          value={String(totalCount)}
          accent="bg-blue-500"
        />
        <StatCard
          label="Pending Review"
          value={String(pendingReviewCount)}
          accent={pendingReviewCount > 0 ? "bg-amber-500" : "bg-green-500"}
        />
        <StatCard
          label="Verified"
          value={String(verifiedCount)}
          accent="bg-green-500"
        />
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap items-center gap-3 px-6 py-4">
          <span className="text-sm font-medium text-muted-foreground">
            Filter:
          </span>
          <FilterLink
            href={basePath}
            label="All"
            active={!type && !status && !verification}
          />
          <FilterLink
            href={`${basePath}?verification=PENDING`}
            label="Pending Review"
            active={verification === "PENDING"}
          />
          <FilterLink
            href={`${basePath}?verification=VERIFIED`}
            label="Verified"
            active={verification === "VERIFIED"}
          />
          <FilterLink
            href={`${basePath}?verification=FLAGGED`}
            label="Flagged"
            active={verification === "FLAGGED"}
          />
          <FilterLink
            href={`${basePath}?status=REJECTED`}
            label="Rejected"
            active={status === "REJECTED"}
          />
        </div>
      </Card>

      {documents.length === 0 ? (
        <EmptyState
          title="No documents found"
          description={
            type || status || verification
              ? "No documents match the selected filters. Try adjusting your filters or upload a new document."
              : "Financial documents for this scheme will appear here once uploaded."
          }
          actionLabel="Upload Document"
          actionHref={`${basePath}/upload`}
        />
      ) : (
        <Card>
          <CardHeader title="Documents" />
          <div className="divide-y divide-border">
            {documents.map((doc) => (
              <Link
                key={doc.id}
                href={`${basePath}/${doc.id}`}
                className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-muted/50 transition-colors"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {String(doc.fileName)}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[doc.documentStatus] ?? "bg-zinc-100 text-zinc-600"}`}
                    >
                      {statusLabels[doc.documentStatus] ?? doc.documentStatus}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${verificationStyles[doc.verificationStatus] ?? "bg-zinc-100 text-zinc-600"}`}
                    >
                      {verificationLabels[doc.verificationStatus] ?? doc.verificationStatus}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>
                      {docTypeLabels[doc.documentType] ?? doc.documentType}
                    </span>
                    <span>Uploaded: {formatDate(doc.uploadedAt)}</span>
                    <span>{formatFileSize(doc.fileSize)}</span>
                    {doc.lot && (
                      <span>Lot {String(doc.lot.lotNumber)}</span>
                    )}
                    {doc.supplier && (
                      <span>
                        {String(doc.supplier.tradingName || doc.supplier.companyName)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <span className="text-xs text-muted-foreground">
                    {String(doc.mimeType).split("/")[1]?.toUpperCase() ?? "FILE"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function FilterLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-primary-100 text-primary-700"
          : "bg-muted text-muted-foreground hover:bg-muted/80"
      }`}
    >
      {label}
    </Link>
  );
}
