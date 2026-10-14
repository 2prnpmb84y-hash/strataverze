import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForOwner } from "@/lib/queries/schemes";
import { getUpcomingMeetingsForOwner } from "@/lib/queries/meetings";
import { StatCard } from "@/components/ui/stat-card";
import { Card } from "@/components/ui/card";

export default async function OwnerDashboard() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = await getSchemesForOwner(profile.id);
  const schemeIds = schemes.map((s) => s.id);

  const meetings = schemeIds.length > 0
    ? await getUpcomingMeetingsForOwner(schemeIds)
    : [];

  const upcomingMeetings = meetings.filter((m) => m.status === "SCHEDULED");
  const pendingMotions = meetings.reduce(
    (sum, m) =>
      sum + m.motions.filter((mo) => mo.status === "PROPOSED").length,
    0,
  );

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold font-heading text-foreground mb-1">
        Owner Dashboard
      </h1>
      <p className="text-sm text-muted-foreground mb-8">
        View your levies, vote on motions, and track maintenance requests.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="Your Schemes"
          value={schemes.length}
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
          {upcomingMeetings.length > 0 && (
            <Card className="mt-8">
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
        </>
      )}
    </div>
  );
}
