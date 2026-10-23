import Link from "next/link";
import { getSupplierInvoicesForScheme } from "@/lib/queries/supplier-invoices";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { connection } from "next/server";
import { requirePageAccess } from "@/lib/auth/require-access";

function formatCurrency(value: number | string | null): string {
  const num = Number(value ?? 0);
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(num);
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

function formatDate(date: string | null): string {
  if (!date) return "—";
  return new Date(String(date)).toLocaleDateString("en-AU");
}

function isOverdue(status: string, dueDate: string | null): boolean {
  if (!dueDate) return false;
  if (status !== "APPROVED" && status !== "PARTIALLY_PAID") return false;
  return new Date(String(dueDate)) < new Date();
}

export default async function SupplierInvoicesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  // Adviser finance: checked here as well as in the layout.
  if (!(await requirePageAccess(id, "finance.write"))) return null;
  const invoices = await getSupplierInvoicesForScheme(id);

  const totalOutstanding = invoices.reduce(
    (sum, inv) => sum + Number(inv.balanceOutstanding ?? 0),
    0,
  );
  const totalPaid = invoices.reduce(
    (sum, inv) => sum + Number(inv.amountPaid ?? 0),
    0,
  );
  const pendingApprovalCount = invoices.filter(
    (inv) => inv.status === "AWAITING_APPROVAL",
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          Supplier Invoices
        </h1>
        <Button variant="primary" href={`/adviser/schemes/${id}/finance/invoices/new`}>
          New Invoice
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Total Outstanding"
          value={formatCurrency(totalOutstanding)}
          accent="bg-amber-500"
        />
        <StatCard
          label="Total Paid"
          value={formatCurrency(totalPaid)}
          accent="bg-green-500"
        />
        <StatCard
          label="Pending Approval"
          value={String(pendingApprovalCount)}
          accent="bg-blue-500"
        />
      </div>

      {invoices.length === 0 ? (
        <EmptyState
          icon="file-text"
          title="No invoices yet"
          description="Supplier invoices for this scheme will appear here once created."
          actionLabel="New Invoice"
          actionHref={`/adviser/schemes/${id}/finance/invoices/new`}
        />
      ) : (
        <Card>
          <CardHeader title="All Invoices" />
          <div className="divide-y divide-line">
            {invoices.map((invoice) => (
              <Link
                key={invoice.id}
                href={`/adviser/schemes/${id}/finance/invoices/${invoice.id}`}
                className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-muted/50 transition-colors"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {invoice.invoiceNumber}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[invoice.status] ?? "bg-zinc-100 text-zinc-600"}`}
                    >
                      {statusLabels[invoice.status] ?? invoice.status}
                    </span>
                    {isOverdue(invoice.status, invoice.dueDate) && (
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        Overdue
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-ink-muted">
                    {invoice.supplier?.tradingName ||
                      invoice.supplier?.companyName ||
                      "Unknown Supplier"}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-ink-muted">
                    <span>Invoiced: {formatDate(invoice.invoiceDate)}</span>
                    <span>Due: {formatDate(invoice.dueDate)}</span>
                    {invoice.fund && (
                      <span>Fund: {invoice.fund.name}</span>
                    )}
                    {invoice.accountCode && (
                      <span>
                        {invoice.accountCode.code} —{" "}
                        {invoice.accountCode.name}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0 text-right space-y-1">
                  <p className="font-medium">
                    {formatCurrency(invoice.totalAmount)}
                  </p>
                  {Number(invoice.balanceOutstanding ?? 0) > 0 && (
                    <p className="text-sm text-ink-muted">
                      Outstanding: {formatCurrency(invoice.balanceOutstanding)}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
