import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import type { getComplianceForScheme } from "@/lib/queries/compliance";

/** Moved unchanged from the scheme main page so it can also back its section page. */
export function ComplianceCard({
  id, complianceItems,
}: {
  id: string;
  complianceItems: Awaited<ReturnType<typeof getComplianceForScheme>>;
}) {
  return (
    <Card className="mb-6">
      <CardHeader
        title="Compliance"
        description={
          complianceItems.length === 0
            ? "No compliance items tracked yet."
            : `${complianceItems.length} compliance item${complianceItems.length === 1 ? "" : "s"} tracked.`
        }
        action={
          <Button href={`/adviser/schemes/${id}/compliance/new`} variant="secondary">
            Add Item
          </Button>
        }
      />
      {complianceItems.length > 0 ? (
        <div className="flex flex-col gap-2">
          {complianceItems.map((item) => {
            const compStatusStyle: Record<string, string> = {
              PENDING: "bg-yellow-100 text-yellow-700",
              COMPLIANT: "bg-green-100 text-green-700",
              NON_COMPLIANT: "bg-red-100 text-red-700",
              EXPIRED: "bg-gray-100 text-gray-700",
            };

            const compCategoryLabels: Record<string, string> = {
              INSURANCE: "Insurance",
              FIRE_SAFETY: "Fire Safety",
              OHS: "OH&S",
              BUILDING: "Building",
              OTHER: "Other",
            };

            return (
              <Link
                key={item.id}
                href={`/adviser/schemes/${id}/compliance/${item.id}`}
                className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted px-4 py-3 hover:bg-muted/70 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-ink">
                    {item.title}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {compCategoryLabels[item.category] ?? item.category}
                    {item.dueDate &&
                      ` · Due ${new Date(String(item.dueDate)).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${compStatusStyle[item.status] ?? "bg-gray-100 text-gray-700"}`}
                >
                  {item.status.replace("_", " ")}
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">
          Track insurance, fire safety, OH&S and other compliance obligations.
        </p>
      )}
    </Card>
  );
}
