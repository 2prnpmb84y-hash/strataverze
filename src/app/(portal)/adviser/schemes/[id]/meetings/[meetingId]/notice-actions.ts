"use server";

import { revalidatePath } from "next/cache";
import { schemeTimeZone } from "@/lib/jurisdiction/scheme-time";
import { meetingZone } from "@/lib/jurisdiction/time-zone";
import { captureMeetingNotice } from "@/lib/vault/sources";
import { AuthorisationError } from "@/lib/auth/require-membership";
import { requireSchemeAccess } from "@/lib/auth/require-access";
import { getMeetingById, updateMeetingWhileStatus } from "@/lib/queries/meetings";
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

import { db } from "@/prisma/db";
import { assertUsageFeeConfirmed, captureUsageFee, hasFeeEvent } from "@/lib/billing/capture";
import { feeErrorMessage } from "@/lib/billing/disclosure";
import { isChargeableMeetingType } from "@/lib/billing/hook-codes";

class MeetingChangedMeanwhile extends Error {}

/** Whether the meeting still has the details the notice was drafted from. */
function sameNoticeDetails(now: Record<string, unknown>, then: Record<string, unknown>): boolean {
  const keys = ["title", "meetingType", "startTime", "scheduledAt", "timezone", "format", "location", "joinUrl", "joinDetails"];
  return keys.every((k) => String(now[k] ?? "") === String(then[k] ?? ""));
}

export type NoticeActionState = { error?: string; ok?: boolean };

export async function issueNoticeAction(
  schemeId: string,
  meetingId: string,
  feeConfirmedCents: number | null = null,
): Promise<NoticeActionState> {
  try {
    const { profile } = await requireSchemeAccess(schemeId, "governance.manage");

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

    // Check the StrataVerze meeting fee was confirmed before writing anything.
    const wasAdjourned = meeting.status === "ADJOURNED";
    const chargeAdjournment = wasAdjourned && type !== "COMMITTEE";
    const chargeMeeting = !chargeAdjournment && isChargeableMeetingType(type);
    if (
      chargeAdjournment ||
      (chargeMeeting &&
        !(await hasFeeEvent({ code: "MEETING_EGM", sourceType: "Meeting", sourceId: meetingId })))
    ) {
      await assertUsageFeeConfirmed({ code: "MEETING_EGM", confirmedCents: feeConfirmedCents, actorId: profile.id });
    }
    const startIso = String(meeting.startTime ?? meeting.scheduledAt);
    const ruleSet = await getActiveRuleSet(scheme.state);
    const validation = type
      ? validateNoticePeriod(ruleSet, type, new Date(), new Date(startIso), meetingZone(meeting, await schemeTimeZone(schemeId)))
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
    // Into the building's vault, if it has one (trial). Never fails this.
    await captureMeetingNotice(notice.id, profile.id);

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

    // Issue the meeting and record any StrataVerze meeting fee together.
    // EGMs are charged once per meeting; re-issuing the notice of an
    // adjourned general meeting is charged per adjournment. AGMs and committee
    // meetings are covered by the subscription.
    // Issue only if the meeting is as it was read: still in the same status
    // (not cancelled meanwhile) and with the same details the notice gives.
    // The status update holds the row, so an edit after this point waits and
    // then finds the notice issued.
    try {
      await db.transaction(async (tx) => {
        const changed = await updateMeetingWhileStatus(schemeId, meetingId, [String(meeting.status)], { status: "NOTICE_ISSUED" }, tx.orm);
        if (changed === 0) throw new MeetingChangedMeanwhile();
        const now = await tx.orm.public.Meeting.where((m) => m.id.eq(meetingId)).first();
        if (!now || !sameNoticeDetails(now, meeting)) throw new MeetingChangedMeanwhile();
        if (chargeAdjournment) {
          await captureUsageFee(tx.orm, {
            schemeId,
            code: "MEETING_EGM",
            sourceType: "MeetingAdjournmentNotice",
            sourceId: notice.id,
            actorId: profile.id,
            confirmedCents: feeConfirmedCents,
          });
        } else if (chargeMeeting) {
          await captureUsageFee(tx.orm, {
            schemeId,
            code: "MEETING_EGM",
            sourceType: "Meeting",
            sourceId: meetingId,
            actorId: profile.id,
            confirmedCents: feeConfirmedCents,
          });
        }
      });
    } catch (err) {
      if (!(err instanceof MeetingChangedMeanwhile)) throw err;
      // Nothing was issued: set aside the notice drafted from the old details.
      await db.orm.public.Notice.where((n) => n.id.eq(notice.id)).updateAndCount({ status: "SUPERSEDED" });
      return { error: "The meeting changed while the notice was being issued. Check its details and issue the notice again." };
    }
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
      timeZone: meetingZone(meeting, await schemeTimeZone(schemeId)),
      location: meeting.location ?? undefined,
      meetingId,
    }).catch(() => {});

    revalidatePath(`/adviser/schemes/${schemeId}/meetings/${meetingId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    const feeError = feeErrorMessage(err);
    if (feeError) return { error: feeError };
    return { error: "Failed to issue the notice. Please try again." };
  }
}
