import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForCommittee } from "@/lib/queries/schemes";
import { getWorkOrdersForSchemes } from "@/lib/queries/work-orders";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const priorityStyle: Record<string, string> = {
  LOW: "bg-gray-100 text-gray-700",
  MEDIUM: "bg-blue-100 text-blue-700",
  HIGH: "bg-orange-100 text-orange-700",
  URGENT: "bg-red-100 text-red-700",
};

const statusStyle: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-yellow-100 text-yellow-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-gray-100 text-gray-700",
};

export default async function CommitteeMaintenancePage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = await getSchemesForCommittee(profile.id);
  if (schemes.length === 0) notFound();

  const schemeIds = schemes.map((s) => s.id);
  const workOrders = await getWorkOrdersForSchemes(schemeIds);

  // Build a scheme name lookup
  const schemeNames = new Map(schemes.map((s) => [s.id, s.name]));

  // Split into active and completed
  const active = workOrders.filter(
    (wo) => wo.status === "OPEN" || wo.status === "IN_PROGRESS",
  );
  const completed = workOrders.filter(
    (wo) => wo.status === "COMPLETED" || wo.status === "CANCELLED",
  );

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Maintenance"
        description="Work orders and maintenance requests for your schemes."
        action={<Button href="/committee/maintenance/new">Raise Work Order</Button>}
      />

      {workOrders.length === 0 ? (
        <Card>
          <div className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              No work orders have been raised for your schemes yet.
            </p>
          </div>
        </Card>
      ) : (
        <>
          {/* Active */}
          {active.length > 0 && (
            <Card className="mb-6">
              <CardHeader
                title="Active"
                description={`${active.length} work order${active.length === 1 ? "" : "s"} in progress.`}
              />
              <div className="flex flex-col gap-2">
                {active.map((wo) => {
                  const raisedByName =
                    `${wo.raisedBy.firstName} ${wo.raisedBy.lastName}`.trim() ||
                    wo.raisedBy.email;

                  return (
                    <div
                      key={wo.id}
                      className="rounded-lg bg-muted px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <p className="text-sm font-medium text-foreground">
                          {wo.title}
                        </p>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${priorityStyle[wo.priority]}`}
                          >
                            {wo.priority}
                          </span>
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[wo.status]}`}
                          >
                            {wo.status.replace("_", " ")}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {schemeNames.get(wo.schemeId) ?? ""}
                        {" · Raised by "}
                        {raisedByName}
                        {wo.assignedTo && ` · Assigned to ${wo.assignedTo}`}
                      </p>
                      {wo.comments.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {wo.comments.length} comment
                          {wo.comments.length === 1 ? "" : "s"}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Completed */}
          {completed.length > 0 && (
            <Card>
              <CardHeader
                title="Completed"
                description={`${completed.length} work order${completed.length === 1 ? "" : "s"} resolved.`}
              />
              <div className="flex flex-col gap-2">
                {completed.map((wo) => (
                  <div
                    key={wo.id}
                    className="flex items-center justify-between rounded-lg bg-muted px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {wo.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {schemeNames.get(wo.schemeId) ?? ""}
                        {wo.actualCost &&
                          ` · $${Number(wo.actualCost).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[wo.status] ?? "bg-gray-100 text-gray-700"}`}
                    >
                      {wo.status.replace("_", " ")}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
