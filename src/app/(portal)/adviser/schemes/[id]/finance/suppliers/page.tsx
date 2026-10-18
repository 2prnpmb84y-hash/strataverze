import Link from "next/link";
import { getFinancialSuppliersForScheme } from "@/lib/queries/supplier-invoices";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { connection } from "next/server";

export default async function SuppliersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const suppliers = await getFinancialSuppliersForScheme(id);

  const activeCount = suppliers.filter(
    (s) => s.isActive !== false,
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">Suppliers</h2>
          <p className="text-sm text-ink-muted">
            {activeCount} active supplier{activeCount !== 1 ? "s" : ""}
          </p>
        </div>
        <Button
          variant="primary"
          href={`/adviser/schemes/${id}/finance/suppliers/new`}
        >
          Add Supplier
        </Button>
      </div>

      {suppliers.length === 0 ? (
        <EmptyState
          title="No Suppliers"
          description="Add suppliers to track invoices and payments for this scheme."
          actionLabel="Add Supplier"
          actionHref={`/adviser/schemes/${id}/finance/suppliers/new`}
        />
      ) : (
        <Card>
          <CardHeader title="All Suppliers" />

          {/* Table header */}
          <div className="hidden sm:grid sm:grid-cols-[1.5fr_1fr_1fr_1fr_80px] gap-4 px-6 pb-2 text-xs font-medium text-ink-muted uppercase tracking-wide border-b border-line">
            <div>Company</div>
            <div>Contact</div>
            <div>ABN</div>
            <div>Email / Phone</div>
            <div className="text-right">Terms</div>
          </div>

          <div className="divide-y divide-line">
            {suppliers.map((supplier) => (
              <Link
                key={String(supplier.id)}
                href={`/adviser/schemes/${id}/finance/suppliers/${String(supplier.id)}`}
                className="grid grid-cols-1 sm:grid-cols-[1.5fr_1fr_1fr_1fr_80px] gap-2 sm:gap-4 px-6 py-4 items-center hover:bg-muted/50 transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-medium text-ink truncate">
                    {String(supplier.companyName)}
                  </p>
                  {supplier.tradingName && (
                    <p className="text-xs text-ink-muted truncate">
                      t/a {String(supplier.tradingName)}
                    </p>
                  )}
                </div>

                <div className="text-sm text-ink-muted truncate">
                  {supplier.contactName
                    ? String(supplier.contactName)
                    : "—"}
                </div>

                <div className="text-sm text-ink-muted font-mono text-xs truncate">
                  {supplier.abn ? String(supplier.abn) : "—"}
                </div>

                <div className="min-w-0 space-y-0.5">
                  {supplier.email && (
                    <p className="text-sm text-ink-muted truncate">
                      {String(supplier.email)}
                    </p>
                  )}
                  {supplier.phone && (
                    <p className="text-xs text-ink-muted">
                      {String(supplier.phone)}
                    </p>
                  )}
                  {!supplier.email && !supplier.phone && (
                    <p className="text-sm text-ink-muted">—</p>
                  )}
                </div>

                <div className="text-sm text-ink-muted text-right">
                  {String(supplier.paymentTerms ?? 30)}d
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
