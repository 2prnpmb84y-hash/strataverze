import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForOwner } from "@/lib/queries/schemes";
import { getUpcomingMeetingsForOwner } from "@/lib/queries/meetings";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";

export default async function OwnerMeetingsPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = await getSchemesForOwner(profile.id);
  if (schemes.length === 0) notFound();

  const schemeIds = schemes.map((s) => s.id);
  const meetings = await getUpcomingMeetingsForOwner(schemeIds);

  // Build a scheme name lookup
  const schemeNames = new Map(schemes.map((s) => [s.id, s.name]));

  // Split into upcoming and past
  const now = new Date();
  const upcoming = meetings.filter(
    (m) => new Date(String(m.scheduledAt)) >= now && m.status === "SCHEDULED",
  );
  const past = meetings.filter(
    (m) => new Date(String(m.scheduledAt)) < now || m.status !== "SCHEDULED",
  );

  const meetingTypeLabels: Record<string, string> = {
    AGM: "AGM",
    SGM: "SGM",
    COMMITTEE: "Committee",
  };

  const statusStyle: Record<string, string> = {
    SCHEDULED: "bg-blue-100 text-blue-700",
    COMPLETED: "bg-green-100 text-green-700",
    CANCELLED: "bg-gray-100 text-gray-700",
  };

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="My Meetings"
        description="Meetings and governance for your schemes."
      />

      {meetings.length === 0 ? (
        <Card>
          <div className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              No meetings have been scheduled for your schemes yet.
            </p>
          </div>
        </Card>
      ) : (
        <>
          {/* Upcoming */}
          {upcoming.length > 0 && (
            <Card className="mb-6">
              <CardHeader
                title="Upcoming"
                description={`${upcoming.length} meeting${upcoming.length === 1 ? "" : "s"} scheduled.`}
              />
              <div className="flex flex-col gap-2">
                {upcoming.map((meeting) => {
                  const scheduledDate = new Date(String(meeting.scheduledAt));
                  const motionCount = meeting.motions.length;

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
                          className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[meeting.status] ?? "bg-gray-100 text-gray-700"}`}
                        >
                          {meeting.status.charAt(0) +
                            meeting.status.slice(1).toLowerCase()}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {schemeNames.get(meeting.schemeId) ?? ""}
                        {" · "}
                        {meetingTypeLabels[meeting.meetingType] ??
                          meeting.meetingType}
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
                      {meeting.location && (
                        <p className="text-xs text-muted-foreground mt-1">
                          📍 {meeting.location}
                        </p>
                      )}
                      {motionCount > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {motionCount} motion{motionCount === 1 ? "" : "s"} on
                          the agenda
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Past */}
          {past.length > 0 && (
            <Card>
              <CardHeader
                title="Past Meetings"
                description={`${past.length} previous meeting${past.length === 1 ? "" : "s"}.`}
              />
              <div className="flex flex-col gap-2">
                {past.map((meeting) => {
                  const scheduledDate = new Date(String(meeting.scheduledAt));

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
                        </p>
                      </div>
                      <span
                        className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[meeting.status] ?? "bg-gray-100 text-gray-700"}`}
                      >
                        {meeting.status.charAt(0) +
                          meeting.status.slice(1).toLowerCase()}
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
