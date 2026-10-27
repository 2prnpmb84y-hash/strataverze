/**
 * Pre-meeting electronic voting (pure).
 *
 * Computes the ballot window from the rule set (open at least 7 days before,
 * close 24 hours before for an owners-corporation meeting or immediately before
 * for a committee meeting), detects informal votes, and tallies cast votes by
 * unit entitlement for evaluation against the resolution category. Pre-meeting
 * e-voting is gated by the body's adopting resolution (Reg cl 14), and is
 * offered only where the building's rule set has it (`preMeetingEvoting` is
 * null for Queensland: stage 2, step 7).
 */
import type { MeetingRuleSet, MeetingType, ResolutionTally } from "./rules";

export const VOTE_VALUES = ["FOR", "AGAINST", "ABSTAIN"] as const;
export type VoteValue = (typeof VOTE_VALUES)[number];

export function isVoteValue(value: string): value is VoteValue {
  return (VOTE_VALUES as readonly string[]).includes(value);
}

/** A vote is informal if it is not recorded per the instructions (Reg cl 16). */
export function isInformalVote(value: string): boolean {
  return !isVoteValue(value);
}

export interface BallotWindow {
  opensAt: Date;
  closesAt: Date;
}

/**
 * Why pre-meeting e-voting is not offered for the building, or null when it
 * is. `jurisdiction` names the building's state ("Qld").
 */
export function evotingNotOfferedReason(
  ruleSet: Pick<MeetingRuleSet, "preMeetingEvoting">,
  jurisdiction: string,
): string | null {
  return ruleSet.preMeetingEvoting == null
    ? `Pre-meeting electronic voting is not offered for buildings in ${jurisdiction} yet.`
    : null;
}

/** Pre-meeting e-voting is not in the building's rule set. */
export class EvotingNotOfferedError extends Error {
  constructor() {
    super("Pre-meeting electronic voting is not offered for this building.");
    this.name = "EvotingNotOfferedError";
  }
}

/**
 * The ballot open/close window for a meeting. Throws EvotingNotOfferedError
 * when the rule set has no pre-meeting e-voting (check
 * `evotingNotOfferedReason` first).
 */
export function computeBallotWindow(
  ruleSet: MeetingRuleSet,
  meetingType: MeetingType,
  meetingStart: Date,
): BallotWindow {
  const evoting = ruleSet.preMeetingEvoting;
  if (!evoting) throw new EvotingNotOfferedError();
  const opensAt = new Date(meetingStart);
  opensAt.setUTCDate(
    opensAt.getUTCDate() - evoting.ballotOpenDaysBefore,
  );
  const closeHours =
    evoting.ballotCloseHoursBefore[meetingType] ?? 24;
  const closesAt = new Date(meetingStart);
  closesAt.setUTCHours(closesAt.getUTCHours() - closeHours);
  return { opensAt, closesAt };
}

/** Whether the ballot is currently open for voting. */
export function isBallotOpen(
  window: BallotWindow,
  status: string,
  now: Date = new Date(),
): boolean {
  return status === "OPEN" && now >= window.opensAt && now < window.closesAt;
}

export interface ElectronicVoteRecord {
  voteValue: string;
  unitEntitlement: number;
  isInformal: boolean;
}

/** Tally formal votes by count and by unit entitlement for a single item. */
export function tallyElectronicVotes(
  votes: ElectronicVoteRecord[],
): ResolutionTally {
  const tally: ResolutionTally = {
    forCount: 0,
    againstCount: 0,
    abstainCount: 0,
    forUE: 0,
    againstUE: 0,
  };
  for (const v of votes) {
    if (v.isInformal) continue;
    if (v.voteValue === "FOR") {
      tally.forCount += 1;
      tally.forUE = (tally.forUE ?? 0) + v.unitEntitlement;
    } else if (v.voteValue === "AGAINST") {
      tally.againstCount += 1;
      tally.againstUE = (tally.againstUE ?? 0) + v.unitEntitlement;
    } else if (v.voteValue === "ABSTAIN") {
      tally.abstainCount = (tally.abstainCount ?? 0) + 1;
    }
  }
  return tally;
}

/** Validate that a ballot may be opened. */
export function validateCanOpenBallot(params: {
  adopted: boolean;
  meetingStatus: string;
}): string | null {
  if (!params.adopted)
    return "The owners corporation (or committee) has not resolved to adopt pre-meeting electronic voting.";
  if (
    params.meetingStatus !== "NOTICE_ISSUED" &&
    params.meetingStatus !== "DRAFT"
  )
    return "A ballot can only be opened before the meeting starts.";
  return null;
}
