"use server";

import { revalidatePath } from "next/cache";
import { AuthorisationError } from "@/lib/auth/require-membership";
import { requireSchemeAccess } from "@/lib/auth/require-access";
import { getMeetingById, updateMeeting } from "@/lib/queries/meetings";
import {
  getSchemeById,
  getSchemeNameById,
  getMemberEmailsForScheme,
} from "@/lib/queries/schemes";
import { getAgendaItemsForMeeting } from "@/lib/queries/agenda";
import {
  createMinutes,
  getLatestMinutes,
  getMinutesForMeeting,
  updateMinutes,
} from "@/lib/queries/minutes";
import { getActiveRuleSet } from "@/lib/meetings/rule-set-repo";
import { assembleMinutesContent, retentionUntil } from "@/lib/meetings/minutes";
import { recordMeetingEvent } from "@/lib/meetings/events";
import { canTransition } from "@/lib/meetings/lifecycle";
import { notifyMeetingScheduled } from "@/lib/notifications";

export type MinutesActionState = { error?: string; ok?: boolean };

function revalidate(schemeId: string, meetingId: string) {
  revalidatePath(`/adviser/schemes/${schemeId}/meetings/${meetingId}`);
}

export async function assembleMinutesAction(
  schemeId: string,
  meetingId: string,
): Promise<MinutesActionState> {
  try {
    const { profile } = await requireSchemeAccess(schemeId, "governance.manage");
    const [meeting, scheme, items, existing] = await Promise.all([
      getMeetingById(meetingId),
      getSchemeById(schemeId),
      getAgendaItemsForMeeting(meetingId),
      getMinutesForMeeting(meetingId),
    ]);
    if (!meeting || !scheme || meeting.schemeId !== schemeId)
      return { error: "Meeting not found." };

    const confirmed = existing.find((m) => m.state === "CONFIRMED");
    if (confirmed)
      return { error: "The minutes have already been confirmed." };

    const content = assembleMinutesContent({
      scheme: { name: scheme.name, planNumber: scheme.planNumber },
      meeting: {
        title: meeting.title,
        meetingType: meeting.meetingType,
        startTime: String(meeting.startTime ?? meeting.scheduledAt),
        openedAt: meeting.openedAt ? String(meeting.openedAt) : null,
        closedAt: meeting.closedAt ? String(meeting.closedAt) : null,
      },
      items: items.map((a) => ({
        position: a.position,
        title: a.title,
        resolutionText: a.resolutionText,
        explanatoryNote: a.explanatoryNote,
        outcome: a.outcome,
      })),
    });

    const version = (existing[0]?.version ?? 0) + 1;
    await createMinutes({
      meetingId,
      version,
      state: "DRAFT",
      content,
      preparedById: profile.id,
    });
    await recordMeetingEvent({
      meetingId,
      actorId: profile.id,
      eventType: "MINUTES_DRAFTED",
      payload: { version },
    });
    revalidate(schemeId, meetingId);
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to assemble the minutes." };
  }
}

export async function confirmMinutesAction(
  schemeId: string,
  meetingId: string,
): Promise<MinutesActionState> {
  try {
    const { profile } = await requireSchemeAccess(schemeId, "governance.manage");
    const [meeting, latest] = await Promise.all([
      getMeetingById(meetingId),
      getLatestMinutes(meetingId),
    ]);
    if (!meeting || meeting.schemeId !== schemeId)
      return { error: "Meeting not found." };
    if (!latest) return { error: "There are no minutes to confirm." };
    if (latest.state === "CONFIRMED")
      return { error: "The minutes are already confirmed." };

    await updateMinutes(meetingId, latest.id, {
      state: "CONFIRMED",
      confirmedAt: new Date().toISOString(),
      confirmedById: profile.id,
    });
    await recordMeetingEvent({
      meetingId,
      actorId: profile.id,
      eventType: "MINUTES_CONFIRMED",
      payload: { version: latest.version },
    });
    revalidate(schemeId, meetingId);
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to confirm the minutes." };
  }
}

export async function publishMinutesAction(
  schemeId: string,
  meetingId: string,
): Promise<MinutesActionState> {
  try {
    const { profile } = await requireSchemeAccess(schemeId, "governance.manage");
    const [meeting, scheme, latest] = await Promise.all([
      getMeetingById(meetingId),
      getSchemeById(schemeId),
      getLatestMinutes(meetingId),
    ]);
    if (!meeting || !scheme || meeting.schemeId !== schemeId)
      return { error: "Meeting not found." };
    if (!latest) return { error: "There are no minutes to publish." };
    if (latest.state !== "CONFIRMED")
      return { error: "Confirm the minutes before publishing." };
    if (!canTransition(meeting.status, "PUBLISHED"))
      return { error: `The meeting cannot be published from ${meeting.status}.` };

    const ruleSet = await getActiveRuleSet(scheme.state);
    const base = new Date(
      String(meeting.closedAt ?? meeting.startTime ?? meeting.scheduledAt),
    );
    const retention = retentionUntil(ruleSet, base);

    await updateMinutes(meetingId, latest.id, {
      distributedAt: new Date().toISOString(),
      retentionUntil: retention.toISOString().slice(0, 10),
    });
    await updateMeeting(schemeId, meetingId, { status: "PUBLISHED" });
    await recordMeetingEvent({
      meetingId,
      actorId: profile.id,
      eventType: "MINUTES_PUBLISHED",
      payload: { version: latest.version },
    });

    const schemeName = await getSchemeNameById(schemeId);
    const memberEmails = await getMemberEmailsForScheme(schemeId);
    notifyMeetingScheduled({
      recipientEmails: memberEmails,
      schemeName,
      meetingTitle: `Minutes: ${meeting.title}`,
      meetingType: meeting.meetingType,
      scheduledAt: new Date(String(meeting.startTime ?? meeting.scheduledAt)),
      location: meeting.location ?? undefined,
      meetingId,
    }).catch(() => {});

    revalidate(schemeId, meetingId);
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to publish the minutes." };
  }
}
