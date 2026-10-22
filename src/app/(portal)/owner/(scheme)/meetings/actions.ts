"use server";

import { revalidatePath } from "next/cache";
import { requireAuth, AuthorisationError } from "@/lib/auth/require-membership";
import { castVote, getMotionById } from "@/lib/queries/motions";
import { getMeetingById } from "@/lib/queries/meetings";
import { getBallotForMeeting, castElectronicVote } from "@/lib/queries/evoting";
import { isBallotOpen, isInformalVote } from "@/lib/meetings/evoting";
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";

export async function castVoteAction(motionId: string, voteValue: string) {
  let profile;
  try {
    profile = await requireAuth();
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    throw err;
  }

  const allowed = ["FOR", "AGAINST", "ABSTAIN"];
  if (!allowed.includes(voteValue)) {
    return { error: "Invalid vote value." };
  }

  try {
    // Verify the motion exists and the voter has membership on its scheme
    const motion = await getMotionById(motionId);
    if (!motion) {
      return { error: "Motion not found." };
    }

    const membership = await db.orm.public.SchemeMembership
      .where((m) =>
        and(
          m.schemeId.eq(motion.schemeId),
          m.profileId.eq(profile.id),
          m.isActive.eq(true),
        ),
      )
      .first();

    if (!membership) {
      return { error: "You do not have permission to vote on this motion." };
    }

    await castVote({
      motionId,
      profileId: profile.id,
      voteValue,
    });
    revalidatePath("/owner/meetings");
    return {};
  } catch (err) {
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
  let profile;
  try {
    profile = await requireAuth();
  } catch (err) {
    if (err instanceof AuthorisationError) return { error: err.message };
    throw err;
  }

  try {
    const meeting = await getMeetingById(meetingId);
    if (!meeting) return { error: "Meeting not found." };

    const membership = await db.orm.public.SchemeMembership
      .where((m) =>
        and(
          m.schemeId.eq(meeting.schemeId),
          m.profileId.eq(profile.id),
          m.isActive.eq(true),
        ),
      )
      .first();
    if (!membership || !membership.lotId)
      return { error: "You are not recorded as an owner of a lot in this scheme." };

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

    const lot = await db.orm.public.Lot
      .where((l) => l.id.eq(membership.lotId!))
      .first();
    const unitEntitlement = lot?.entitlement ?? 0;

    await castElectronicVote({
      ballotId: ballot.id,
      agendaItemId,
      lotId: membership.lotId,
      profileId: profile.id,
      unitEntitlement,
      voteValue,
      isInformal: isInformalVote(voteValue),
    });

    revalidatePath("/owner/meetings");
    return {};
  } catch {
    return { error: "Failed to record your vote. Please try again." };
  }
}
