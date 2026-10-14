import { notFound } from "next/navigation";
import { requireCommitteeAccess } from "@/lib/queries/committee-access";
import { getMeetingById } from "@/lib/queries/meetings";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { MotionSection } from "./motion-section";

export default async function OwnerMeetingDetailPage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const { meetingId } = await params;
  const access = await requireCommitteeAccess();
  if (!access) return null;

  const { profile, schemes } = access;

  const meeting = await getMeetingById(meetingId);
  if (!meeting) notFound();

  const hasAccess = schemes.some((s) => s.id === meeting.schemeId);
  if (!hasAccess) notFound();

  const scheduledDate = new Date(String(meeting.scheduledAt));
  const motionCount = meeting.motions.length;

  const votedMotions = meeting.motions.filter(
    (m) => m.status === "CARRIED" || m.status === "DEFEATED" || m.status === "PASSED",
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
        backHref="/owner/governance"
        backLabel="Governance"
      />

      {/* Status and location */}
      <div className="flex items-center gap-3 mb-6">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[meeting.status] ?? "bg-gray-100 text-gray-700"}`}
        >
          {meeting.status.charAt(0) + meeting.status.slice(1).toLowerCase()}
        </span>
        {meeting.location && (
          <span className="text-sm text-muted-foreground">
            {meeting.location}
          </span>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
        <StatCard label="Motions" value={motionCount} accent="bg-owner" />
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
        meetingId={meetingId}
        motions={meeting.motions}
        meetingStatus={meeting.status}
        currentProfileId={profile.id}
      />
    </div>
  );
}
