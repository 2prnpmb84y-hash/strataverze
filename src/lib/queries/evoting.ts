import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";

export interface CreateBallotData {
  meetingId: string;
  opensAt: string;
  closesAt: string;
  createdById?: string | null;
}

export async function createBallot(data: CreateBallotData, orm: typeof db.orm = db.orm) {
  return orm.public.ElectronicBallot.create({
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

export interface OwnerBallotVotesData {
  ballotId: string;
  agendaItemId: string;
  profileId: string;
  voteValue: string;
  isInformal: boolean;
  /** The owner's lots that may vote on the item, each with its entitlement. */
  lots: readonly { lotId: string; unitEntitlement: number }[];
  /** The owner's other lots: any vote the owner cast earlier for one of them is removed. */
  withdrawLotIds: readonly string[];
}

/**
 * Records an owner's vote on an item for each of their lots that may vote,
 * in one transaction, so a changed vote replaces every one of the owner's
 * earlier votes on the item, whichever lots they were saved to. A lot whose
 * vote another owner of that lot cast is left as it is (one vote per lot, the
 * first owner's). The owner's own earlier vote for a lot in `withdrawLotIds`
 * is removed. Returns the lots recorded. When none could be recorded, nothing
 * is written.
 */
export async function castOwnerBallotVotes(data: OwnerBallotVotesData): Promise<string[]> {
  const lotIds = [...data.lots.map((l) => l.lotId), ...data.withdrawLotIds];
  if (lotIds.length === 0) return [];
  return db.transaction(async (tx) => {
    const existing = await tx.orm.public.ElectronicVote
      .where((v) => and(v.ballotId.eq(data.ballotId), v.agendaItemId.eq(data.agendaItemId), v.lotId.in(lotIds)))
      .all();
    const byLot = new Map(existing.map((v) => [v.lotId, v]));
    const anotherOwners = (lotId: string) => {
      const v = byLot.get(lotId);
      return !!v && v.profileId != null && v.profileId !== data.profileId;
    };
    const recorded = data.lots.filter((l) => !anotherOwners(l.lotId));
    if (recorded.length === 0) return [];

    for (const lotId of data.withdrawLotIds) {
      const v = byLot.get(lotId);
      if (v && v.profileId === data.profileId) await tx.orm.public.ElectronicVote.where({ id: v.id }).delete();
    }
    for (const l of recorded) {
      const v = byLot.get(l.lotId);
      if (v) {
        await tx.orm.public.ElectronicVote.where({ id: v.id }).update({
          voteValue: data.voteValue,
          isInformal: data.isInformal,
          unitEntitlement: l.unitEntitlement,
          profileId: data.profileId,
          castAt: new Date().toISOString() as never,
        });
      } else {
        await tx.orm.public.ElectronicVote.create({
          ballotId: data.ballotId,
          agendaItemId: data.agendaItemId,
          lotId: l.lotId,
          profileId: data.profileId,
          unitEntitlement: l.unitEntitlement,
          voteValue: data.voteValue,
          isInformal: data.isInformal,
        });
      }
    }
    return recorded.map((l) => l.lotId);
  });
}
