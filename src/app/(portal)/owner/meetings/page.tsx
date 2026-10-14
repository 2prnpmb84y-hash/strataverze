import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForOwner } from "@/lib/queries/schemes";
import { getUpcomingMeetingsForOwner } from "@/lib/queries/meetings";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { VoteButtons } from "./vote-buttons";

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

  const motionStatusStyle: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-700",
    PROPOSED: "bg-yellow-100 text-yellow-700",
    PASSED: "bg-green-100 text-green-700",
    DEFEATED: "bg-red-100 text-red-700",
    WITHDRAWN: "bg-gray-100 text-gray-500",
  };

  function getVoteTally(votes: { voteValue: string }[]) {
    const tally = { FOR: 0, AGAINST: 0, ABSTAIN: 0 };
    for (const v of votes) {
      if (v.voteValue in tally) {
        tally[v.voteValue as keyof typeof tally]++;
      }
    }
    return tally;
  }

  function getUserVote(votes: { profileId: string; voteValue: string }[]) {
    const vote = votes.find((v) => v.profileId === profile!.id);
    return vote?.voteValue ?? null;
  }

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
                  const motions = meeting.motions;

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

                      {/* Motions */}
                      {motions.length > 0 && (
                        <div className="mt-3 space-y-2">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Motions
                          </p>
                          {motions.map((motion) => {
                            const tally = getVoteTally(motion.votes);
                            const userVote = getUserVote(motion.votes);
                            const isProposed = motion.status === "PROPOSED";

                            return (
                              <div
                                key={motion.id}
                                className="rounded-md bg-background border border-border p-3"
                              >
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <p className="text-sm font-medium text-foreground">
                                    {motion.title}
                                  </p>
                                  <span
                                    className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${motionStatusStyle[motion.status] ?? "bg-gray-100 text-gray-700"}`}
                                  >
                                    {motion.status.charAt(0) +
                                      motion.status.slice(1).toLowerCase()}
                                  </span>
                                </div>
                                {motion.description && (
                                  <p className="text-xs text-muted-foreground mb-2">
                                    {motion.description}
                                  </p>
                                )}

                                {/* Vote tally */}
                                {motion.votes.length > 0 && (
                                  <p className="text-xs text-muted-foreground mb-2">
                                    {tally.FOR} For · {tally.AGAINST} Against ·{" "}
                                    {tally.ABSTAIN} Abstain
                                  </p>
                                )}

                                {/* Vote buttons for PROPOSED motions */}
                                {isProposed && (
                                  <VoteButtons
                                    motionId={motion.id}
                                    currentVote={userVote}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
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
                  const motions = meeting.motions;

                  return (
                    <div
                      key={meeting.id}
                      className="rounded-lg bg-muted px-4 py-3"
                    >
                      <div className="flex items-center justify-between mb-1">
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
                        {scheduledDate.toLocaleDateString("en-AU", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>

                      {/* Past meeting motions — read-only results */}
                      {motions.length > 0 && (
                        <div className="mt-3 space-y-2">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Motions
                          </p>
                          {motions.map((motion) => {
                            const tally = getVoteTally(motion.votes);

                            return (
                              <div
                                key={motion.id}
                                className="rounded-md bg-background border border-border p-3"
                              >
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <p className="text-sm font-medium text-foreground">
                                    {motion.title}
                                  </p>
                                  <span
                                    className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${motionStatusStyle[motion.status] ?? "bg-gray-100 text-gray-700"}`}
                                  >
                                    {motion.status.charAt(0) +
                                      motion.status.slice(1).toLowerCase()}
                                  </span>
                                </div>
                                {motion.votes.length > 0 && (
                                  <p className="text-xs text-muted-foreground">
                                    {tally.FOR} For · {tally.AGAINST} Against ·{" "}
                                    {tally.ABSTAIN} Abstain
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
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
