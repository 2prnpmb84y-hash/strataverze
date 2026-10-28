"use server";

import { revalidatePath } from "next/cache";
import { normaliseMeetingType } from "@/lib/meetings/setup";
import { requireAuth, AuthorisationError } from "@/lib/auth/require-membership";
import { requireSchemeAccess } from "@/lib/auth/require-access";
import { castVote, getMotionById, VOTE_VALUES } from "@/lib/queries/motions";
import { getMeetingById } from "@/lib/queries/meetings";
import { getAgendaItem } from "@/lib/queries/agenda";
import { getBallotForMeeting, castElectronicVote } from "@/lib/queries/evoting";
import { isBallotOpen, isInformalVote } from "@/lib/meetings/evoting";
import { isOpenForVoting } from "@/lib/meetings/lifecycle";
import { debtorVoteCheck, debtorVoteProblem } from "@/lib/meetings/debtor-voting-repo";
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";

/** Motion statuses an owner can vote on. */
const OPEN_MOTION_STATUSES = ["OPEN", "PROPOSED"];

function isVoteValue(value: unknown): value is (typeof VOTE_VALUES)[number] {
  return typeof value === "string" && (VOTE_VALUES as readonly string[]).includes(value);
}

/**
 * The caller's active OWNER memberships on the scheme that are tied to a lot.
 * Requires the governance.vote.owner capability (security review F8): a
 * supplier, accountant or adviser membership is not a vote.
 */
async function ownerLotMemberships(schemeId: string) {
  const { profile } = await requireSchemeAccess(schemeId, "governance.vote.owner");
  const memberships = await db.orm.public.SchemeMembership
    .where((m) =>
      and(
        m.schemeId.eq(schemeId),
        m.profileId.eq(profile.id),
        m.isActive.eq(true),
        m.role.eq("OWNER"),
      ),
    )
    .limit(50)
    .all();
  const withLot = memberships.filter((m) => !!m.lotId);
  return { profile, memberships: withLot };
}

export async function castVoteAction(motionId: string, voteValue: string) {
  try {
    await requireAuth();
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    throw err;
  }

  if (!isVoteValue(voteValue)) {
    return { error: "Invalid vote value." };
  }

  try {
    // The motion must belong to a live meeting of its scheme and be open.
    // The voter must hold an OWNER membership with a lot on that scheme.
    const motion = await getMotionById(motionId);
    if (!motion || !motion.meetingId) {
      return { error: "Motion not found." };
    }

    // Only an owner of a lot on this scheme may vote.
    const { profile, memberships } = await ownerLotMemberships(motion.schemeId);
    if (memberships.length === 0) {
      return { error: "You are not recorded as an owner of a lot in this scheme." };
    }

    const meetingId = motion.meetingId;
    const meeting = await getMeetingById(meetingId);
    if (!meeting || meeting.schemeId !== motion.schemeId) {
      return { error: "Motion not found." };
    }
    // Not before the notice is out, and not once the meeting has closed.
    if (!OPEN_MOTION_STATUSES.includes(motion.status) || !isOpenForVoting(String(meeting.status))) {
      return { error: "This motion is not open for voting." };
    }
    // Owners vote at general meetings. Committee motions are voted on by the
    // committee through the governance actions.
    if (normaliseMeetingType(String(meeting.meetingType)) === "COMMITTEE") {
      return { error: "This motion is voted on by the committee." };
    }

    // One vote per lot: if a co-owner of every one of the caller's lots has
    // already voted on this motion, the lot's vote has been cast.
    const lotIds = [...new Set(memberships.map((m) => m.lotId as string))];
    const coOwners = await db.orm.public.SchemeMembership
      .where((m) =>
        and(
          m.schemeId.eq(motion.schemeId),
          m.lotId.in(lotIds),
          m.role.eq("OWNER"),
          m.isActive.eq(true),
        ),
      )
      .limit(500)
      .all();
    const votedProfileIds = new Set(motion.votes.map((v) => v.profileId));
    const votesFor = lotIds.filter(
      (lotId) =>
        !coOwners.some(
          (m) => m.lotId === lotId && m.profileId !== profile.id && votedProfileIds.has(m.profileId),
        ),
    );
    if (votesFor.length === 0) {
      return { error: "A vote has already been cast for your lot." };
    }

    // Where the building's pack limits what a lot owing money may vote on
    // (Queensland), refused before anything is written. Judged lot by lot on
    // the lots this vote is for: it stands for those that owe nothing, and is
    // refused only when every one of them owes. NSW records no such rule.
    const debtorProblem = await debtorVoteProblem({
      schemeId: motion.schemeId,
      lotIds: votesFor,
      category: motion.motionType,
    });
    if (debtorProblem) return { error: debtorProblem };

    await castVote({
      motionId,
      profileId: profile.id,
      voteValue,
    });
    revalidatePath("/owner/meetings");
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    // Unique constraint violation — user already voted on this motion
    if (
      err instanceof Error &&
      (err.message.includes("unique") ||
        err.message.includes("duplicate") ||
        err.message.includes("UNIQUE") ||
        err.message.includes("23505"))
    ) {
      return { error: "You have already voted on this motion." };
    }
    return { error: "Failed to cast vote. Please try again." };
  }
}

/** Cast an owner's pre-meeting electronic vote on an agenda item. */
export async function castBallotVoteAction(
  meetingId: string,
  agendaItemId: string,
  voteValue: string,
) {
  try {
    await requireAuth();
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    throw err;
  }

  if (!isVoteValue(voteValue)) return { error: "Invalid vote value." };

  try {
    const meeting = await getMeetingById(meetingId);
    if (!meeting) return { error: "Meeting not found." };

    // Only an OWNER membership tied to a lot carries a vote (F8).
    const { profile, memberships } = await ownerLotMemberships(meeting.schemeId);
    if (memberships.length === 0)
      return { error: "You are not recorded as an owner of a lot in this scheme." };

    // The agenda item must belong to the ballot's meeting.
    const item = await getAgendaItem(meetingId, agendaItemId);
    if (!item) return { error: "Agenda item not found." };

    const ballot = await getBallotForMeeting(meetingId);
    if (!ballot) return { error: "Voting is not open for this meeting." };
    const open = isBallotOpen(
      {
        opensAt: new Date(String(ballot.opensAt)),
        closesAt: new Date(String(ballot.closesAt)),
      },
      ballot.status,
    );
    if (!open) return { error: "The ballot is not currently open." };

    // The vote is recorded for one of the owner's lots. Where the pack limits
    // what a lot owing money may vote on (Queensland), each lot is judged on
    // its own, as the chair's count does: the vote goes to the first lot that
    // may vote, and is refused before anything is written only when every one
    // of the owner's lots owes. Under NSW, which records no such rule, that is
    // the owner's first lot, as before.
    const check = await debtorVoteCheck({
      schemeId: meeting.schemeId,
      lotIds: memberships.map((m) => m.lotId as string),
      category: item.resolutionCategory,
    });
    if (check.refusal) return { error: check.refusal };
    const lotId = check.mayVote[0];
    if (!lotId) return { error: "You are not recorded as an owner of a lot in this scheme." };
    const lot = await db.orm.public.Lot
      .where((l) => and(l.id.eq(lotId), l.schemeId.eq(meeting.schemeId)))
      .first();
    if (!lot) return { error: "You are not recorded as an owner of a lot in this scheme." };
    const unitEntitlement = lot.entitlement ?? 0;

    // castElectronicVote keeps one vote per lot per agenda item (it updates
    // the lot's existing vote).
    await castElectronicVote({
      ballotId: ballot.id,
      agendaItemId,
      lotId,
      profileId: profile.id,
      unitEntitlement,
      voteValue,
      isInformal: isInformalVote(voteValue),
    });

    revalidatePath("/owner/meetings");
    return {};
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    return { error: "Failed to record your vote. Please try again." };
  }
}
