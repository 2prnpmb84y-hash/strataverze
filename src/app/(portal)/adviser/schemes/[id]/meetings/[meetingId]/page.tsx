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
import { AgendaSection } from "./agenda-section";
import { NoticeSection } from "./notice-section";
import { ConductSection } from "./conduct-section";
import { getAgendaItemsForMeeting } from "@/lib/queries/agenda";
import { getNoticesForMeeting } from "@/lib/queries/notice";
import {
  allowedCategoriesForMeetingType,
} from "@/lib/meetings/agenda";
import { normaliseMeetingType } from "@/lib/meetings/setup";
import { getMotionLibrary, getAgendaTemplate } from "@/lib/meetings/templates";
import { getActiveRuleSet } from "@/lib/meetings/rule-set-repo";
import { validateNoticePeriod, type MeetingType } from "@/lib/meetings/rules";
import { canTransition } from "@/lib/meetings/lifecycle";
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

  const agendaItems = await getAgendaItemsForMeeting(meetingId);
  const normalisedType = normaliseMeetingType(meeting.meetingType);
  const motionLibrary = getMotionLibrary(
    scheme.state,
    normalisedType ?? undefined,
  ).map((m) => ({
    key: m.key,
    title: m.title,
    defaultResolutionCategory: m.defaultResolutionCategory,
  }));
  const allowedCategories = allowedCategoriesForMeetingType(
    meeting.meetingType,
  );
  const canLoadTemplate = normalisedType
    ? getAgendaTemplate(scheme.state, normalisedType).length > 0
    : false;
  const agendaEditable =
    meeting.status === "DRAFT" || meeting.status === "SCHEDULED";

  // Notice context
  const notices = await getNoticesForMeeting(meetingId);
  const ruleSet = await getActiveRuleSet(scheme.state);
  const startIso = String(meeting.startTime ?? meeting.scheduledAt);
  const noticePeriod =
    normalisedType != null
      ? validateNoticePeriod(
          ruleSet,
          normalisedType as MeetingType,
          new Date(),
          new Date(startIso),
        )
      : null;
  const recipientCount = scheme.memberships.filter(
    (m) => m.profile?.email,
  ).length;
  const canIssueNotice =
    agendaItems.length > 0 && canTransition(meeting.status, "NOTICE_ISSUED");
  const noticeViews = notices.map((n) => ({
    id: n.id,
    version: n.version,
    status: n.status,
    issuedAt: String(n.issuedAt),
    compliant: n.compliant,
    recipients: n.recipients.map((r) => ({
      name: r.name,
      email: r.email,
      deliveryOutcome: r.deliveryOutcome,
    })),
  }));

  const scheduledDate = new Date(String(meeting.scheduledAt));
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
          <span className="text-sm text-ink-muted">
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
          <div className="text-sm text-ink whitespace-pre-wrap">
            {meeting.agenda}
          </div>
        </Card>
      )}

      {/* Structured agenda */}
      <AgendaSection
        schemeId={id}
        meetingId={meetingId}
        items={agendaItems.map((a) => ({
          id: a.id,
          position: a.position,
          title: a.title,
          resolutionText: a.resolutionText,
          explanatoryNote: a.explanatoryNote,
          resolutionCategory: a.resolutionCategory,
        }))}
        motionLibrary={motionLibrary}
        allowedCategories={allowedCategories}
        canLoadTemplate={canLoadTemplate}
        editable={agendaEditable}
      />

      {/* Notice */}
      <NoticeSection
        schemeId={id}
        meetingId={meetingId}
        canIssue={canIssueNotice}
        agendaItemCount={agendaItems.length}
        recipientCount={recipientCount}
        noticePeriod={noticePeriod}
        notices={noticeViews}
      />

      {/* Conduct */}
      <ConductSection
        schemeId={id}
        meetingId={meetingId}
        status={meeting.status}
        openedAt={meeting.openedAt ? String(meeting.openedAt) : null}
        closedAt={meeting.closedAt ? String(meeting.closedAt) : null}
        items={agendaItems.map((a) => ({
          id: a.id,
          position: a.position,
          title: a.title,
          outcome: a.outcome,
        }))}
      />

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
          <h2 className="font-heading font-semibold text-ink mb-4">
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
