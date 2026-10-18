import { getFinancialSuppliersForScheme } from "@/lib/queries/supplier-invoices";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default async function SuppliersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const suppliers = await getFinancialSuppliersForScheme(id);

  const activeCount = suppliers.filter(
    (s) => s.isActive !== false,
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Suppliers</h2>
          <p className="text-sm text-muted-foreground">
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
          <div className="hidden sm:grid sm:grid-cols-[1.5fr_1fr_1fr_1fr_80px] gap-4 px-6 pb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b border-border">
            <div>Company</div>
            <div>Contact</div>
            <div>ABN</div>
            <div>Email / Phone</div>
            <div className="text-right">Terms</div>
          </div>

          <div className="divide-y divide-border">
            {suppliers.map((supplier) => (
              <div
                key={String(supplier.id)}
                className="grid grid-cols-1 sm:grid-cols-[1.5fr_1fr_1fr_1fr_80px] gap-2 sm:gap-4 px-6 py-4 items-center"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate">
                    {String(supplier.companyName)}
                  </p>
                  {supplier.tradingName && (
                    <p className="text-xs text-muted-foreground truncate">
                      t/a {String(supplier.tradingName)}
                    </p>
                  )}
                </div>

                <div className="text-sm text-muted-foreground truncate">
                  {supplier.contactName
                    ? String(supplier.contactName)
                    : "—"}
                </div>

                <div className="text-sm text-muted-foreground font-mono text-xs truncate">
                  {supplier.abn ? String(supplier.abn) : "—"}
                </div>

                <div className="min-w-0 space-y-0.5">
                  {supplier.email && (
                    <p className="text-sm text-muted-foreground truncate">
                      {String(supplier.email)}
                    </p>
                  )}
                  {supplier.phone && (
                    <p className="text-xs text-muted-foreground">
                      {String(supplier.phone)}
                    </p>
                  )}
                  {!supplier.email && !supplier.phone && (
                    <p className="text-sm text-muted-foreground">—</p>
                  )}
                </div>

                <div className="text-sm text-muted-foreground text-right">
                  {String(supplier.paymentTerms ?? 30)}d
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
