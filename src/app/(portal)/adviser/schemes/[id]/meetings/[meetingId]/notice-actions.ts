"use server";

import { revalidatePath } from "next/cache";
import {
  requireSchemeMembership,
  AuthorisationError,
} from "@/lib/auth/require-membership";
import { getMeetingById, updateMeeting } from "@/lib/queries/meetings";
import {
  getSchemeById,
  getSchemeNameById,
  getMemberEmailsForScheme,
} from "@/lib/queries/schemes";
import { getAgendaItemsForMeeting } from "@/lib/queries/agenda";
import {
  createNotice,
  getLatestNoticeVersion,
  supersedeNotices,
  createNoticeRecipient,
} from "@/lib/queries/notice";
import { getActiveRuleSet } from "@/lib/meetings/rule-set-repo";
import { validateNoticePeriod, type MeetingType } from "@/lib/meetings/rules";
import { normaliseMeetingType } from "@/lib/meetings/setup";
import { assembleNoticeContent } from "@/lib/meetings/notice";
import { recordMeetingEvent } from "@/lib/meetings/events";
import { canTransition } from "@/lib/meetings/lifecycle";
import { notifyMeetingScheduled } from "@/lib/notifications";

export type NoticeActionState = { error?: string; ok?: boolean };

export async function issueNoticeAction(
  schemeId: string,
  meetingId: string,
): Promise<NoticeActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);

    const [meeting, scheme, items] = await Promise.all([
      getMeetingById(meetingId),
      getSchemeById(schemeId),
      getAgendaItemsForMeeting(meetingId),
    ]);
    if (!meeting || !scheme || meeting.schemeId !== schemeId)
      return { error: "Meeting not found." };

    if (items.length === 0)
      return {
        error: "Add at least one agenda item before issuing the notice.",
      };

    if (!canTransition(meeting.status, "NOTICE_ISSUED"))
      return {
        error: `A notice cannot be issued while the meeting is ${meeting.status}.`,
      };

    const type = normaliseMeetingType(meeting.meetingType) as MeetingType | null;
    const startIso = String(meeting.startTime ?? meeting.scheduledAt);
    const ruleSet = await getActiveRuleSet(scheme.state);
    const validation = type
      ? validateNoticePeriod(ruleSet, type, new Date(), new Date(startIso))
      : { requiredDays: null, actualDays: 0, compliant: true };

    const content = assembleNoticeContent({
      scheme: {
        name: scheme.name,
        planNumber: scheme.planNumber,
        address: scheme.address,
        suburb: scheme.suburb,
        state: scheme.state,
        postcode: scheme.postcode,
      },
      meeting: {
        title: meeting.title,
        meetingType: meeting.meetingType,
        startTime: startIso,
        format: meeting.format,
        location: meeting.location,
        joinUrl: meeting.joinUrl,
        joinDetails: meeting.joinDetails,
        timezone: meeting.timezone,
      },
      items: items.map((a) => ({
        position: a.position,
        title: a.title,
        resolutionText: a.resolutionText,
        explanatoryNote: a.explanatoryNote,
        resolutionCategory: a.resolutionCategory,
      })),
    });

    const prior = await getLatestNoticeVersion(meetingId);
    if (prior > 0) await supersedeNotices(meetingId);
    const version = prior + 1;

    const notice = await createNotice({
      meetingId,
      version,
      issuedById: profile.id,
      noticePeriodDays: validation.requiredDays,
      compliant: validation.compliant,
      content,
    });

    // Recipients from the active scheme membership (owners and committee).
    const sentAt = new Date().toISOString();
    const recipients = scheme.memberships.filter((m) => m.profile?.email);
    for (const m of recipients) {
      await createNoticeRecipient({
        noticeId: notice.id,
        profileId: m.profileId,
        name: m.profile
          ? `${m.profile.firstName} ${m.profile.lastName}`.trim()
          : null,
        email: m.profile?.email ?? null,
        method: "EMAIL",
        deliveryOutcome: "SENT",
        sentAt,
      });
    }

    await updateMeeting(meetingId, { status: "NOTICE_ISSUED" });
    await recordMeetingEvent({
      meetingId,
      actorId: profile.id,
      eventType: "NOTICE_ISSUED",
      payload: {
        version,
        compliant: validation.compliant,
        recipientCount: recipients.length,
      },
    });

    // Dispatch the notice email via the existing path (non-blocking).
    const schemeName = await getSchemeNameById(schemeId);
    const memberEmails = await getMemberEmailsForScheme(schemeId);
    notifyMeetingScheduled({
      recipientEmails: memberEmails,
      schemeName,
      meetingTitle: meeting.title,
      meetingType: meeting.meetingType,
      scheduledAt: new Date(startIso),
      location: meeting.location ?? undefined,
      meetingId,
    }).catch(() => {});

    revalidatePath(`/adviser/schemes/${schemeId}/meetings/${meetingId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to issue the notice. Please try again." };
  }
}
