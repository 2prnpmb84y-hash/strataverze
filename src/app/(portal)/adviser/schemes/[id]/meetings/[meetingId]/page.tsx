import { notFound } from "next/navigation";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { meetingZone } from "@/lib/jurisdiction/time-zone";
import { timeZoneOf } from "@/lib/jurisdiction/scheme-time";
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
import { MinutesSection } from "./minutes-section";
import { EvotingSection } from "./evoting-section";
import { PendingSection } from "./pending-section";
import { getAgendaItemsForMeeting } from "@/lib/queries/agenda";
import { getNoticesForMeeting } from "@/lib/queries/notice";
import { getMinutesForMeeting } from "@/lib/queries/minutes";
import { getBallotForMeeting } from "@/lib/queries/evoting";
import { minutesDistributionDeadline } from "@/lib/meetings/minutes";
import {
  allowedCategoriesForMeetingType,
} from "@/lib/meetings/agenda";
import { normaliseMeetingType } from "@/lib/meetings/setup";
import { getMotionLibrary, getAgendaTemplate } from "@/lib/meetings/templates";
import { getActiveRuleSet } from "@/lib/meetings/rule-set-repo";
import { evotingNotOfferedReason } from "@/lib/meetings/evoting";
import { conductVotingView } from "@/lib/meetings/conduct-tally";
import { validateNoticePeriod, type MeetingType } from "@/lib/meetings/rules";
import { canEditDetails, canTransition, isBeforeNotice, meetingStatusLabel } from "@/lib/meetings/lifecycle";
import { connection } from "next/server";
import { hasFeeEvent, previewUsageFee } from "@/lib/billing/capture";
import { feeWordingFor } from "@/lib/billing/disclosure";
import { isChargeableMeetingType } from "@/lib/billing/hook-codes";
import { needRule } from "@/config/statutory";
import { pendingPanelData, settleDuePendingResolutions, type PendingPanelData } from "@/lib/meetings/pending-repo";
import { logError } from "@/lib/log";

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

  let agendaItems = await getAgendaItemsForMeeting(meetingId);
  const normalisedType = normaliseMeetingType(meeting.meetingType);

  // The StrataVerze fee for issuing the notice: each adjourned general
  // meeting notice, or the first notice of an EGM. Matches issueNoticeAction.
  const chargeAdjournment = meeting.status === "ADJOURNED" && normalisedType !== "COMMITTEE";
  const chargeMeeting =
    !chargeAdjournment &&
    isChargeableMeetingType(normalisedType) &&
    !(await hasFeeEvent({ code: "MEETING_EGM", sourceType: "Meeting", sourceId: meetingId }));
  const noticeFee =
    chargeAdjournment || chargeMeeting ? await previewUsageFee({ code: "MEETING_EGM" }, feeWordingFor(rulesForState(scheme.state).rules)) : null;
  const motionLibrary = getMotionLibrary(
    scheme.state,
    normalisedType ?? undefined,
  ).map((m) => ({
    key: m.key,
    title: m.title,
    defaultResolutionCategory: m.defaultResolutionCategory,
  }));
  // The building's meeting rules: its resolution categories, labels and deadlines.
  const ruleSet = await getActiveRuleSet(scheme.state);
  // Resolutions decided later (the draft packs only; VIC, ACT and WA stage 2, PR 8b-i): this meeting's are decided
  // if due, then shown. NSW and Queensland packs record none, so nothing more is read for them.
  let pendingPanel: PendingPanelData | null = null;
  if (ruleSet.pendingResolutions) {
    try {
      await settleDuePendingResolutions({ meetingId });
    } catch (err) {
      logError("[meeting page] pending resolutions could not be decided:", err);
    }
    agendaItems = await getAgendaItemsForMeeting(meetingId);
    pendingPanel = await pendingPanelData({
      scheme: {
        id: scheme.id,
        timeZone: timeZoneOf(scheme),
        totalLots: scheme.totalLots ?? null,
        lots: scheme.lots.map((l) => ({ id: l.id, lotNumber: l.lotNumber, lotType: l.lotType })),
      },
      meetingId,
      itemLabels: new Map(agendaItems.map((a) => [a.id, `${a.position}. ${a.title}`])),
    });
  }
  const allowedCategories = allowedCategoriesForMeetingType(
    ruleSet,
    meeting.meetingType,
  );
  const categoryLabels = Object.fromEntries(
    Object.entries(ruleSet.resolutionLabels).map(([c, l]) => [c, l.short]),
  );
  const motionTypeLabels = Object.fromEntries(
    ruleSet.motionCategories.map((c) => [c, ruleSet.resolutionLabels[c]?.full ?? c]),
  );
  const motionTypeOptions = ruleSet.motionCategories.map((c) => ({
    value: c,
    label: ruleSet.resolutionLabels[c]?.choice ?? ruleSet.resolutionLabels[c]?.full ?? c,
  }));
  const terms = rulesForState(scheme.state).rules.TERMINOLOGY;
  // Where the meeting's votes are counted at conduct (a Queensland general
  // meeting): its lots and each item's poll and proxy choices. Null for NSW
  // and for a committee meeting.
  const conductVoting = conductVotingView(
    ruleSet,
    rulesForState(scheme.state).rules,
    scheme.lots.map((l) => ({ id: l.id, lotNumber: l.lotNumber, lotType: l.lotType })),
    agendaItems.map((a) => ({ id: a.id, resolutionCategory: a.resolutionCategory })),
    meeting.meetingType,
  );
  const evotingNotOffered = evotingNotOfferedReason(ruleSet, terms.jurisdictionShort);
  const canLoadTemplate = normalisedType
    ? getAgendaTemplate(scheme.state, normalisedType).length > 0
    : false;
  const agendaEditable = isBeforeNotice(String(meeting.status));

  // Notice context
  const notices = await getNoticesForMeeting(meetingId);
  const startIso = String(meeting.startTime ?? meeting.scheduledAt);
  const noticePeriod =
    normalisedType != null
      ? validateNoticePeriod(
          ruleSet,
          normalisedType as MeetingType,
          new Date(),
          new Date(startIso),
          meetingZone(meeting, timeZoneOf(scheme)),
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

  // Minutes context
  const minutesRows = await getMinutesForMeeting(meetingId);
  const latestMinutes = minutesRows[0] ?? null;
  const canAssembleMinutes =
    meeting.status === "MINUTES_DRAFT" && latestMinutes == null;
  const minutesBase = new Date(
    String(meeting.closedAt ?? meeting.startTime ?? meeting.scheduledAt),
  );
  const minutesDue =
    normalisedType != null
      ? minutesDistributionDeadline(
          ruleSet,
          normalisedType as MeetingType,
          minutesBase,
        )
      : null;
  const minutesDeadlineView =
    minutesDue != null
      ? {
          dueDate: minutesDue.toISOString(),
          overdue:
            new Date() > minutesDue && latestMinutes?.distributedAt == null,
        }
      : null;
  const minutesView = latestMinutes
    ? {
        state: latestMinutes.state,
        version: latestMinutes.version,
        confirmedAt: latestMinutes.confirmedAt
          ? String(latestMinutes.confirmedAt)
          : null,
        distributedAt: latestMinutes.distributedAt
          ? String(latestMinutes.distributedAt)
          : null,
        retentionUntil: latestMinutes.retentionUntil
          ? String(latestMinutes.retentionUntil)
          : null,
        content: (latestMinutes.content ?? {}) as Record<string, unknown>,
      }
    : null;

  // E-voting context
  const ballot = await getBallotForMeeting(meetingId);
  const ballotView = ballot
    ? {
        status: ballot.status,
        opensAt: String(ballot.opensAt),
        closesAt: String(ballot.closesAt),
        voteCount: ballot.votes.length,
      }
    : null;
  const canOpenBallot =
    !evotingNotOffered &&
    scheme.preMeetingEvotingAdopted &&
    agendaItems.length > 0 &&
    (meeting.status === "NOTICE_ISSUED" || meeting.status === "DRAFT") &&
    ballot == null;

  const scheduledDate = new Date(String(meeting.scheduledAt));
  // Shown in the meeting's own time zone (stored times are instants).
  const meetingTz = meetingZone(meeting, timeZoneOf(scheme));
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
        description={`${meetingTypeLabels[meeting.meetingType] ?? meeting.meetingType} · ${scheduledDate.toLocaleDateString("en-AU", { timeZone: meetingTz, weekday: "long", day: "numeric", month: "long", year: "numeric" })} at ${scheduledDate.toLocaleTimeString("en-AU", { timeZone: meetingTz, hour: "numeric", minute: "2-digit" })}`}
        backHref={`/adviser/schemes/${id}/meetings`}
        backLabel="Meetings"
      />

      {/* Status and quick stats */}
      <div className="flex items-center gap-3 mb-6">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[meeting.status] ?? "bg-gray-100 text-gray-700"}`}
        >
          {meetingStatusLabel(String(meeting.status))}
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
        categoryLabels={categoryLabels}
        canLoadTemplate={canLoadTemplate}
        editable={agendaEditable}
        terms={terms}
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
        fee={noticeFee}
        timeZone={meetingTz}
      />

      {/* Pre-meeting electronic voting, where the building's rule set has it */}
      {evotingNotOffered ? (
        <Card className="mb-6">
          <CardHeader title="Pre-meeting electronic voting" />
          <p className="text-sm text-ink-muted">{evotingNotOffered}</p>
        </Card>
      ) : (
        <EvotingSection
          schemeId={id}
          meetingId={meetingId}
          adopted={scheme.preMeetingEvotingAdopted}
          canOpen={canOpenBallot}
          ballot={ballotView}
          fee={ballotView ? null : await previewUsageFee({ code: "BALLOT" }, feeWordingFor(rulesForState(scheme.state).rules))}
          timeZone={meetingTz}
          adoptionCitation={needRule(rulesForState(scheme.state).rules, "CITATIONS").evotingAdoption}
          ownersCorporation={terms.ownersCorporation}
        />
      )}

      {/* Conduct */}
      <ConductSection
        schemeId={id}
        meetingId={meetingId}
        status={meeting.status}
        openedAt={meeting.openedAt ? String(meeting.openedAt) : null}
        closedAt={meeting.closedAt ? String(meeting.closedAt) : null}
        timeZone={meetingTz}
        items={agendaItems.map((a) => ({
          id: a.id,
          position: a.position,
          title: a.title,
          outcome: a.outcome,
        }))}
        voting={conductVoting}
        {...(ruleSet.pendingResolutions ? { outcomeLabels: { INTERIM: "Decided later", ...(ruleSet.pendingResolutions.VOTING_PERIOD ? { OPEN: "Voting open" } : {}) } } : {})}
      />

      {/* Resolutions decided later, where the building's rules record them */}
      {pendingPanel && (
        <PendingSection
          schemeId={id}
          meetingId={meetingId}
          items={pendingPanel.items}
          lots={pendingPanel.lots}
          specialMeetings={pendingPanel.specialMeetings}
        />
      )}

      {/* Minutes */}
      <MinutesSection
        schemeId={id}
        meetingId={meetingId}
        canAssemble={canAssembleMinutes}
        minutes={minutesView}
        deadline={minutesDeadlineView}
        timeZone={meetingTz}
      />

      {/* Motions */}
      <MotionSection
        schemeId={id}
        meetingId={meetingId}
        motions={meeting.motions}
        meetingStatus={meeting.status}
        currentProfileId={profile.id}
        motionTypeLabels={motionTypeLabels}
        motionTypeOptions={motionTypeOptions}
      />

      {/* Edit form: before notice, or while adjourned (a new time and place before the notice is issued again) */}
      {canEditDetails(String(meeting.status)) && (
        <div className="mb-6">
          <h2 className="font-heading font-semibold text-ink mb-4">
            Edit Meeting Details
          </h2>
          <MeetingForm
            mode="edit"
            schemeId={id}
            meetingId={meetingId}
            timeZone={timeZoneOf(scheme)}
            defaults={{
              title: meeting.title,
              meetingType: meeting.meetingType,
              scheduledAt: String(meeting.scheduledAt),
              endTime: meeting.endTime ? String(meeting.endTime) : null,
              timezone: meeting.timezone ? String(meeting.timezone) : null,
              location: meeting.location,
              agenda: meeting.agenda,
              format: meeting.format ?? null,
              joinUrl: meeting.joinUrl ?? null,
              joinDetails: meeting.joinDetails ?? null,
            }}
          />
        </div>
      )}

      {/* Status actions: cancel before notice; old SCHEDULED meetings can also be marked completed */}
      {isBeforeNotice(String(meeting.status)) && (
        <Card className="mb-6">
          <CardHeader
            title="Meeting Actions"
            description={meeting.status === "SCHEDULED" ? "Mark meeting as complete or cancel it." : "Cancel the meeting before its notice is issued."}
          />
          <div className="flex gap-3">
            {meeting.status === "SCHEDULED" && (
              <MeetingStatusButton
                schemeId={id}
                meetingId={meetingId}
                action="complete"
              />
            )}
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
