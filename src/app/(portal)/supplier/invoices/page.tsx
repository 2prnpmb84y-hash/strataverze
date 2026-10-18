import { getCurrentProfile } from "@/lib/queries/profiles";
import { getInvoicesBySupplier } from "@/lib/queries/supplier";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { connection } from "next/server";

const statusConfig: Record<string, { label: string; className: string }> = {
  SUBMITTED: { label: "Submitted", className: "bg-gold-100 text-gold-500" },
  APPROVED: { label: "Approved", className: "bg-mint-soft text-turquoise" },
  PAID: { label: "Paid", className: "bg-success/10 text-success" },
  DISPUTED: { label: "Disputed", className: "bg-danger/10 text-danger" },
  CANCELLED: { label: "Cancelled", className: "bg-muted text-ink-muted" },
};

export default async function SupplierInvoicesPage() {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const invoices = await getInvoicesBySupplier(profile.id);

  const submitted = invoices.filter((inv) => inv.status === "SUBMITTED");
  const approved = invoices.filter((inv) => inv.status === "APPROVED");
  const paid = invoices.filter((inv) => inv.status === "PAID");

  const totalOutstanding = [...submitted, ...approved].reduce(
    (sum, inv) => sum + Number(inv.totalAmount),
    0,
  );
  const totalPaid = paid.reduce(
    (sum, inv) => sum + Number(inv.totalAmount),
    0,
  );

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold font-heading text-ink mb-1">
        Invoices
      </h1>
      <p className="text-sm text-ink-muted mb-8">
        Track your submitted invoices and payment status.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard
          label="Outstanding"
          value={`$${totalOutstanding.toLocaleString("en-AU", { minimumFractionDigits: 2 })}`}
          accent={totalOutstanding > 0 ? "bg-warning" : "bg-supplier"}
        />
        <StatCard
          label="Total Paid"
          value={`$${totalPaid.toLocaleString("en-AU", { minimumFractionDigits: 2 })}`}
          accent="bg-success"
        />
        <StatCard
          label="Total Invoices"
          value={invoices.length}
          accent="bg-supplier"
        />
      </div>

      {invoices.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-muted">
            You have not submitted any invoices yet. Complete awarded work
            orders first, then submit your invoice.
          </p>
        </Card>
      ) : (
        <Card>
          <CardHeader title="All Invoices" />
          <div className="flex flex-col gap-2">
            {invoices.map((inv) => {
              const status = statusConfig[inv.status] ?? statusConfig.SUBMITTED;

              return (
                <div
                  key={inv.id}
                  className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {inv.invoiceNumber}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {inv.workOrder?.title} · {inv.scheme?.name}
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center gap-3">
                    <span className="text-sm font-medium text-ink">
                      ${Number(inv.totalAmount).toLocaleString("en-AU", {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}>
                      {status.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
