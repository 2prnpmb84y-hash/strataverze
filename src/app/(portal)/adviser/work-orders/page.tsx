import Link from "next/link";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForAdviser } from "@/lib/queries/schemes";
import { getWorkOrdersForSchemes } from "@/lib/queries/work-orders";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { connection } from "next/server";

export default async function AdviserWorkOrdersPage() {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = await getSchemesForAdviser(profile.id);
  const schemeIds = schemes.map((s) => s.id);
  const schemeNames = new Map(schemes.map((s) => [s.id, s.name]));

  const workOrders = schemeIds.length > 0
    ? await getWorkOrdersForSchemes(schemeIds)
    : [];

  const open = workOrders.filter((wo) => wo.status === "OPEN");
  const inProgress = workOrders.filter((wo) => wo.status === "IN_PROGRESS");
  const completed = workOrders.filter((wo) => wo.status === "COMPLETED");

  const statusStyle: Record<string, string> = {
    OPEN: "bg-blue-100 text-blue-700",
    IN_PROGRESS: "bg-yellow-100 text-yellow-700",
    COMPLETED: "bg-green-100 text-green-700",
    CANCELLED: "bg-gray-100 text-gray-700",
  };

  const priorityStyle: Record<string, string> = {
    LOW: "text-ink-muted",
    MEDIUM: "text-yellow-600",
    HIGH: "text-orange-600",
    URGENT: "text-red-600",
  };

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Work Orders"
        description="All work orders across managed schemes."
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatCard label="Total" value={workOrders.length} accent="bg-adviser" />
        <StatCard label="Open" value={open.length} accent="bg-blue-500" />
        <StatCard
          label="In Progress"
          value={inProgress.length}
          accent="bg-yellow-500"
        />
        <StatCard
          label="Completed"
          value={completed.length}
          accent="bg-green-500"
        />
      </div>

      {workOrders.length === 0 ? (
        <Card>
          <div className="p-6 text-center">
            <p className="text-sm text-ink-muted">
              No work orders raised yet across your managed schemes.
            </p>
          </div>
        </Card>
      ) : (
        <Card>
          <CardHeader
            title="All Work Orders"
            description={`${workOrders.length} work order${workOrders.length === 1 ? "" : "s"} across ${schemes.length} scheme${schemes.length === 1 ? "" : "s"}.`}
          />
          <div className="flex flex-col gap-2">
            {workOrders.map((wo) => (
              <Link
                key={wo.id}
                href={`/adviser/schemes/${wo.schemeId}/work-orders/${wo.id}`}
                className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted px-4 py-3 hover:bg-muted/70 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink truncate">
                    {wo.title}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {schemeNames.get(wo.schemeId) ?? ""}
                    <span className={` ml-2 ${priorityStyle[wo.priority] ?? ""}`}>
                      {wo.priority}
                    </span>
                    {wo.comments.length > 0 &&
                      ` · ${wo.comments.length} comment${wo.comments.length === 1 ? "" : "s"}`}
                  </p>
                </div>
                <span
                  className={`shrink-0 ml-3 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[wo.status] ?? "bg-gray-100 text-gray-700"}`}
                >
                  {wo.status.replace("_", " ")}
                </span>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
