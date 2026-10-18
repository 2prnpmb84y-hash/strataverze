import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getMeetingById } from "@/lib/queries/meetings";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { MeetingForm } from "../meeting-form";
import { DeleteMeetingButton } from "./delete-meeting-button";
import { MeetingStatusButton } from "./meeting-status-button";
import { MotionSection } from "./motion-section";
import { connection } from "next/server";

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string; meetingId: string }>;
}) {
  await connection();
  const { id, meetingId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const meeting = await getMeetingById(meetingId);
  if (!meeting || meeting.schemeId !== id) notFound();

  const scheduledDate = new Date(String(meeting.scheduledAt));
  const isPast = scheduledDate < new Date();
  const motionCount = meeting.motions.length;

  const votedMotions = meeting.motions.filter(
    (m) => m.status === "CARRIED" || m.status === "DEFEATED",
  ).length;

  const meetingTypeLabels: Record<string, string> = {
    AGM: "Annual General Meeting",
    SGM: "Special General Meeting",
    COMMITTEE: "Committee Meeting",
  };

  const statusStyle: Record<string, string> = {
    SCHEDULED: "bg-blue-100 text-blue-700",
    COMPLETED: "bg-green-100 text-green-700",
    CANCELLED: "bg-gray-100 text-gray-700",
  };

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={meeting.title}
        description={`${meetingTypeLabels[meeting.meetingType] ?? meeting.meetingType} · ${scheduledDate.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} at ${scheduledDate.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}`}
        backHref={`/adviser/schemes/${id}`}
        backLabel="Scheme"
      />

      {/* Status and quick stats */}
      <div className="flex items-center gap-3 mb-6">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[meeting.status] ?? "bg-gray-100 text-gray-700"}`}
        >
          {meeting.status.charAt(0) + meeting.status.slice(1).toLowerCase()}
        </span>
        {meeting.location && (
          <span className="text-sm text-muted-foreground">
            📍 {meeting.location}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
        <StatCard label="Motions" value={motionCount} accent="bg-adviser" />
        <StatCard label="Voted" value={votedMotions} accent="bg-owner" />
        <StatCard
          label="Status"
          value={meeting.status.charAt(0) + meeting.status.slice(1).toLowerCase()}
          accent={meeting.status === "COMPLETED" ? "bg-green-400" : "bg-blue-400"}
        />
      </div>

      {/* Agenda */}
      {meeting.agenda && (
        <Card className="mb-6">
          <CardHeader title="Agenda" />
          <div className="text-sm text-foreground whitespace-pre-wrap">
            {meeting.agenda}
          </div>
        </Card>
      )}

      {/* Motions */}
      <MotionSection
        schemeId={id}
        meetingId={meetingId}
        motions={meeting.motions}
        meetingStatus={meeting.status}
        currentProfileId={profile.id}
      />

      {/* Edit form (only if scheduled) */}
      {meeting.status === "SCHEDULED" && (
        <div className="mb-6">
          <h2 className="font-heading font-semibold text-foreground mb-4">
            Edit Meeting Details
          </h2>
          <MeetingForm
            mode="edit"
            schemeId={id}
            meetingId={meetingId}
            defaults={{
              title: meeting.title,
              meetingType: meeting.meetingType,
              scheduledAt: String(meeting.scheduledAt),
              location: meeting.location,
              agenda: meeting.agenda,
            }}
          />
        </div>
      )}

      {/* Status actions */}
      {meeting.status === "SCHEDULED" && (
        <Card className="mb-6">
          <CardHeader
            title="Meeting Actions"
            description="Mark meeting as complete or cancel it."
          />
          <div className="flex gap-3">
            <MeetingStatusButton
              schemeId={id}
              meetingId={meetingId}
              action="complete"
            />
            <MeetingStatusButton
              schemeId={id}
              meetingId={meetingId}
              action="cancel"
            />
          </div>
        </Card>
      )}

      {/* Danger zone */}
      <Card className="border-red-200">
        <CardHeader
          title="Danger Zone"
          description="Irreversible actions for this meeting."
        />
        <DeleteMeetingButton
          schemeId={id}
          meetingId={meetingId}
          meetingTitle={meeting.title}
        />
      </Card>
    </div>
  );
}
