import { notFound } from "next/navigation";
import { meetingZone } from "@/lib/jurisdiction/time-zone";
import { requireCommitteeAccess } from "@/lib/queries/committee-access";
import { getMeetingById } from "@/lib/queries/meetings";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { MotionSection } from "./motion-section";
import { connection } from "next/server";
import { meetingStatusLabel } from "@/lib/meetings/lifecycle";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";

export default async function OwnerMeetingDetailPage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  await connection();
  const { meetingId } = await params;
  const access = await requireCommitteeAccess();
  if (!access) return null;

  const { profile, schemes } = access;

  const meeting = await getMeetingById(meetingId);
  if (!meeting) notFound();

  const scheme = schemes.find((s) => s.id === meeting.schemeId);
  if (!scheme) notFound();

  // Motion type names from the building's rule set.
  const meetingRules = rulesForState(scheme.state).rules.MEETING_RULES;
  const motionTypeLabels = Object.fromEntries(
    meetingRules.motionCategories.map((c) => [c, meetingRules.resolutionLabels[c]?.full ?? c]),
  );

  const scheduledDate = new Date(String(meeting.scheduledAt));
  // Shown in the meeting's own time zone (stored times are instants).
  const meetingTz = meetingZone(meeting);
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
        description={`${meetingTypeLabels[meeting.meetingType] ?? meeting.meetingType} · ${scheduledDate.toLocaleDateString("en-AU", { timeZone: meetingTz, weekday: "long", day: "numeric", month: "long", year: "numeric" })} at ${scheduledDate.toLocaleTimeString("en-AU", { timeZone: meetingTz, hour: "numeric", minute: "2-digit" })}`}
        backHref="/owner/governance"
        backLabel="Governance"
      />

      {/* Status and location */}
      <div className="flex items-center gap-3 mb-6">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[meeting.status] ?? "bg-gray-100 text-gray-700"}`}
        >
          {meetingStatusLabel(String(meeting.status))}
        </span>
        {meeting.location && (
          <span className="text-sm text-ink-muted">
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
          value={meetingStatusLabel(String(meeting.status))}
          accent={meeting.status === "COMPLETED" ? "bg-green-400" : "bg-blue-400"}
        />
      </div>

      {/* Agenda */}
      {meeting.agenda && (
        <Card className="mb-6">
          <CardHeader title="Agenda" />
          <div className="text-sm text-ink whitespace-pre-wrap">
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
        motionTypeLabels={motionTypeLabels}
      />
    </div>
  );
}
