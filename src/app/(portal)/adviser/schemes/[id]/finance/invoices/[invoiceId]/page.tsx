import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSupplierInvoiceById } from "@/lib/queries/supplier-invoices";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { InvoiceActions } from "./invoice-actions";
import { connection } from "next/server";

function formatCurrency(value: number | string | null): string {
  const num = Number(value ?? 0);
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(num);
}

function formatDate(date: string | Date | null): string {
  if (!date) return "—";
  return new Date(String(date)).toLocaleDateString("en-AU");
}

const statusStyles: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-600",
  AWAITING_APPROVAL: "bg-amber-100 text-amber-700",
  APPROVED: "bg-blue-100 text-blue-700",
  PARTIALLY_PAID: "bg-purple-100 text-purple-700",
  PAID: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
};

const statusLabels: Record<string, string> = {
  DRAFT: "Draft",
  AWAITING_APPROVAL: "Awaiting Approval",
  APPROVED: "Approved",
  PARTIALLY_PAID: "Partially Paid",
  PAID: "Paid",
  CANCELLED: "Cancelled",
};

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-ink-muted uppercase tracking-wide">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-ink">{value || "—"}</dd>
    </div>
  );
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string; invoiceId: string }>;
}) {
  await connection();
  const { id, invoiceId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const invoice = await getSupplierInvoiceById(invoiceId);
  if (!invoice) notFound();

  const status = String(invoice.status);
  const dueDate = invoice.dueDate ? new Date(String(invoice.dueDate)) : null;
  const isOverdue =
    dueDate &&
    dueDate < new Date() &&
    status !== "PAID" &&
    status !== "CANCELLED";

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Invoice ${String(invoice.invoiceNumber ?? "")}`}
        backHref={`/adviser/schemes/${id}/finance/invoices`}
        backLabel="Invoices"
      />

      {/* Status and description header */}
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
            statusStyles[status] ?? "bg-zinc-100 text-zinc-600"
          }`}
        >
          {statusLabels[status] ?? status}
        </span>
        {isOverdue && (
          <span className="inline-flex items-center rounded-full bg-red-100 text-red-700 px-3 py-1 text-xs font-medium">
            Overdue
          </span>
        )}
      </div>

      {invoice.description && (
        <p className="text-sm text-ink-muted">
          {String(invoice.description)}
        </p>
      )}

      {/* Invoice details */}
      <Card>
        <CardHeader title="Invoice Details" />
        <dl className="grid grid-cols-1 gap-4 px-6 pb-6 sm:grid-cols-2 lg:grid-cols-3">
          <DetailItem
            label="Supplier"
            value={
              invoice.supplier
                ? String(invoice.supplier.companyName)
                : "—"
            }
          />
          <DetailItem
            label="Invoice Number"
            value={invoice.invoiceNumber ? String(invoice.invoiceNumber) : null}
          />
          <DetailItem
            label="Invoice Date"
            value={formatDate(invoice.invoiceDate)}
          />
          <DetailItem label="Due Date" value={formatDate(invoice.dueDate)} />
          <DetailItem
            label="Account Code"
            value={
              invoice.accountCode
                ? `${String(invoice.accountCode.code)} — ${String(invoice.accountCode.name)}`
                : null
            }
          />
          <DetailItem
            label="Fund"
            value={invoice.fund ? String(invoice.fund.name) : null}
          />
        </dl>
      </Card>

      {/* Financial summary */}
      <Card>
        <CardHeader title="Financial Summary" />
        <div className="px-6 pb-6">
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-ink-muted">Subtotal</span>
              <span className="text-ink">
                {formatCurrency(invoice.subtotal)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-ink-muted">GST</span>
              <span className="text-ink">
                {formatCurrency(invoice.gstAmount)}
              </span>
            </div>
            <div className="flex justify-between text-sm font-semibold border-t border-line pt-3">
              <span className="text-ink">Total Amount</span>
              <span className="text-ink">
                {formatCurrency(invoice.totalAmount)}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Actions */}
      {status !== "PAID" && status !== "CANCELLED" && (
        <Card>
          <CardHeader title="Actions" />
          <div className="px-6 pb-6">
            <InvoiceActions
              schemeId={id}
              invoiceId={invoiceId}
              currentStatus={status}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
