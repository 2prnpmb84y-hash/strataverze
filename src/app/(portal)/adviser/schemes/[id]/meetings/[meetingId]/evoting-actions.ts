"use server";

import { revalidatePath } from "next/cache";
import { AuthorisationError } from "@/lib/auth/require-membership";
import { requireSchemeAccess } from "@/lib/auth/require-access";
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
  evotingNotOfferedReason,
  tallyElectronicVotes,
  validateCanOpenBallot,
} from "@/lib/meetings/evoting";
import { evaluateResolution, type MeetingType, type ResolutionCategory } from "@/lib/meetings/rules";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { resolveOutcome } from "@/lib/meetings/conduct";
import { normaliseMeetingType } from "@/lib/meetings/setup";
import { recordMeetingEvent } from "@/lib/meetings/events";
import { isPendingItem } from "@/lib/meetings/pending";

import { db } from "@/prisma/db";
import { captureUsageFee } from "@/lib/billing/capture";
import { feeErrorMessage } from "@/lib/billing/disclosure";

export type EvotingActionState = { error?: string; ok?: boolean };

function revalidate(schemeId: string, meetingId: string) {
  revalidatePath(`/adviser/schemes/${schemeId}/meetings/${meetingId}`);
}

export async function openBallotAction(
  schemeId: string,
  meetingId: string,
  feeConfirmedCents: number | null = null,
): Promise<EvotingActionState> {
  try {
    const { profile } = await requireSchemeAccess(schemeId, "governance.manage");
    const [meeting, scheme, existing] = await Promise.all([
      getMeetingById(meetingId),
      getSchemeById(schemeId),
      getBallotForMeeting(meetingId),
    ]);
    if (!meeting || !scheme || meeting.schemeId !== schemeId)
      return { error: "Meeting not found." };
    if (existing) return { error: "A ballot already exists for this meeting." };

    // Refused before any write where the building's rule set has no
    // pre-meeting e-voting (Queensland).
    const ruleSet = await getActiveRuleSet(scheme.state);
    const notOffered = evotingNotOfferedReason(
      ruleSet,
      rulesForState(scheme.state).rules.TERMINOLOGY.jurisdictionShort,
    );
    if (notOffered) return { error: notOffered };

    const blocked = validateCanOpenBallot({
      adopted: scheme.preMeetingEvotingAdopted,
      meetingStatus: meeting.status,
      ownersCorporation: rulesForState(scheme.state).rules.TERMINOLOGY.ownersCorporation,
    });
    if (blocked) return { error: blocked };

    const type = normaliseMeetingType(meeting.meetingType) as MeetingType | null;
    if (!type) return { error: "Unsupported meeting type." };
    const start = new Date(String(meeting.startTime ?? meeting.scheduledAt));
    const window = computeBallotWindow(ruleSet, type, start);

    await db.transaction(async (tx) => {
      const ballot = await createBallot(
        {
          meetingId,
          opensAt: window.opensAt.toISOString(),
          closesAt: window.closesAt.toISOString(),
          createdById: profile.id,
        },
        tx.orm,
      );
      await captureUsageFee(tx.orm, {
        schemeId,
        code: "BALLOT",
        sourceType: "ElectronicBallot",
        sourceId: ballot.id,
        actorId: profile.id,
        confirmedCents: feeConfirmedCents,
      });
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
    const feeError = feeErrorMessage(err);
    if (feeError) return { error: feeError };
    return { error: "Failed to open the ballot." };
  }
}

export async function closeBallotAction(
  schemeId: string,
  meetingId: string,
): Promise<EvotingActionState> {
  try {
    const { profile } = await requireSchemeAccess(schemeId, "governance.manage");
    const [meeting, scheme, ballot, items] = await Promise.all([
      getMeetingById(meetingId),
      getSchemeById(schemeId),
      getBallotForMeeting(meetingId),
      getAgendaItemsForMeeting(meetingId),
    ]);
    if (!meeting || !scheme || meeting.schemeId !== schemeId)
      return { error: "Meeting not found." };
    if (!ballot) return { error: "There is no ballot to close." };
    if (ballot.status === "CLOSED")
      return { error: "The ballot is already closed." };

    const ruleSet = await getActiveRuleSet(scheme.state);
    const votes = await getVotesForBallot(ballot.id);

    // Determine the result per agenda item from the formal votes.
    const results: { itemId: string; outcome: string }[] = [];
    for (const item of items) {
      // An item decided later (INTERIM, or OPEN from PR 8b-ii; only ever under a draft pack, by its stored status)
      // is never written by a ballot (review, low (a)). NSW and Queensland items are never stored so.
      if (isPendingItem(item)) continue;
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
        // An item's category the rule set does not have is evaluated as lost.
        const evaluation = evaluateResolution(
          ruleSet,
          item.resolutionCategory as ResolutionCategory,
          tally,
        );
        // Neither carried nor lost (a draft pack's interim or undecided result; never NSW): not written.
        if (evaluation.result) continue;
        const outcome = resolveOutcome(ruleSet, {
          requestedOutcome: evaluation.passed ? "RESOLVED" : "MOTION_LOST",
          resolutionCategory: item.resolutionCategory,
        });
        await updateAgendaItem(meetingId, item.id, {
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
