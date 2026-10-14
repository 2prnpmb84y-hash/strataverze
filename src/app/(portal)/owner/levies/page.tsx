import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForOwner } from "@/lib/queries/schemes";
import { getLevyItemsForLot } from "@/lib/queries/levies";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";

export default async function OwnerLeviesPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = await getSchemesForOwner(profile.id);
  if (schemes.length === 0) notFound();

  // Get the owner's lot IDs from their memberships
  const lotIds = schemes.flatMap((s) =>
    s.memberships
      .filter((m) => m.lotId)
      .map((m) => m.lotId!),
  );

  // Fetch levy items for all the owner's lots
  const allItems = await Promise.all(
    lotIds.map((lotId) => getLevyItemsForLot(lotId)),
  );
  const items = allItems.flat();

  // Group by levy
  const levyMap = new Map<
    string,
    { title: string; dueDate: string; levyType: string; status: string; items: typeof items }
  >();

  for (const item of items) {
    const levyId = item.levyId;
    if (!levyMap.has(levyId)) {
      levyMap.set(levyId, {
        title: item.levy.title,
        dueDate: String(item.levy.dueDate),
        levyType: item.levy.levyType,
        status: item.levy.status,
        items: [],
      });
    }
    levyMap.get(levyId)!.items.push(item);
  }

  const levies = Array.from(levyMap.entries())
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="My Levies"
        description="Levies and contributions due for your lots."
      />

      {levies.length === 0 ? (
        <Card>
          <div className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              No levies have been issued for your lots yet.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {levies.map((levy) => {
            const dueDate = new Date(levy.dueDate);
            const totalDue = levy.items.reduce(
              (sum, i) => sum + Number(i.amount),
              0,
            );
            const totalPaid = levy.items.reduce(
              (sum, i) => sum + Number(i.paidAmount),
              0,
            );

            const statusStyle: Record<string, string> = {
              DRAFT: "bg-gray-100 text-gray-700",
              ISSUED: "bg-blue-100 text-blue-700",
              PAID: "bg-green-100 text-green-700",
              OVERDUE: "bg-red-100 text-red-700",
            };

            return (
              <Card key={levy.id}>
                <CardHeader
                  title={levy.title}
                  description={`${levy.levyType === "ORDINARY" ? "Ordinary" : "Special"} levy · Due ${dueDate.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`}
                />
                <div className="flex items-center justify-between mb-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[levy.status] ?? "bg-gray-100 text-gray-700"}`}
                  >
                    {levy.status.charAt(0) + levy.status.slice(1).toLowerCase()}
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    ${totalDue.toLocaleString("en-AU", {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>

                {/* Per-item breakdown */}
                {levy.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg bg-muted px-4 py-3 mb-2 last:mb-0"
                  >
                    <div className="text-sm text-foreground">
                      Your contribution
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-foreground font-variant-numeric tabular-nums">
                        $
                        {Number(item.amount).toLocaleString("en-AU", {
                          minimumFractionDigits: 2,
                        })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.status === "PAID"
                          ? `Paid $${Number(item.paidAmount).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`
                          : "Unpaid"}
                      </p>
                    </div>
                  </div>
                ))}

                {totalPaid > 0 && totalPaid < totalDue && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Progress</span>
                      <span>{Math.round((totalPaid / totalDue) * 100)}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-400 rounded-full transition-all"
                        style={{
                          width: `${Math.round((totalPaid / totalDue) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
