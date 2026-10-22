import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import type { getLeviesForScheme } from "@/lib/queries/levies";

/** Moved unchanged from the scheme main page so it can also back its section page. */
export function LeviesCard({
  id, levies, className = "mb-6",
}: {
  id: string;
  levies: Awaited<ReturnType<typeof getLeviesForScheme>>;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader
        title="Levies"
        description={
          levies.length === 0
            ? "No levies created yet."
            : `${levies.length} lev${levies.length === 1 ? "y" : "ies"} created.`
        }
        action={
          <div className="flex items-center gap-2">
            <Button href={`/adviser/schemes/${id}/levies/generate`} variant="secondary">
              Generate Levies
            </Button>
            <Button href={`/adviser/schemes/${id}/levies/new`} variant="secondary">
              Create Levy
            </Button>
          </div>
        }
      />
      {levies.length > 0 ? (
        <div className="flex flex-col gap-2">
          {levies.map((levy) => {
            const total = Number(levy.totalAmount);
            const paid = levy.items.reduce(
              (sum, item) => sum + Number(item.paidAmount),
              0,
            );
            const dueDate = new Date(String(levy.dueDate));

            const statusStyle: Record<string, string> = {
              DRAFT: "bg-gray-100 text-gray-700",
              ISSUED: "bg-blue-100 text-blue-700",
              PAID: "bg-green-100 text-green-700",
              OVERDUE: "bg-red-100 text-red-700",
            };

            return (
              <Link
                key={levy.id}
                href={`/adviser/schemes/${id}/levies/${levy.id}`}
                className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted px-4 py-3 hover:bg-muted/70 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-ink">
                    {levy.title}
                  </p>
                  <p className="text-xs text-ink-muted">
                    Due{" "}
                    {dueDate.toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {" · "}
                    ${total.toLocaleString("en-AU", {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {paid > 0 && paid < total && (
                    <span className="text-xs text-ink-muted">
                      {Math.round((paid / total) * 100)}% collected
                    </span>
                  )}
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[levy.status] ?? "bg-gray-100 text-gray-700"}`}
                  >
                    {levy.status.charAt(0) + levy.status.slice(1).toLowerCase()}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">
          Create a levy to start billing lot owners.
        </p>
      )}
    </Card>
  );
}
