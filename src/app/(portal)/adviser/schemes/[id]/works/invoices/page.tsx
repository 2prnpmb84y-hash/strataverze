import Link from "next/link";
import { connection } from "next/server";
import { requirePageAccess } from "@/lib/auth/require-access";
import { getSchemeById } from "@/lib/queries/schemes";
import { getWorksInvoicesForScheme } from "@/lib/queries/works";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { StatusChip } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

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

const statusLabel: Record<string, string> = {
  SUBMITTED: "Submitted",
  UNDER_ASSESSMENT: "Under Assessment",
  FURTHER_INFORMATION: "Further Information",
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

export default async function InvoicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  await connection();
  const { id } = await params;
  const { status } = await searchParams;

  // Role check on this scheme (SEC-004 / H5): a page is a privileged read.
  const access = await requirePageAccess(id, "works.read");
  if (!access) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const invoices = await getWorksInvoicesForScheme(id, { status });

  // Check overdue
  const now = new Date();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Works Invoices"
        description="Manage invoice assessment, approval, and payment"
        backHref={`/adviser/schemes/${id}/works`}
        backLabel="Works"
        action={
          <Button href={`/adviser/schemes/${id}/works/invoices/new`}>
            Submit Invoice
          </Button>
        }
      />

      {/* Filter bar */}
      <Card>
        <form className="flex flex-wrap items-end gap-3 p-4">
          <div>
            <label
              htmlFor="status"
              className="block text-xs font-medium text-ink-muted mb-1"
            >
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={status ?? ""}
              className="rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-turquoise w-48"
            >
              <option value="">All statuses</option>
              {Object.entries(statusLabel).map(([val, label]) => (
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

      {/* Invoices list */}
      {invoices.length === 0 ? (
        <EmptyState
          icon={
            <svg
              width="48"
              height="48"
              viewBox="0 0 48 48"
              fill="none"
              aria-hidden="true"
            >
              <rect
                x="10"
                y="6"
                width="28"
                height="36"
                rx="3"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M18 16h12M18 22h12M18 28h8"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <circle cx="34" cy="34" r="8" fill="var(--bg, white)" stroke="currentColor" strokeWidth="2" />
              <path d="M34 30v8M30 34h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          }
          title="No invoices found"
          description="Invoices will appear here once contractors submit them for works."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {invoices.map((invoice) => {
            const isOverdue =
              !["PAID", "RECONCILED", "VOIDED", "DUPLICATE"].includes(
                invoice.status,
              ) && new Date(invoice.dueDate) < now;

            return (
              <Link
                key={invoice.id}
                href={`/adviser/schemes/${id}/works/invoices/${invoice.id}`}
                className="flex items-center justify-between rounded-[var(--radius-card)] bg-white border border-line px-5 py-4 hover:border-turquoise/40 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-ink-muted">
                      {invoice.invoiceNumber}
                    </span>
                    <StatusChip
                      status={
                        statusLabel[invoice.status] ?? invoice.status
                      }
                    />
                    {isOverdue && (
                      <span className="inline-flex items-center rounded-full h-[22px] px-2.5 text-[11px] font-medium bg-red-100 text-red-700">
                        Overdue
                      </span>
                    )}
                    {invoice.isDuplicate && (
                      <span className="inline-flex items-center rounded-full h-[22px] px-2.5 text-[11px] font-medium bg-amber-100 text-amber-700">
                        Duplicate
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-ink-muted">
                    <span>
                      {invoice.contractorBusiness.companyName}
                    </span>
                    <span>Date: {formatDate(invoice.invoiceDate)}</span>
                    <span>Due: {formatDate(invoice.dueDate)}</span>
                  </div>
                </div>
                <div className="shrink-0 ml-4 text-right">
                  <p className="text-sm font-semibold text-ink">
                    {formatCurrency(invoice.claimedAmount)}
                  </p>
                  {invoice.approvedAmount && (
                    <p className="text-xs text-green-600">
                      Approved: {formatCurrency(invoice.approvedAmount)}
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
