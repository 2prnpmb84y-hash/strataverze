import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";

export interface CreateBallotData {
  meetingId: string;
  opensAt: string;
  closesAt: string;
  createdById?: string | null;
}

export async function createBallot(data: CreateBallotData) {
  return db.orm.public.ElectronicBallot.create({
    meetingId: data.meetingId,
    status: "OPEN",
    opensAt: data.opensAt as never,
    closesAt: data.closesAt as never,
    createdById: data.createdById ?? null,
  });
}

export async function getBallotForMeeting(meetingId: string) {
  return db.orm.public.ElectronicBallot
    .where((b) => b.meetingId.eq(meetingId))
    .include("votes")
    .first();
}

export async function closeBallot(ballotId: string) {
  return db.orm.public.ElectronicBallot
    .where({ id: ballotId })
    .update({ status: "CLOSED", closedAt: new Date().toISOString() as never });
}

export async function getVotesForBallot(ballotId: string) {
  return db.orm.public.ElectronicVote
    .where((v) => v.ballotId.eq(ballotId))
    .all();
}

/** Open ballots (with votes) for a set of meetings. */
export async function getOpenBallotsForMeetings(meetingIds: string[]) {
  if (meetingIds.length === 0) return [];
  return db.orm.public.ElectronicBallot
    .where((b) => and(b.meetingId.in(meetingIds), b.status.eq("OPEN")))
    .include("votes")
    .all();
}

export interface CastVoteData {
  ballotId: string;
  agendaItemId: string;
  lotId: string;
  profileId: string;
  unitEntitlement: number;
  voteValue: string;
  isInformal: boolean;
}

/** Record or replace an owner's vote on an item (one per lot per item). */
export async function castElectronicVote(data: CastVoteData) {
  const existing = await db.orm.public.ElectronicVote
    .where((v) =>
      and(
        v.ballotId.eq(data.ballotId),
        v.agendaItemId.eq(data.agendaItemId),
        v.lotId.eq(data.lotId),
      ),
    )
    .first();

  if (existing) {
    return db.orm.public.ElectronicVote.where({ id: existing.id }).update({
      voteValue: data.voteValue,
      isInformal: data.isInformal,
      unitEntitlement: data.unitEntitlement,
      profileId: data.profileId,
      castAt: new Date().toISOString() as never,
    });
  }

  return db.orm.public.ElectronicVote.create({
    ballotId: data.ballotId,
    agendaItemId: data.agendaItemId,
    lotId: data.lotId,
    profileId: data.profileId,
    unitEntitlement: data.unitEntitlement,
    voteValue: data.voteValue,
    isInformal: data.isInformal,
  });
}
