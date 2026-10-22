import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import type { getMeetingsForScheme } from "@/lib/queries/meetings";

/** Moved unchanged from the scheme main page so it can also back its section page. */
export function MeetingsCard({
  id, meetings,
}: {
  id: string;
  meetings: Awaited<ReturnType<typeof getMeetingsForScheme>>;
}) {
  return (
    <Card className="mb-6">
      <CardHeader
        title="Meetings"
        description={
          meetings.length === 0
            ? "No meetings scheduled yet."
            : `${meetings.length} meeting${meetings.length === 1 ? "" : "s"} on record.`
        }
        action={
          <Button href={`/adviser/schemes/${id}/meetings/new`} variant="secondary">
            Schedule Meeting
          </Button>
        }
      />
      {meetings.length > 0 ? (
        <div className="flex flex-col gap-2">
          {meetings.map((meeting) => {
            const scheduledDate = new Date(String(meeting.scheduledAt));
            const motionCount = meeting.motions.length;

            const statusStyle: Record<string, string> = {
              SCHEDULED: "bg-blue-100 text-blue-700",
              COMPLETED: "bg-green-100 text-green-700",
              CANCELLED: "bg-gray-100 text-gray-700",
            };

            const meetingTypeShort: Record<string, string> = {
              AGM: "AGM",
              SGM: "SGM",
              COMMITTEE: "Committee",
            };

            return (
              <Link
                key={meeting.id}
                href={`/adviser/schemes/${id}/meetings/${meeting.id}`}
                className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted px-4 py-3 hover:bg-muted/70 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-ink">
                    {meeting.title}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {meetingTypeShort[meeting.meetingType] ?? meeting.meetingType}
                    {" · "}
                    {scheduledDate.toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {motionCount > 0 && ` · ${motionCount} motion${motionCount === 1 ? "" : "s"}`}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[meeting.status] ?? "bg-gray-100 text-gray-700"}`}
                >
                  {meeting.status.charAt(0) + meeting.status.slice(1).toLowerCase()}
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">
          Schedule a meeting to manage governance for this scheme.
        </p>
      )}
    </Card>
  );
}
