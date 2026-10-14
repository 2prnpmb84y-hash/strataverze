import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForOwner } from "@/lib/queries/schemes";
import { getUpcomingMeetingsForOwner } from "@/lib/queries/meetings";
import { getWorkOrdersForSchemes } from "@/lib/queries/work-orders";
import { getLeviesForSchemes } from "@/lib/queries/levies";
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

export default async function OwnerDashboard() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = await getSchemesForOwner(profile.id);
  const schemeIds = schemes.map((s) => s.id);

  // Fetch all owner lots across schemes
  const ownerLotIds = new Set(
    schemes.flatMap((s) =>
      s.memberships
        .filter((m) => m.lotId)
        .map((m) => m.lotId as string),
    ),
  );

  const [meetings, workOrders, levies] = schemeIds.length > 0
    ? await Promise.all([
        getUpcomingMeetingsForOwner(schemeIds),
        getWorkOrdersForSchemes(schemeIds),
        getLeviesForSchemes(schemeIds),
      ])
    : [[], [], []];

  const upcomingMeetings = meetings.filter((m) => m.status === "SCHEDULED");
  const pendingMotions = meetings.reduce(
    (sum, m) =>
      sum + m.motions.filter((mo) => mo.status === "PROPOSED").length,
    0,
  );

  // Calculate outstanding levy balance for owner's lots
  const issuedLevies = levies.filter((l) => l.status === "ISSUED");
  let outstandingBalance = 0;
  for (const levy of issuedLevies) {
    for (const item of levy.items) {
      if (ownerLotIds.has(item.lotId) && item.status !== "PAID") {
        outstandingBalance += Number(item.amount) - Number(item.paidAmount);
      }
    }
  }

  // Recent work orders (last 5)
  const recentWorkOrders = workOrders.slice(0, 5);

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold font-heading text-foreground mb-1">
        Owner Dashboard
      </h1>
      <p className="text-sm text-muted-foreground mb-8">
        View your levies, vote on motions, and track maintenance requests.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Your Schemes"
          value={schemes.length}
          accent="bg-owner"
        />
        <StatCard
          label="Outstanding Levies"
          value={`$${outstandingBalance.toLocaleString("en-AU", { minimumFractionDigits: 2 })}`}
          accent="bg-owner"
        />
        <StatCard
          label="Upcoming Meetings"
          value={upcomingMeetings.length}
          accent="bg-owner"
        />
        <StatCard
          label="Pending Motions"
          value={pendingMotions}
          accent="bg-owner"
        />
      </div>

      {schemes.length === 0 ? (
        <div className="mt-8 rounded-xl bg-card border border-border p-6">
          <h2 className="font-heading font-semibold text-foreground mb-2">
            Getting Started
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Welcome to StrataVerze. Once your strata scheme is set up, you will
            see your levy statements, meeting agendas, and maintenance updates
            here. Contact your committee or strata manager to get connected.
          </p>
        </div>
      ) : (
        <>
          {/* Quick Actions */}
          <div className="mt-8 flex flex-wrap gap-3">
            <Button variant="primary" href="/owner/maintenance/new">
              Lodge Maintenance Request
            </Button>
            <Button variant="secondary" href="/owner/levies">
              View Levies
            </Button>
            <Button variant="secondary" href="/owner/documents">
              View Documents
            </Button>
            <Button variant="secondary" href="/owner/meetings">
              View Meetings
            </Button>
            <Button variant="secondary" href="/owner/announcements">
              Announcements
            </Button>
            <Button variant="secondary" href="/owner/bylaws">
              By-laws
            </Button>
            <Button variant="secondary" href="/owner/insurance">
              Insurance
            </Button>
          </div>

          {/* Upcoming Meetings */}
          {upcomingMeetings.length > 0 && (
            <Card className="mt-8">
              <CardHeader
                title="Upcoming Meetings"
                action={
                  <Button variant="ghost" href="/owner/meetings">
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
                title="Recent Maintenance Requests"
                action={
                  <Button variant="ghost" href="/owner/maintenance">
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

          {/* Outstanding Levies */}
          {outstandingBalance > 0 && (
            <Card className="mt-6">
              <CardHeader
                title="Outstanding Levies"
                action={
                  <Button variant="ghost" href="/owner/levies">
                    View all
                  </Button>
                }
              />
              <div className="flex flex-col gap-2">
                {issuedLevies
                  .filter((levy) =>
                    levy.items.some(
                      (item) =>
                        ownerLotIds.has(item.lotId) && item.status !== "PAID",
                    ),
                  )
                  .slice(0, 3)
                  .map((levy) => {
                    const ownerItems = levy.items.filter(
                      (item) =>
                        ownerLotIds.has(item.lotId) && item.status !== "PAID",
                    );
                    const totalOwed = ownerItems.reduce(
                      (sum, item) =>
                        sum + (Number(item.amount) - Number(item.paidAmount)),
                      0,
                    );
                    const dueDate = new Date(String(levy.dueDate));

                    return (
                      <div
                        key={levy.id}
                        className="rounded-lg bg-muted px-4 py-3"
                      >
                        <div className="flex items-start justify-between gap-3 mb-1">
                          <p className="text-sm font-medium text-foreground">
                            {levy.title}
                          </p>
                          <span className="text-sm font-semibold text-foreground">
                            ${totalOwed.toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {"scheme" in levy && (levy as { scheme: { name: string } }).scheme
                            ? (levy as { scheme: { name: string } }).scheme.name
                            : ""}
                          {" · Due "}
                          {dueDate.toLocaleDateString("en-AU", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
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
