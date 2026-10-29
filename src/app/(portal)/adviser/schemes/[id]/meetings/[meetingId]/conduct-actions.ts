"use server";

import { revalidatePath } from "next/cache";
import { AuthorisationError } from "@/lib/auth/require-membership";
import { requireSchemeAccess } from "@/lib/auth/require-access";
import { getMeetingById, updateMeeting } from "@/lib/queries/meetings";
import { getSchemeById } from "@/lib/queries/schemes";
import { getAgendaItem, updateAgendaItem } from "@/lib/queries/agenda";
import { getActiveRuleSet } from "@/lib/meetings/rule-set-repo";
import { recordMeetingEvent } from "@/lib/meetings/events";
import { canTransition } from "@/lib/meetings/lifecycle";
import { resolveOutcome, isOutcome, type Outcome } from "@/lib/meetings/conduct";
import {
  buildConductTally,
  countNeedsMemberBand,
  countsVotesAtMeeting,
  laterDecisionRefusal,
  notCountedNotice,
  outcomeDisagreement,
  parseChairVotes,
  uncategorisedRefusal,
  writtenVotesRefusal,
} from "@/lib/meetings/conduct-tally";
import { conductVotingData } from "@/lib/meetings/conduct-tally-repo";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { scheduleFor } from "@/lib/jurisdiction/building-data";
import { timeZoneOf } from "@/lib/jurisdiction/scheme-time";
import { dayIn } from "@/lib/jurisdiction/time-zone";
import type { MeetingRuleSet } from "@/lib/meetings/rules";

/** `notice`: what the chair is told after a save, such as votes not counted. */
export type ConductActionState = { error?: string; ok?: boolean; notice?: string };

function revalidate(schemeId: string, meetingId: string) {
  revalidatePath(`/adviser/schemes/${schemeId}/meetings/${meetingId}`);
}

export async function startMeetingAction(
  schemeId: string,
  meetingId: string,
): Promise<ConductActionState> {
  try {
    const { profile } = await requireSchemeAccess(schemeId, "governance.manage");
    const meeting = await getMeetingById(meetingId);
    if (!meeting || meeting.schemeId !== schemeId)
      return { error: "Meeting not found." };
    if (!canTransition(meeting.status, "IN_PROGRESS"))
      return {
        error: `The meeting cannot be started from ${meeting.status}. Issue the notice first.`,
      };

    await updateMeeting(schemeId, meetingId, {
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
    const { profile } = await requireSchemeAccess(schemeId, "governance.manage");
    const meeting = await getMeetingById(meetingId);
    if (!meeting || meeting.schemeId !== schemeId)
      return { error: "Meeting not found." };
    if (!canTransition(meeting.status, "MINUTES_DRAFT"))
      return { error: `The meeting cannot be finished from ${meeting.status}.` };

    await updateMeeting(schemeId, meetingId, {
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
  /**
   * Where the building counts votes at conduct (Queensland): each lot's vote
   * as the chair records it ({ lotId, vote, byProxy }). Ignored elsewhere.
   */
  votes?: unknown,
  /** Whether a poll was asked for on the item. Ignored where votes are not counted. */
  poll?: unknown,
): Promise<ConductActionState> {
  try {
    const { profile } = await requireSchemeAccess(schemeId, "governance.manage");
    if (!isOutcome(requestedOutcome))
      return { error: "Invalid outcome." };

    const [meeting, item, scheme] = await Promise.all([
      getMeetingById(meetingId),
      getAgendaItem(meetingId, itemId),
      getSchemeById(schemeId),
    ]);
    if (!meeting || meeting.schemeId !== schemeId || !item || !scheme)
      return { error: "Agenda item not found." };
    if (meeting.status !== "IN_PROGRESS")
      return { error: "Outcomes can only be recorded while the meeting is running." };

    const ruleSet = await getActiveRuleSet(scheme.state);
    // A draft pack's general meeting: an item with no category cannot be
    // recorded as resolved, as nothing counts it. Never refused for NSW or Queensland.
    const uncategorised = uncategorisedRefusal(ruleSet, item.resolutionCategory, requestedOutcome, meeting.meetingType);
    if (uncategorised) return { error: uncategorised };
    // Queensland general meetings: the outcome is checked against the count
    // of the votes. A deferral needs no count, and a committee meeting is
    // decided by its members. NSW counts nothing here and goes on as before.
    if (requestedOutcome !== "DEFERRED" && countsVotesAtMeeting(ruleSet, meeting.meetingType)) {
      return await recordCountedOutcome({
        actorId: profile.id,
        schemeId,
        meetingId,
        meeting,
        item,
        scheme,
        ruleSet,
        requestedOutcome,
        votes,
        poll,
      });
    }
    const result = resolveOutcome(ruleSet, {
      requestedOutcome,
      resolutionCategory: item.resolutionCategory,
    });

    await updateAgendaItem(meetingId, itemId, {
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

/**
 * Record an outcome where the building counts the votes (QLD stage 2,
 * resolution tallies, 27 Oct 2026): the tally is built from the formal online
 * votes and the chair's votes, with the building's totals, and passed to
 * resolveOutcome. An outcome the count does not give is refused, and nothing
 * is written. The votes, the tally and the result go in the meeting event.
 */
async function recordCountedOutcome(p: {
  actorId: string;
  schemeId: string;
  meetingId: string;
  meeting: { startTime?: unknown; scheduledAt?: unknown };
  item: { id: string; resolutionCategory: string | null };
  scheme: {
    id: string;
    state: string;
    timeZone: string | null;
    totalLots: number | null;
    lots: readonly {
      id: string;
      lotNumber: string;
      entitlement: number | null;
      interestScheduleEntitlement?: number | null;
      lotEntitlement?: number | null;
      lotType?: string | null;
    }[];
  };
  ruleSet: MeetingRuleSet;
  requestedOutcome: Outcome;
  votes: unknown;
  poll: unknown;
}): Promise<ConductActionState> {
  // Decided on written votes, which are not recorded yet: refused before anything is read.
  const written = writtenVotesRefusal(p.ruleSet, p.item.resolutionCategory, p.requestedOutcome);
  if (written) return { error: written };
  // Decided when its voting period closes (Western Australia): refused before anything is read.
  const later = laterDecisionRefusal(p.ruleSet, p.item.resolutionCategory, p.requestedOutcome);
  if (later) return { error: later };
  // Every lot of the building, as read with it. Its type lets a draft pack leave common property rows out.
  const lots = p.scheme.lots.map((l) => ({
    id: l.id,
    lotNumber: String(l.lotNumber),
    entitlement: l.entitlement ?? null,
    interestScheduleEntitlement: l.interestScheduleEntitlement ?? null,
    lotEntitlement: l.lotEntitlement ?? null,
    lotType: l.lotType ?? null,
  }));
  const chairVotes = parseChairVotes(p.votes, lots.length);
  if (!chairVotes || (p.poll != null && typeof p.poll !== "boolean")) {
    return { error: "The votes sent could not be read. Reload the page and record them again." };
  }
  const { rules } = rulesForState(p.scheme.state);
  // Debts are judged on the meeting's date in the building's time zone.
  const meetingDay = dayIn(timeZoneOf(p.scheme), String(p.meeting.startTime ?? p.meeting.scheduledAt));
  const data = await conductVotingData({
    ruleSet: p.ruleSet,
    scheme: p.scheme,
    lots,
    meetingId: p.meetingId,
    meetingDay,
    itemId: p.item.id,
    category: p.item.resolutionCategory,
    // The band of members, read only where the item's test depends on it (the ACT).
    ...(p.ruleSet.memberBandSelector && countNeedsMemberBand(p.ruleSet, p.item.resolutionCategory)
      ? { memberBandSelector: p.ruleSet.memberBandSelector }
      : {}),
  });
  const count = buildConductTally({
    ruleSet: p.ruleSet,
    rules,
    category: p.item.resolutionCategory,
    lots,
    recordedLotCount: p.scheme.totalLots ?? null,
    onlineVotes: data.onlineVotes,
    chairVotes,
    poll: p.poll === true,
    owingLotIds: data.owingLotIds,
    ...(data.memberBand !== undefined ? { memberBand: data.memberBand } : {}),
  });
  if (!count.ok) return { error: count.error };

  const { tally, counted, notCounted } = count.value;
  const result = resolveOutcome(p.ruleSet, {
    requestedOutcome: p.requestedOutcome,
    resolutionCategory: p.item.resolutionCategory,
    tally,
    // A poll is counted by the entitlement the pack names (the chair is told it by name).
    ...(tally?.poll ? { pollEntitlement: scheduleFor(rules, "POLL_VOTE").name } : {}),
  });
  // Neither carried nor lost (an interim resolution, or one the count cannot decide): nothing is written.
  if (result.refused) return { error: result.refused };
  const disagreement = outcomeDisagreement(p.requestedOutcome, result);
  if (disagreement) return { error: disagreement };

  await updateAgendaItem(p.meetingId, p.item.id, {
    outcome: result.outcome,
    status: result.status,
  });
  await recordMeetingEvent({
    meetingId: p.meetingId,
    actorId: p.actorId,
    eventType: "AGENDA_OUTCOME_RECORDED",
    payload: {
      itemId: p.item.id,
      outcome: result.outcome,
      votes: counted,
      notCounted,
      tally,
      evaluation: result.evaluation ?? null,
    },
  });
  revalidate(p.schemeId, p.meetingId);
  const notice = notCountedNotice(notCounted, rules.TERMINOLOGY.ownersCorporation);
  return notice ? { ok: true, notice } : { ok: true };
}

export async function addConductNoteAction(
  schemeId: string,
  meetingId: string,
  itemId: string,
  note: string,
): Promise<ConductActionState> {
  try {
    const { profile } = await requireSchemeAccess(schemeId, "governance.manage");
    const trimmed = note.trim();
    if (!trimmed) return { error: "Note is empty." };

    const meeting = await getMeetingById(meetingId);
    if (!meeting || meeting.schemeId !== schemeId)
      return { error: "Meeting not found." };
    if (itemId && !(await getAgendaItem(meetingId, itemId)))
      return { error: "Agenda item not found." };

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
