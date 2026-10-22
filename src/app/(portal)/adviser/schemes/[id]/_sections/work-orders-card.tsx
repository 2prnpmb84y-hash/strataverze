import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import type { getWorkOrdersForScheme } from "@/lib/queries/work-orders";

/** Moved unchanged from the scheme main page so it can also back its section page. */
export function WorkOrdersCard({
  id, workOrders,
}: {
  id: string;
  workOrders: Awaited<ReturnType<typeof getWorkOrdersForScheme>>;
}) {
  return (
    <Card className="mb-6">
      <CardHeader
        title="Work Orders"
        description={
          workOrders.length === 0
            ? "No work orders raised yet."
            : `${workOrders.length} work order${workOrders.length === 1 ? "" : "s"} on record.`
        }
        action={
          <Button href={`/adviser/schemes/${id}/work-orders/new`} variant="secondary">
            New Work Order
          </Button>
        }
      />
      {workOrders.length > 0 ? (
        <div className="flex flex-col gap-2">
          {workOrders.map((wo) => {
            const woStatusStyle: Record<string, string> = {
              OPEN: "bg-blue-100 text-blue-700",
              IN_PROGRESS: "bg-yellow-100 text-yellow-700",
              COMPLETED: "bg-green-100 text-green-700",
              CANCELLED: "bg-gray-100 text-gray-700",
            };

            return (
              <Link
                key={wo.id}
                href={`/adviser/schemes/${id}/work-orders/${wo.id}`}
                className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted px-4 py-3 hover:bg-muted/70 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-ink">
                    {wo.title}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {wo.priority}
                    {wo.assignedTo && ` · ${wo.assignedTo}`}
                    {wo.comments.length > 0 &&
                      ` · ${wo.comments.length} comment${wo.comments.length === 1 ? "" : "s"}`}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${woStatusStyle[wo.status] ?? "bg-gray-100 text-gray-700"}`}
                >
                  {wo.status.replace("_", " ")}
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">
          Create a work order to track maintenance for this scheme.
        </p>
      )}
    </Card>
  );
}
