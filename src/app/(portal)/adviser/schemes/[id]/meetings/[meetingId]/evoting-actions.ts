"use server";

import { revalidatePath } from "next/cache";
import {
  requireSchemeMembership,
  AuthorisationError,
} from "@/lib/auth/require-membership";
import { getMeetingById } from "@/lib/queries/meetings";
import { getSchemeById } from "@/lib/queries/schemes";
import { getAgendaItemsForMeeting, updateAgendaItem } from "@/lib/queries/agenda";
import {
  createBallot,
  getBallotForMeeting,
  closeBallot,
  getVotesForBallot,
} from "@/lib/queries/evoting";
import { getActiveRuleSet } from "@/lib/meetings/rule-set-repo";
import {
  computeBallotWindow,
  tallyElectronicVotes,
  validateCanOpenBallot,
} from "@/lib/meetings/evoting";
import { evaluateResolution, type MeetingType } from "@/lib/meetings/rules";
import { resolveOutcome } from "@/lib/meetings/conduct";
import { normaliseMeetingType } from "@/lib/meetings/setup";
import { recordMeetingEvent } from "@/lib/meetings/events";

export type EvotingActionState = { error?: string; ok?: boolean };

function revalidate(schemeId: string, meetingId: string) {
  revalidatePath(`/adviser/schemes/${schemeId}/meetings/${meetingId}`);
}

export async function openBallotAction(
  schemeId: string,
  meetingId: string,
): Promise<EvotingActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const [meeting, scheme, existing] = await Promise.all([
      getMeetingById(meetingId),
      getSchemeById(schemeId),
      getBallotForMeeting(meetingId),
    ]);
    if (!meeting || !scheme || meeting.schemeId !== schemeId)
      return { error: "Meeting not found." };
    if (existing) return { error: "A ballot already exists for this meeting." };

    const blocked = validateCanOpenBallot({
      adopted: scheme.preMeetingEvotingAdopted,
      meetingStatus: meeting.status,
    });
    if (blocked) return { error: blocked };

    const type = normaliseMeetingType(meeting.meetingType) as MeetingType | null;
    if (!type) return { error: "Unsupported meeting type." };
    const ruleSet = await getActiveRuleSet(scheme.state);
    const start = new Date(String(meeting.startTime ?? meeting.scheduledAt));
    const window = computeBallotWindow(ruleSet, type, start);

    await createBallot({
      meetingId,
      opensAt: window.opensAt.toISOString(),
      closesAt: window.closesAt.toISOString(),
      createdById: profile.id,
    });
    await recordMeetingEvent({
      meetingId,
      actorId: profile.id,
      eventType: "BALLOT_OPENED",
      payload: {
        opensAt: window.opensAt.toISOString(),
        closesAt: window.closesAt.toISOString(),
      },
    });
    revalidate(schemeId, meetingId);
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to open the ballot." };
  }
}

export async function closeBallotAction(
  schemeId: string,
  meetingId: string,
): Promise<EvotingActionState> {
  try {
    const { profile } = await requireSchemeMembership(schemeId, ["ADVISER"]);
    const [meeting, scheme, ballot, items] = await Promise.all([
      getMeetingById(meetingId),
      getSchemeById(schemeId),
      getBallotForMeeting(meetingId),
      getAgendaItemsForMeeting(meetingId),
    ]);
    if (!meeting || !scheme) return { error: "Meeting not found." };
    if (!ballot) return { error: "There is no ballot to close." };
    if (ballot.status === "CLOSED")
      return { error: "The ballot is already closed." };

    const ruleSet = await getActiveRuleSet(scheme.state);
    const votes = await getVotesForBallot(ballot.id);

    // Determine the result per agenda item from the formal votes.
    const results: { itemId: string; outcome: string }[] = [];
    for (const item of items) {
      const itemVotes = votes
        .filter((v) => v.agendaItemId === item.id)
        .map((v) => ({
          voteValue: v.voteValue,
          unitEntitlement: v.unitEntitlement,
          isInformal: v.isInformal,
        }));
      if (itemVotes.length === 0) continue;

      const tally = tallyElectronicVotes(itemVotes);
      if (item.resolutionCategory) {
        const evaluation = evaluateResolution(
          ruleSet,
          item.resolutionCategory as
            | "ORDINARY"
            | "SPECIAL"
            | "UNANIMOUS"
            | "SUSTAINABILITY_INFRASTRUCTURE",
          tally,
        );
        const outcome = resolveOutcome(ruleSet, {
          requestedOutcome: evaluation.passed ? "RESOLVED" : "MOTION_LOST",
          resolutionCategory: item.resolutionCategory,
        });
        await updateAgendaItem(item.id, {
          outcome: outcome.outcome,
          status: outcome.status,
        });
        results.push({ itemId: item.id, outcome: outcome.outcome });
      }
    }

    await closeBallot(ballot.id);
    await recordMeetingEvent({
      meetingId,
      actorId: profile.id,
      eventType: "BALLOT_CLOSED",
      payload: { results },
    });
    revalidate(schemeId, meetingId);
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to close the ballot." };
  }
}
