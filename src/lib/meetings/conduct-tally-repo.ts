/**
 * What counting the votes at conduct reads (DB access; QLD stage 2,
 * resolution tallies, 27 Oct 2026): the formal online votes on the item, and
 * which of the building's lots owe money where the pack limits their votes on
 * the item's category. Read without a row limit. Nothing is written.
 */
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import { checksDebtorVotes, debtorVoteRefusal } from "./debtor-voting";
import { lotsOwingMoney } from "./debtor-voting-repo";
import type { MeetingRuleSet } from "./rules";
import type { OnlineVote, TallyLot } from "./conduct-tally";

export interface ConductVotingData {
  onlineVotes: OnlineVote[];
  owingLotIds: Set<string>;
  /**
   * The building's band of members as its building rules record it, or null
   * when none is recorded. Present only where `memberBandSelector` was given
   * (the ACT; VIC, ACT and WA stage 2, PR 8a-i): nothing else reads it.
   */
  memberBand?: string | null;
}

/**
 * `lots` are every lot of the building, as already read with it. Debts are
 * judged on `meetingDay` (yyyy-mm-dd, the meeting's date in the building's
 * time zone), not on the day the result is recorded.
 */
export async function conductVotingData(params: {
  ruleSet: MeetingRuleSet;
  scheme: { id: string; timeZone: string | null };
  lots: readonly TallyLot[];
  meetingId: string;
  meetingDay: string;
  itemId: string;
  category: string | null | undefined;
  /** The recorded building selector holding the band of members, where the item's rule needs it. */
  memberBandSelector?: string;
}): Promise<ConductVotingData> {
  const ballot = await db.orm.public.ElectronicBallot.where((b) => b.meetingId.eq(params.meetingId)).first();
  const onlineVotes: OnlineVote[] = ballot
    ? (
        await db.orm.public.ElectronicVote
          .where((v) => and(v.ballotId.eq(ballot.id), v.agendaItemId.eq(params.itemId)))
          .all()
      ).map((v) => ({ lotId: v.lotId ?? null, voteValue: v.voteValue, isInformal: v.isInformal }))
    : [];

  // Only where the pack limits a debtor's vote on this category.
  const checksDebts =
    checksDebtorVotes(params.ruleSet) && debtorVoteRefusal(params.ruleSet, params.category, true, "") != null;
  const owingLotIds = checksDebts
    ? await lotsOwingMoney(params.scheme, params.lots.map((l) => l.id), params.meetingDay)
    : new Set<string>();

  if (!params.memberBandSelector) return { onlineVotes, owingLotIds };
  const key = params.memberBandSelector;
  const recorded = await db.orm.public.SchemeSelectorValue.where((v) => and(v.schemeId.eq(params.scheme.id), v.key.eq(key))).first();
  return { onlineVotes, owingLotIds, memberBand: (recorded?.value ?? "").trim() || null };
}
