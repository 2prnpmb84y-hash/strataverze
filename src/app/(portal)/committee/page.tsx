import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForCommittee } from "@/lib/queries/schemes";
import { getWorkOrdersForSchemes } from "@/lib/queries/work-orders";
import { getUpcomingMeetingsForOwner } from "@/lib/queries/meetings";
import { StatCard } from "@/components/ui/stat-card";
import { Card } from "@/components/ui/card";

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

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold font-heading text-foreground mb-1">
        Committee Dashboard
      </h1>
      <p className="text-sm text-muted-foreground mb-8">
        Manage finances, compliance, and governance for your scheme.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
          {upcomingMeetings.length > 0 && (
            <Card className="mt-8">
              <div className="flex flex-col gap-2">
                {upcomingMeetings.slice(0, 3).map((meeting) => {
                  const scheduledDate = new Date(String(meeting.scheduledAt));
                  const schemeName = schemes.find(
                    (s) => s.id === meeting.schemeId,
                  )?.name;

                  return (
                    <div
                      key={meeting.id}
                      className="flex items-center justify-between rounded-lg bg-muted px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {meeting.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {schemeName}
                          {" · "}
                          {scheduledDate.toLocaleDateString("en-AU", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })}
                          {meeting.motions.length > 0 &&
                            ` · ${meeting.motions.length} motion${meeting.motions.length === 1 ? "" : "s"}`}
                        </p>
                      </div>
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                        Scheduled
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
