"use server";

import { revalidatePath } from "next/cache";
import {
  requireSchemeMembership,
  AuthorisationError,
} from "@/lib/auth/require-membership";
import { getMeetingById, updateMeeting } from "@/lib/queries/meetings";
import { getSchemeById } from "@/lib/queries/schemes";
import { getAgendaItem, updateAgendaItem } from "@/lib/queries/agenda";
import { getActiveRuleSet } from "@/lib/meetings/rule-set-repo";
import { recordMeetingEvent } from "@/lib/meetings/events";
import { canTransition } from "@/lib/meetings/lifecycle";
import { resolveOutcome, isOutcome } from "@/lib/meetings/conduct";

export type ConductActionState = { error?: string; ok?: boolean };

function revalidate(schemeId: string, meetingId: string) {
  revalidatePath(`/adviser/schemes/${schemeId}/meetings/${meetingId}`);
}

export async function startMeetingAction(
  schemeId: string,
  meetingId: string,
): Promise<ConductActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const meeting = await getMeetingById(meetingId);
    if (!meeting || meeting.schemeId !== schemeId)
      return { error: "Meeting not found." };
    if (!canTransition(meeting.status, "IN_PROGRESS"))
      return {
        error: `The meeting cannot be started from ${meeting.status}. Issue the notice first.`,
      };

    await updateMeeting(meetingId, {
      status: "IN_PROGRESS",
      openedAt: new Date().toISOString(),
    });
    await recordMeetingEvent({
      meetingId,
      actorId: profile.id,
      eventType: "MEETING_OPENED",
    });
    revalidate(schemeId, meetingId);
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to start the meeting." };
  }
}

export async function finishMeetingAction(
  schemeId: string,
  meetingId: string,
): Promise<ConductActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const meeting = await getMeetingById(meetingId);
    if (!meeting || meeting.schemeId !== schemeId)
      return { error: "Meeting not found." };
    if (!canTransition(meeting.status, "MINUTES_DRAFT"))
      return { error: `The meeting cannot be finished from ${meeting.status}.` };

    await updateMeeting(meetingId, {
      status: "MINUTES_DRAFT",
      closedAt: new Date().toISOString(),
    });
    await recordMeetingEvent({
      meetingId,
      actorId: profile.id,
      eventType: "MEETING_CLOSED",
    });
    revalidate(schemeId, meetingId);
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to finish the meeting." };
  }
}

export async function recordAgendaOutcomeAction(
  schemeId: string,
  meetingId: string,
  itemId: string,
  requestedOutcome: string,
): Promise<ConductActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    if (!isOutcome(requestedOutcome))
      return { error: "Invalid outcome." };

    const [meeting, item, scheme] = await Promise.all([
      getMeetingById(meetingId),
      getAgendaItem(meetingId, itemId),
      getSchemeById(schemeId),
    ]);
    if (!meeting || !item || !scheme) return { error: "Agenda item not found." };
    if (meeting.status !== "IN_PROGRESS")
      return { error: "Outcomes can only be recorded while the meeting is running." };

    const ruleSet = await getActiveRuleSet(scheme.state);
    const result = resolveOutcome(ruleSet, {
      requestedOutcome,
      resolutionCategory: item.resolutionCategory,
    });

    await updateAgendaItem(itemId, {
      outcome: result.outcome,
      status: result.status,
    });
    await recordMeetingEvent({
      meetingId,
      actorId: profile.id,
      eventType: "AGENDA_OUTCOME_RECORDED",
      payload: { itemId, outcome: result.outcome },
    });
    revalidate(schemeId, meetingId);
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to record the outcome." };
  }
}

export async function addConductNoteAction(
  schemeId: string,
  meetingId: string,
  itemId: string,
  note: string,
): Promise<ConductActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const trimmed = note.trim();
    if (!trimmed) return { error: "Note is empty." };

    const meeting = await getMeetingById(meetingId);
    if (!meeting || meeting.schemeId !== schemeId)
      return { error: "Meeting not found." };

    await recordMeetingEvent({
      meetingId,
      actorId: profile.id,
      eventType: "AGENDA_NOTE",
      payload: { itemId, note: trimmed },
    });
    revalidate(schemeId, meetingId);
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to add the note." };
  }
}
