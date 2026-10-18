import Link from "next/link";
import { getCurrentProfile } from "@/lib/queries/profiles";
import {
  getOpenQuoteRequests,
  getQuotesBySupplier,
  getWorkOrdersForSupplier,
  getInvoicesBySupplier,
} from "@/lib/queries/supplier";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader } from "@/components/ui/card";
import { connection } from "next/server";

export default async function SupplierDashboard() {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const [openRequests, myQuotes, workOrders, invoices] = await Promise.all([
    getOpenQuoteRequests(profile.id),
    getQuotesBySupplier(profile.id),
    getWorkOrdersForSupplier(profile.id),
    getInvoicesBySupplier(profile.id),
  ]);

  const activeWorkOrders = workOrders.filter(
    (wo) => wo.status === "AWARDED" || wo.status === "IN_PROGRESS",
  );
  const pendingInvoices = invoices.filter(
    (inv) => inv.status === "SUBMITTED",
  );
  const pendingQuotes = myQuotes.filter(
    (q) => q.status === "SUBMITTED",
  );

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold font-heading text-foreground mb-1">
        Supplier Dashboard
      </h1>
      <p className="text-sm text-muted-foreground mb-8">
        Browse quote requests, manage your work orders, and track invoices.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Open Requests"
          value={openRequests.length}
          accent="bg-supplier"
        />
        <StatCard
          label="Pending Quotes"
          value={pendingQuotes.length}
          accent="bg-supplier"
        />
        <StatCard
          label="Active Jobs"
          value={activeWorkOrders.length}
          accent="bg-supplier"
        />
        <StatCard
          label="Unpaid Invoices"
          value={pendingInvoices.length}
          accent={pendingInvoices.length > 0 ? "bg-warning" : "bg-supplier"}
        />
      </div>

      {/* Recent open quote requests */}
      <Card className="mt-8">
        <CardHeader
          title="Latest Quote Requests"
          action={
            <Link
              href="/supplier/quotes"
              className="text-xs font-medium text-supplier hover:underline"
            >
              View all
            </Link>
          }
        />
        {openRequests.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No open quote requests at the moment. Check back soon.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {openRequests.slice(0, 5).map((qr) => (
              <Link
                key={qr.id}
                href={`/supplier/quotes/${qr.id}`}
                className="flex items-center justify-between rounded-lg bg-muted px-4 py-3 hover:bg-muted/70 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {qr.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {qr.category}
                    {qr.budget && ` · ${qr.budget}`}
                    {" · "}
                    {qr.quotes?.length ?? 0} quote
                    {(qr.quotes?.length ?? 0) === 1 ? "" : "s"} submitted
                  </p>
                </div>
                <span className="shrink-0 inline-flex items-center rounded-full bg-supplier/10 px-2.5 py-0.5 text-xs font-medium text-supplier">
                  {qr.urgency}
                </span>
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* Active work orders */}
      {activeWorkOrders.length > 0 && (
        <Card className="mt-6">
          <CardHeader
            title="Active Jobs"
            action={
              <Link
                href="/supplier/work-orders"
                className="text-xs font-medium text-supplier hover:underline"
              >
                View all
              </Link>
            }
          />
          <div className="flex flex-col gap-2">
            {activeWorkOrders.slice(0, 5).map((wo) => (
              <Link
                key={wo.id}
                href={`/supplier/work-orders/${wo.id}`}
                className="flex items-center justify-between rounded-lg bg-muted px-4 py-3 hover:bg-muted/70 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {wo.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {wo.scheme?.name}
                  </p>
                </div>
                <span
                  className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    wo.status === "IN_PROGRESS"
                      ? "bg-primary-100 text-primary-500"
                      : "bg-gold-100 text-gold-500"
                  }`}
                >
                  {wo.status === "IN_PROGRESS" ? "In Progress" : "Awarded"}
                </span>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
