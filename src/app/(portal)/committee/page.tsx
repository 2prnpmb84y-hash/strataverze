import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForCommittee } from "@/lib/queries/schemes";
import { getWorkOrdersForSchemes } from "@/lib/queries/work-orders";
import { getUpcomingMeetingsForOwner } from "@/lib/queries/meetings";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const statusLabels: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const statusColours: Record<string, string> = {
  OPEN: "bg-amber-100 text-amber-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
};

export default async function CommitteeDashboard() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = await getSchemesForCommittee(profile.id);
  const schemeIds = schemes.map((s) => s.id);

  const [workOrders, meetings] = schemeIds.length > 0
    ? await Promise.all([
        getWorkOrdersForSchemes(schemeIds),
        getUpcomingMeetingsForOwner(schemeIds),
      ])
    : [[], []];

  const activeWorkOrders = workOrders.filter(
    (wo) => wo.status === "OPEN" || wo.status === "IN_PROGRESS",
  );
  const pendingMotions = meetings.reduce(
    (sum, m) =>
      sum + m.motions.filter((mo) => mo.status === "PROPOSED").length,
    0,
  );
  const upcomingMeetings = meetings.filter((m) => m.status === "SCHEDULED");

  // Recent work orders (last 5)
  const recentWorkOrders = workOrders.slice(0, 5);

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold font-heading text-foreground mb-1">
        Committee Dashboard
      </h1>
      <p className="text-sm text-muted-foreground mb-8">
        Manage finances, compliance, and governance for your scheme.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Your Schemes"
          value={schemes.length}
          accent="bg-committee"
        />
        <StatCard
          label="Upcoming Meetings"
          value={upcomingMeetings.length}
          accent="bg-committee"
        />
        <StatCard
          label="Pending Motions"
          value={pendingMotions}
          accent="bg-committee"
        />
        <StatCard
          label="Active Work Orders"
          value={activeWorkOrders.length}
          accent="bg-committee"
        />
      </div>

      {schemes.length === 0 ? (
        <div className="mt-8 rounded-xl bg-card border border-border p-6">
          <h2 className="font-heading font-semibold text-foreground mb-2">
            Getting Started
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Welcome to the Committee Portal. Once your scheme is configured,
            you will manage fund budgets, schedule meetings, raise motions, and
            track compliance obligations from here.
          </p>
        </div>
      ) : (
        <>
          {/* Quick Actions */}
          <div className="mt-8 flex flex-wrap gap-3">
            <Button variant="primary" href="/committee/maintenance/new">
              Raise Work Order
            </Button>
            <Button variant="secondary" href="/committee/governance/meetings/new">
              Schedule Meeting
            </Button>
            <Button variant="secondary" href="/committee/maintenance">
              View Work Orders
            </Button>
            <Button variant="secondary" href="/committee/governance">
              View Governance
            </Button>
            <Button variant="secondary" href="/committee/announcements">
              Announcements
            </Button>
          </div>

          {/* Upcoming Meetings */}
          {upcomingMeetings.length > 0 && (
            <Card className="mt-8">
              <CardHeader
                title="Upcoming Meetings"
                action={
                  <Button variant="ghost" href="/committee/governance">
                    View all
                  </Button>
                }
              />
              <div className="flex flex-col gap-2">
                {upcomingMeetings.slice(0, 3).map((meeting) => {
                  const scheduledDate = new Date(String(meeting.scheduledAt));
                  const schemeName = schemes.find(
                    (s) => s.id === meeting.schemeId,
                  )?.name;
                  const pendingCount = meeting.motions.filter(
                    (mo) => mo.status === "PROPOSED",
                  ).length;

                  return (
                    <div
                      key={meeting.id}
                      className="rounded-lg bg-muted px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <p className="text-sm font-medium text-foreground">
                          {meeting.title}
                        </p>
                        <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                          Scheduled
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {schemeName}
                        {" · "}
                        {scheduledDate.toLocaleDateString("en-AU", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                        {pendingCount > 0 &&
                          ` · ${pendingCount} motion${pendingCount === 1 ? "" : "s"} to vote on`}
                      </p>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Recent Work Orders */}
          {recentWorkOrders.length > 0 && (
            <Card className="mt-6">
              <CardHeader
                title="Recent Work Orders"
                action={
                  <Button variant="ghost" href="/committee/maintenance">
                    View all
                  </Button>
                }
              />
              <div className="flex flex-col gap-2">
                {recentWorkOrders.map((wo) => {
                  const schemeName = schemes.find(
                    (s) => s.id === wo.schemeId,
                  )?.name;
                  const createdDate = new Date(String(wo.createdAt));

                  return (
                    <div
                      key={wo.id}
                      className="rounded-lg bg-muted px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <p className="text-sm font-medium text-foreground">
                          {wo.title}
                        </p>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColours[wo.status] ?? "bg-gray-100 text-gray-700"}`}
                        >
                          {statusLabels[wo.status] ?? wo.status}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {schemeName}
                        {" · "}
                        {createdDate.toLocaleDateString("en-AU", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                        {wo.comments.length > 0 &&
                          ` · ${wo.comments.length} comment${wo.comments.length === 1 ? "" : "s"}`}
                      </p>
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
