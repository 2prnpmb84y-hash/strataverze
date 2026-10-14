import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForCommittee } from "@/lib/queries/schemes";
import { getUpcomingMeetingsForOwner } from "@/lib/queries/meetings";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";

const statusStyle: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-gray-100 text-gray-700",
};

const meetingTypeLabels: Record<string, string> = {
  AGM: "AGM",
  SGM: "SGM",
  COMMITTEE: "Committee",
};

const motionStatusStyle: Record<string, string> = {
  PROPOSED: "bg-blue-100 text-blue-700",
  PASSED: "bg-green-100 text-green-700",
  DEFEATED: "bg-red-100 text-red-700",
  WITHDRAWN: "bg-gray-100 text-gray-700",
};

export default async function CommitteeGovernancePage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = await getSchemesForCommittee(profile.id);
  const schemeIds = schemes.map((s) => s.id);
  const meetings = schemeIds.length > 0
    ? await getUpcomingMeetingsForOwner(schemeIds)
    : [];

  const schemeNames = new Map(schemes.map((s) => [s.id, s.name]));

  const scheduled = meetings.filter((m) => m.status === "SCHEDULED");
  const completed = meetings.filter((m) => m.status === "COMPLETED");

  const totalMotions = meetings.reduce(
    (sum, m) => sum + m.motions.length,
    0,
  );
  const pendingMotions = meetings.reduce(
    (sum, m) =>
      sum + m.motions.filter((mo) => mo.status === "PROPOSED").length,
    0,
  );

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Governance"
        description="Meetings, motions, and voting for your schemes."
        action={<Button href="/committee/governance/new">Schedule Meeting</Button>}
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        <StatCard
          label="Upcoming Meetings"
          value={scheduled.length}
          accent="bg-committee"
        />
        <StatCard
          label="Total Motions"
          value={totalMotions}
          accent="bg-committee"
        />
        <StatCard
          label="Pending Votes"
          value={pendingMotions}
          accent="bg-yellow-500"
        />
      </div>

      {meetings.length === 0 ? (
        <Card>
          <div className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              No meetings have been scheduled for your schemes yet. Your strata
              manager will schedule AGMs, SGMs, and committee meetings.
            </p>
          </div>
        </Card>
      ) : (
        <>
          {/* Upcoming meetings */}
          {scheduled.length > 0 && (
            <Card className="mb-6">
              <CardHeader
                title="Upcoming Meetings"
                description={`${scheduled.length} meeting${scheduled.length === 1 ? "" : "s"} scheduled.`}
              />
              <div className="flex flex-col gap-2">
                {scheduled.map((meeting) => {
                  const scheduledDate = new Date(String(meeting.scheduledAt));
                  const motionCount = meeting.motions.length;
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
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[meeting.status]}`}
                        >
                          {meeting.status}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {schemeNames.get(meeting.schemeId) ?? ""}
                        {" · "}
                        {meetingTypeLabels[meeting.meetingType] ?? meeting.meetingType}
                        {" · "}
                        {scheduledDate.toLocaleDateString("en-AU", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                        {" at "}
                        {scheduledDate.toLocaleTimeString("en-AU", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                      {motionCount > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {meeting.motions.map((motion) => (
                            <span
                              key={motion.id}
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${motionStatusStyle[motion.status] ?? "bg-gray-100 text-gray-700"}`}
                            >
                              {motion.title.length > 30
                                ? `${motion.title.slice(0, 30)}...`
                                : motion.title}
                            </span>
                          ))}
                        </div>
                      )}
                      {pendingCount > 0 && (
                        <p className="text-xs text-yellow-600 mt-1">
                          {pendingCount} motion{pendingCount === 1 ? "" : "s"} awaiting vote
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Past meetings */}
          {completed.length > 0 && (
            <Card>
              <CardHeader
                title="Past Meetings"
                description={`${completed.length} meeting${completed.length === 1 ? "" : "s"} completed.`}
              />
              <div className="flex flex-col gap-2">
                {completed.map((meeting) => {
                  const scheduledDate = new Date(String(meeting.scheduledAt));
                  const passed = meeting.motions.filter(
                    (mo) => mo.status === "PASSED",
                  ).length;
                  const defeated = meeting.motions.filter(
                    (mo) => mo.status === "DEFEATED",
                  ).length;

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
                          {schemeNames.get(meeting.schemeId) ?? ""}
                          {" · "}
                          {scheduledDate.toLocaleDateString("en-AU", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                          {meeting.motions.length > 0 &&
                            ` · ${passed} passed, ${defeated} defeated`}
                        </p>
                      </div>
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                        Completed
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
