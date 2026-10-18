import Link from "next/link";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getWorkOrdersForSupplier } from "@/lib/queries/supplier";
import { Card, CardHeader } from "@/components/ui/card";
import { connection } from "next/server";

const statusConfig: Record<string, { label: string; className: string }> = {
  AWARDED: { label: "Awarded", className: "bg-gold-100 text-gold-500" },
  IN_PROGRESS: { label: "In Progress", className: "bg-mint-soft text-turquoise" },
  COMPLETED: { label: "Completed", className: "bg-success/10 text-success" },
  CANCELLED: { label: "Cancelled", className: "bg-muted text-ink-muted" },
};

export default async function SupplierWorkOrdersPage() {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const workOrders = await getWorkOrdersForSupplier(profile.id);

  const active = workOrders.filter(
    (wo) => wo.status === "AWARDED" || wo.status === "IN_PROGRESS",
  );
  const completed = workOrders.filter(
    (wo) => wo.status === "COMPLETED" || wo.status === "CANCELLED",
  );

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold font-heading text-ink mb-1">
        Work Orders
      </h1>
      <p className="text-sm text-ink-muted mb-8">
        Manage work orders awarded to you.
      </p>

      {workOrders.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-muted">
            No work orders have been awarded to you yet. Submit quotes on{" "}
            <Link
              href="/supplier/quotes"
              className="text-supplier hover:underline"
            >
              open requests
            </Link>{" "}
            to win work.
          </p>
        </Card>
      ) : (
        <>
          {active.length > 0 && (
            <Card className="mb-6">
              <CardHeader title="Active" />
              <div className="flex flex-col gap-2">
                {active.map((wo) => {
                  const status = statusConfig[wo.status] ?? statusConfig.AWARDED;
                  return (
                    <div
                      key={wo.id}
                      className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-ink">
                          {wo.title}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {wo.scheme?.name}
                          {wo.priority && ` · ${wo.priority}`}
                        </p>
                      </div>
                      <span className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}>
                        {status.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {completed.length > 0 && (
            <Card>
              <CardHeader title="Completed" />
              <div className="flex flex-col gap-2">
                {completed.map((wo) => {
                  const status = statusConfig[wo.status] ?? statusConfig.COMPLETED;
                  return (
                    <div
                      key={wo.id}
                      className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-ink">
                          {wo.title}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {wo.scheme?.name}
                          {wo.completedAt &&
                            ` · Completed ${new Date(String(wo.completedAt)).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`}
                        </p>
                      </div>
                      <span className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}>
                        {status.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
