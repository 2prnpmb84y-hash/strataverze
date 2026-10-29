/**
 * Meeting rules layer (pure).
 *
 * Legislative deadlines and thresholds are expressed here as DATA, not as
 * hard-coded logic. The NSW rule set (in `src/config/statutory/nsw.ts`) is the seed for the
 * `meeting_rule_sets` table; `rule-set-repo.ts` reads the active row and falls
 * back to this seed. Each meeting records the version that governed it, so a
 * later change to the rules never rewrites the compliance basis of a past
 * meeting.
 *
 * Day counting here is a plain whole-day difference. Legal day counting
 * (clear days and service rules under Schedule 1 / Schedule 2) is a refinement
 * flagged for the rules review; see the strategy document section 4.
 */
import { dayIn } from "@/lib/jurisdiction/time-zone";


export type MeetingType = "AGM" | "EGM" | "COMMITTEE" | "FIRST_AGM";

/**
 * Every resolution category any pack uses. Each pack lists the ones it has in
 * its MEETING_RULES (NSW: ORDINARY, SPECIAL, UNANIMOUS and
 * SUSTAINABILITY_INFRASTRUCTURE; Queensland: ORDINARY, SPECIAL,
 * WITHOUT_DISSENT and MAJORITY). Code never lists them itself: it reads the
 * building's rule set. The draft packs (VIC, ACT and WA stage 2, PR 8a-i,
 * 28 Oct 2026) add UNOPPOSED (the ACT) and INTERIM_SPECIAL (Victoria, which
 * a special resolution may pass as instead; it is never put on an agenda).
 */
export type ResolutionCategory =
  | "ORDINARY"
  | "SPECIAL"
  | "UNANIMOUS"
  | "SUSTAINABILITY_INFRASTRUCTURE"
  | "WITHOUT_DISSENT"
  | "MAJORITY"
  | "UNOPPOSED"
  | "INTERIM_SPECIAL";

/** How far a rule has been checked (the packs' RuleStatus, src/config/statutory/types.ts). */
export type ResolutionRuleStatus = "CONFIRMED" | "GUIDANCE" | "STRATAVERZE" | "NOT_CONFIRMED";

export interface QuorumRule {
  /**
   * PERCENT_PRESENT_OR_UE: quorum on head count OR unit entitlement (NSW).
   * HALF_MEMBERS: committee.
   * PERCENT_VOTERS_WITH_MIN_PRESENT: at least `percent` of the voters, with at
   * least `minPersons` present personally where there are `minPersonsFromVoters`
   * or more voters, else `minPersonsBelow` (Queensland, SM s 99). Held as data:
   * quorum is not evaluated yet.
   *
   * Held as data for the draft packs too (VIC, ACT and WA stage 2, PR 8a-i):
   * PERCENT_OF_LOTS_ELSE_ENTITLEMENT: `percent` of the lots, or where that is
   * not available `otherwisePercentOfEntitlement` of the total entitlement
   * (Victoria). FRACTION_OF_UNITS_PER_MOTION: those entitled to vote for
   * `fractionOfUnits` of the units, counted for each motion, with a reduced
   * quorum of `reducedQuorumMinPeople` after `waitMinutes` (the ACT).
   * PERCENT_OF_LOTS_THEN_THOSE_PRESENT: `percent` of the lots, and after
   * `waitMinutes` those present and entitled to vote (Western Australia).
   */
  basis:
    | "PERCENT_PRESENT_OR_UE"
    | "HALF_MEMBERS"
    | "PERCENT_VOTERS_WITH_MIN_PRESENT"
    | "PERCENT_OF_LOTS_ELSE_ENTITLEMENT"
    | "FRACTION_OF_UNITS_PER_MOTION"
    | "PERCENT_OF_LOTS_THEN_THOSE_PRESENT";
  percent?: number;
  minPersons?: number;
  /** PERCENT_VOTERS_WITH_MIN_PRESENT: the number of voters from which `minPersons` applies. */
  minPersonsFromVoters?: number;
  /** PERCENT_VOTERS_WITH_MIN_PRESENT: the least present personally where there are fewer voters. */
  minPersonsBelow?: number;
  /** PERCENT_OF_LOTS_ELSE_ENTITLEMENT: the share of the total entitlement where `percent` of the lots is not available. */
  otherwisePercentOfEntitlement?: number;
  /** FRACTION_OF_UNITS_PER_MOTION: the share of the units those present must be entitled to vote for. */
  fractionOfUnits?: number;
  /** FRACTION_OF_UNITS_PER_MOTION: the least people present and entitled to vote for a reduced quorum. */
  reducedQuorumMinPeople?: number;
  /** How long after the start (or after the motion arises) the fallback applies. */
  waitMinutes?: number;
  source?: string;
  status?: ResolutionRuleStatus;
}

export interface ResolutionRule {
  /**
   * COUNT_MAJORITY: majority of votes cast (poll switches to UE weighting; in
   * Queensland the lot's contribution schedule lot entitlement, held as UE).
   * UE_AGAINST_THRESHOLD: fails if against (by unit entitlement) >= threshold.
   * NO_AGAINST: fails on any against vote.
   * TWO_THIRDS_LOTS_AND_ENTITLEMENT_CAPS: passes only if the votes for are at
   * least `forAtLeastFractionOfVotesCast` of the votes cast, the votes against
   * are not more than `againstMaxFractionOfLots` of the lots in the scheme, and
   * the lots against hold not more than `againstMaxFractionOfEntitlement` of
   * the total entitlement (Queensland special resolution, Act s 106(3)).
   * MORE_THAN_HALF_OF_LOTS: passes only if the votes for are more than half of
   * the lots entitled to vote (Queensland majority resolution, Act s 107).
   *
   * Added for the draft packs (VIC, ACT and WA stage 2, PR 8a-i, 28 Oct 2026):
   * SHARE_OF_ALL_LOTS: tests measured against every lot of the scheme (and its
   * total entitlement), not the votes cast: each of the `forAtLeast...`,
   * `againstLessThan...` (strict) and `againstNotMoreThan...` (inclusive)
   * fields given must hold (Victoria's special, unanimous and interim special
   * resolutions; Western Australia's special and unanimous resolutions). On a
   * poll only `pollForAtLeastFractionOfAllEntitlement` is tested, and a rule
   * without it cannot be counted on a poll.
   * AGAINST_SHARE_OF_VOTES_PRESENT: more votes for than against, and the votes
   * against not more than `againstNotMoreThanFractionOfVotesPresent` of the
   * votes those present could cast; on a poll by entitlement (the ACT's
   * special resolution).
   * NONE_AGAINST_AT_LEAST_ONE_FOR: no vote against and at least 1 vote for (the
   * ACT, 1 or 2 members, and its unopposed resolution).
   * EVERY_LOT_RECORDED_NONE_AGAINST: a vote, or an abstention, recorded for
   * every lot, none against and at least 1 for (the ACT's unanimous
   * resolution).
   * BY_VARIANT: the test depends on the scheme's size (`variants`).
   */
  basis:
    | "COUNT_MAJORITY"
    | "UE_AGAINST_THRESHOLD"
    | "NO_AGAINST"
    | "TWO_THIRDS_LOTS_AND_ENTITLEMENT_CAPS"
    | "MORE_THAN_HALF_OF_LOTS"
    | "SHARE_OF_ALL_LOTS"
    | "AGAINST_SHARE_OF_VOTES_PRESENT"
    | "NONE_AGAINST_AT_LEAST_ONE_FOR"
    | "EVERY_LOT_RECORDED_NONE_AGAINST"
    | "BY_VARIANT";
  /** Fraction of against votes (by unit entitlement) at or above which the motion fails. */
  againstThreshold?: number;
  /** TWO_THIRDS_LOTS_AND_ENTITLEMENT_CAPS: the least share of the votes cast that must be for ("at least"). */
  forAtLeastFractionOfVotesCast?: number;
  /** TWO_THIRDS_LOTS_AND_ENTITLEMENT_CAPS: the most votes against, as a share of the lots in the scheme. */
  againstMaxFractionOfLots?: number;
  /** TWO_THIRDS_LOTS_AND_ENTITLEMENT_CAPS: the most entitlement held by the lots against, as a share of the total. */
  againstMaxFractionOfEntitlement?: number;
  /*
   * The keys below are the draft packs' (VIC, ACT and WA stage 2, PR 8a-i).
   * Every one is optional, and NSW and Queensland rules have none of them.
   */
  /** SHARE_OF_ALL_LOTS: the votes for are at least this share of all lots ("at least"). */
  forAtLeastFractionOfAllLots?: number;
  /** SHARE_OF_ALL_LOTS: at least this many lots vote for. */
  forAtLeastLots?: number;
  /** SHARE_OF_ALL_LOTS: the lots for hold at least this share of the total entitlement. */
  forAtLeastFractionOfAllEntitlement?: number;
  /** SHARE_OF_ALL_LOTS: the votes against are less than this share of all lots (strict: equal fails). */
  againstLessThanFractionOfAllLots?: number;
  /** SHARE_OF_ALL_LOTS: the lots against hold less than this share of the total entitlement (strict: equal fails). */
  againstLessThanFractionOfAllEntitlement?: number;
  /** SHARE_OF_ALL_LOTS: the votes against are not more than this share of all lots (inclusive: equal passes). */
  againstNotMoreThanFractionOfAllLots?: number;
  /** SHARE_OF_ALL_LOTS on a poll: the lots for hold at least this share of the total entitlement. */
  pollForAtLeastFractionOfAllEntitlement?: number;
  /**
   * SHARE_OF_ALL_LOTS: where the other tests fail, it still passes with no
   * vote against and at least 1 vote for at a meeting with a quorum
   * (Victoria's interim special resolution, second route; at least 1 vote for
   * is StrataVerze's reading, for review). Whether there was a quorum must be
   * recorded.
   */
  orNoneAgainstAtQuorateMeeting?: boolean;
  /** AGAINST_SHARE_OF_VOTES_PRESENT: the most votes against, as a share of the votes those present could cast (inclusive). */
  againstNotMoreThanFractionOfVotesPresent?: number;
  /** The entitlement the totals are counted by, as the pack says it decides. SPECIAL_RESOLUTION where not given. */
  entitlementUse?: "SPECIAL_RESOLUTION" | "UNANIMOUS_RESOLUTION";
  /**
   * Where the test fails, the category it may still pass as, with a result of
   * INTERIM (Victoria: a special resolution may pass as an interim special
   * resolution).
   */
  interimCategory?: ResolutionCategory;
  /** Why equal votes for and against cannot be decided from the count (a casting vote StrataVerze does not record). */
  tieRefusedBecause?: string;
  /**
   * What a resolution passed without a quorum is: INTERIM (Victoria: every
   * resolution of a meeting without a quorum is interim) or DECIDED_LATER
   * (the ACT: a reduced quorum decision takes effect later). Either way,
   * whether the meeting had a quorum must be recorded, or the count is refused.
   */
  withoutQuorum?: "INTERIM" | "DECIDED_LATER";
  /**
   * The days the vote stays open after the meeting (Western Australia). It is
   * decided when they close, so the count at the meeting cannot decide it: the
   * evaluation is UNDETERMINED whatever the votes.
   */
  votingPeriodDays?: number;
  /** Why StrataVerze cannot count this resolution at all yet. */
  refusedBecause?: string;
  /** BY_VARIANT: the tests by the scheme's size, read in order; the first that fits decides. */
  variants?: readonly ResolutionVariant[];
  /** BY_VARIANT: why no test fits, when every fact is known. */
  noVariantFitsRefusal?: string;
  /** Where the rule comes from, and how far it is checked (the draft packs). */
  source?: string;
  status?: ResolutionRuleStatus;
}

/**
 * One test of a BY_VARIANT rule, for a size of scheme: a number of lots
 * (inclusive) or a band of members, as the building's rules record it. The
 * variant's rule takes the parent's keys it does not give itself.
 */
export interface ResolutionVariant {
  when: { lotsAtLeast?: number; lotsAtMost?: number; memberBands?: readonly string[] };
  rule: ResolutionRule;
  source: string;
  status: ResolutionRuleStatus;
}

/** How a resolution category is named to people. */
export interface ResolutionLabel {
  /** As agenda items are tagged: "Ordinary". */
  short: string;
  /** As a motion is described: "Ordinary Resolution". */
  full: string;
  /** As the choice reads on the new motion form, where it differs from `full`. */
  choice?: string;
}

export interface MeetingRuleSet {
  state: string;
  version: string;
  /** ISO date (YYYY-MM-DD) from which this rule set is effective. */
  effectiveFrom: string;
  /** Minimum notice period in days, by meeting type. */
  noticePeriods: Partial<Record<MeetingType, number>>;
  /** Minutes distribution deadline in days after the meeting, by meeting type. */
  minutesDeadlines: Partial<Record<MeetingType, number>>;
  quorumRules: Partial<Record<MeetingType, QuorumRule>>;
  /** The pack's resolution categories, each with its rule. A category not listed does not exist for the building. */
  resolutionCategories: Partial<Record<ResolutionCategory, ResolutionRule>>;
  /**
   * How long meeting records are kept: whole years, or null where the law
   * gives no limit (the record is kept). `secretBallotMonths` is null where no
   * period for secret ballot papers was found.
   */
  retention: { generalYears: number | null; secretBallotMonths: number | null };
  /**
   * Pre-meeting electronic voting (NSW Reg cl 14-17), or null where the pack
   * has no such ballot (Queensland): the ballot is then not offered.
   */
  preMeetingEvoting: {
    /** Ballot access must be given at least this many days before (cl 15). */
    ballotOpenDaysBefore: number;
    /** Ballot closes this many hours before the meeting, by meeting type (cl 17). */
    ballotCloseHoursBefore: Partial<Record<MeetingType, number>>;
  } | null;
  /** How each category is named to people (stage 2, step 7). */
  resolutionLabels: Partial<Record<ResolutionCategory, ResolutionLabel>>;
  /** The categories a general meeting may carry, in the order they are offered. */
  generalMeetingCategories: readonly ResolutionCategory[];
  /** The categories a committee may decide. */
  committeeCategories: readonly ResolutionCategory[];
  /** Why a category outside `committeeCategories` is refused on a committee agenda. */
  committeeCategoryRefusal: string;
  /** The categories offered for a motion raised on a meeting (the motions list), in order. */
  motionCategories: readonly ResolutionCategory[];
  /**
   * Where the pack records it: the only categories an owner whose lot owes
   * the body corporate money may vote on (Queensland SM s 102(2)). Undefined
   * where no such rule is recorded (NSW): votes are then not checked.
   */
  debtorsMayVoteOn?: readonly ResolutionCategory[];
  /**
   * Where the pack records it: the categories a poll may be asked for on
   * (Queensland Act s 109: an ordinary resolution only). Read where votes are
   * counted at conduct (`countsVotesAtConduct`); NSW leaves it out.
   */
  pollCategories?: readonly ResolutionCategory[];
  /**
   * Where the pack records it: the categories a proxy cannot vote on
   * (Queensland Act s 107 and SM s 130(3): a majority resolution). Read where
   * votes are counted at conduct; NSW leaves it out.
   */
  proxiesBarredOn?: readonly ResolutionCategory[];
  /**
   * Where the pack records it (the draft packs, VIC, ACT and WA stage 2,
   * PR 8a-i): common property rows are not lots, so they are left out of the
   * lots counted at conduct. NSW and Queensland leave it out, and count every
   * row as before.
   */
  excludeCommonPropertyRows?: true;
  /**
   * Where the pack records it: the building selector (recorded by the
   * adviser) that holds the building's band of members, read where a rule's
   * test depends on it (the ACT's `memberBand`).
   */
  memberBandSelector?: string;
  /**
   * Where the pack records it (the draft packs, VIC, ACT and WA stage 2,
   * PR 8a-i): an item with no resolution category cannot be recorded as
   * resolved at a general meeting, because its votes cannot be counted. Lost
   * and deferred are still allowed. NSW and Queensland leave it out, and take
   * the chair's outcome for such an item as before.
   */
  categoryRequiredAtGeneralMeetings?: true;
  notes?: string;
}

// The NSW meeting rules live with the other NSW statutory rules in
// `src/config/statutory/nsw.ts`. For a building's rules use `getActiveRuleSet`
// (or `statutoryRulesFor(state).MEETING_RULES` for the built-in set).

/**
 * Whole-day difference (b - a), ignoring time of day: the calendar days the
 * two instants fall on in `timeZone` (multi-jurisdiction plan, phase 1c). Pass
 * the meeting's time zone for notice periods, so a 9 am Sydney meeting counts
 * on its own day, not the day before in UTC. Without one it counts UTC days.
 * Whether a notice period counts clear days is for the rules review.
 */
export function wholeDaysBetween(a: Date, b: Date, timeZone: string = "UTC"): number {
  const ms = 24 * 60 * 60 * 1000;
  const day = (d: Date) => {
    const [y, m, dd] = dayIn(timeZone, d).split("-").map(Number);
    return Date.UTC(y, m - 1, dd);
  };
  return Math.round((day(b) - day(a)) / ms);
}

/** The earliest meeting date that satisfies the notice period, counted from `from`. */
export function earliestCompliantMeetingDate(
  ruleSet: MeetingRuleSet,
  meetingType: MeetingType,
  from: Date = new Date(),
): Date | null {
  const days = ruleSet.noticePeriods[meetingType];
  if (days == null) return null;
  const result = new Date(from);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export interface NoticeValidation {
  requiredDays: number | null;
  actualDays: number;
  compliant: boolean;
}

/** Validate the gap between the notice issue date and the meeting date. */
export function validateNoticePeriod(
  ruleSet: MeetingRuleSet,
  meetingType: MeetingType,
  issueDate: Date,
  meetingDate: Date,
  /** The meeting's time zone: days are counted in it. */
  timeZone: string,
): NoticeValidation {
  const requiredDays = ruleSet.noticePeriods[meetingType] ?? null;
  const actualDays = wholeDaysBetween(issueDate, meetingDate, timeZone);
  return {
    requiredDays,
    actualDays,
    compliant: requiredDays == null ? true : actualDays >= requiredDays,
  };
}

/** The date by which minutes must be distributed after a meeting. */
export function minutesDeadline(
  ruleSet: MeetingRuleSet,
  meetingType: MeetingType,
  meetingDate: Date,
): Date | null {
  const days = ruleSet.minutesDeadlines[meetingType];
  if (days == null) return null;
  const result = new Date(meetingDate);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export interface ResolutionTally {
  forCount: number;
  againstCount: number;
  abstainCount?: number;
  /** Unit-entitlement weighted totals (required for special resolutions and polls). */
  forUE?: number;
  againstUE?: number;
  /** Whether a poll was demanded (ordinary resolutions switch to UE weighting). */
  poll?: boolean;
  /** The number of lots in the scheme (TWO_THIRDS_LOTS_AND_ENTITLEMENT_CAPS). */
  totalLots?: number;
  /** The total entitlement of all lots in the scheme (TWO_THIRDS_LOTS_AND_ENTITLEMENT_CAPS). */
  totalEntitlement?: number;
  /** The number of lots entitled to vote (MORE_THAN_HALF_OF_LOTS). */
  eligibleLots?: number;
  /*
   * Added for the draft packs (VIC, ACT and WA stage 2, PR 8a-i). Each is
   * set only where the rule needs it, and never on an NSW or Queensland tally.
   */
  /** AGAINST_SHARE_OF_VOTES_PRESENT: the votes those present could cast (the lots recorded at the item). */
  votesPresentCount?: number;
  /** AGAINST_SHARE_OF_VOTES_PRESENT on a poll: the entitlement of those lots. */
  votesPresentEntitlement?: number;
  /** EVERY_LOT_RECORDED_NONE_AGAINST: the lots with a vote or an abstention recorded. */
  lotsRecorded?: number;
  /** The building's band of members, as its building rules record it (the ACT). */
  memberBand?: string;
  /** Whether the meeting had a quorum for the item, where it was recorded. */
  quorumPresent?: boolean;
}

/**
 * Shares are compared with a small allowance for floating point, so a share
 * held as 2 / 3 passes at exactly two thirds (3 x for = 2 x cast).
 */
const EPSILON = 1e-9;
const percent = (fraction: number) => `${Number((fraction * 100).toFixed(1))}%`;

export interface ResolutionOutcome {
  passed: boolean;
  reason: string;
  /**
   * Where the count does not give carried or lost (the draft packs only):
   * INTERIM, passed only as an interim resolution, or UNDETERMINED, which the
   * count cannot decide (the reason says why). `passed` is false with either.
   * Left out, never undefined, otherwise.
   */
  result?: "INTERIM" | "UNDETERMINED";
  /** With INTERIM: the category it passed as, where it has one (Victoria's interim special resolution). */
  interimCategory?: ResolutionCategory;
}

/** Whether a value is one of the building's resolution categories (one its rule set has a rule for). */
export function isResolutionCategory(
  ruleSet: Pick<MeetingRuleSet, "resolutionCategories">,
  category: string | null | undefined,
): category is ResolutionCategory {
  return !!category && Object.prototype.hasOwnProperty.call(ruleSet.resolutionCategories, category);
}

/**
 * Evaluate whether a resolution passes, per the rule for its category.
 * `pollEntitlement` names the entitlement a poll is counted by in the reason,
 * as the building's pack names it ("contribution schedule lot entitlement");
 * without it the reason says unit entitlement, as it always has.
 */
export function evaluateResolution(
  ruleSet: MeetingRuleSet,
  category: ResolutionCategory,
  tally: ResolutionTally,
  pollEntitlement: string = "unit entitlement",
): ResolutionOutcome {
  const rule = ruleSet.resolutionCategories[category];
  if (!rule) {
    return { passed: false, reason: `Unknown resolution category ${category}` };
  }
  // NSW and Queensland rules have none of the draft packs' bases or keys:
  // their test is the basis alone, exactly as before.
  if (!usesDraftKeys(rule)) return evaluateBasis(rule, tally, pollEntitlement);

  const outcome = evaluateDraftRule(ruleSet, rule, tally, pollEntitlement);
  // A category another one passes as instead (Victoria's interim special
  // resolution) is itself only ever interim.
  if (outcome.passed && isInterimCategory(ruleSet, category)) {
    return { passed: false, reason: outcome.reason, result: "INTERIM", interimCategory: category };
  }
  return outcome;
}

/** The test of a rule's basis alone. */
function evaluateBasis(rule: ResolutionRule, tally: ResolutionTally, pollEntitlement: string): ResolutionOutcome {
  switch (rule.basis) {
    case "NO_AGAINST":
      return tally.againstCount === 0
        ? { passed: true, reason: "No vote cast against (unanimous)" }
        : { passed: false, reason: `${tally.againstCount} vote(s) against` };

    case "COUNT_MAJORITY": {
      if (tally.poll && tally.forUE != null && tally.againstUE != null) {
        return tally.forUE > tally.againstUE
          ? { passed: true, reason: `Majority by ${pollEntitlement} on a poll` }
          : { passed: false, reason: `Not carried by ${pollEntitlement} on a poll` };
      }
      return tally.forCount > tally.againstCount
        ? { passed: true, reason: "Majority of votes cast" }
        : { passed: false, reason: "Not a majority of votes cast" };
    }

    case "UE_AGAINST_THRESHOLD": {
      const threshold = rule.againstThreshold ?? 0.25;
      const againstUE = tally.againstUE;
      const forUE = tally.forUE;
      if (againstUE == null || forUE == null) {
        return {
          passed: false,
          reason:
            "Unit-entitlement totals are required to evaluate this resolution category",
        };
      }
      const totalUE = forUE + againstUE;
      if (totalUE === 0) {
        return { passed: false, reason: "No votes cast" };
      }
      const againstFraction = againstUE / totalUE;
      return againstFraction < threshold
        ? {
            passed: true,
            reason: `Against share ${(againstFraction * 100).toFixed(1)}% is below the ${(threshold * 100).toFixed(0)}% failure threshold`,
          }
        : {
            passed: false,
            reason: `Against share ${(againstFraction * 100).toFixed(1)}% meets or exceeds the ${(threshold * 100).toFixed(0)}% failure threshold`,
          };
    }

    case "TWO_THIRDS_LOTS_AND_ENTITLEMENT_CAPS": {
      const forShare = rule.forAtLeastFractionOfVotesCast;
      const lotsShare = rule.againstMaxFractionOfLots;
      const entitlementShare = rule.againstMaxFractionOfEntitlement;
      if (forShare == null || lotsShare == null || entitlementShare == null) {
        return { passed: false, reason: "The rule for this resolution is incomplete, so it cannot be counted" };
      }
      if (tally.totalLots == null || tally.totalEntitlement == null || tally.againstUE == null) {
        return {
          passed: false,
          reason: "The number of lots, the total entitlement and the entitlement of the lots against are needed to count this resolution",
        };
      }
      const cast = tally.forCount + tally.againstCount;
      if (cast === 0) return { passed: false, reason: "No votes cast" };
      if (tally.forCount + EPSILON < forShare * cast) {
        return { passed: false, reason: `Votes for are less than ${percent(forShare)} of the votes cast` };
      }
      if (tally.againstCount > lotsShare * tally.totalLots + EPSILON) {
        return { passed: false, reason: `Votes against are more than ${percent(lotsShare)} of the lots in the scheme` };
      }
      if (tally.againstUE > entitlementShare * tally.totalEntitlement + EPSILON) {
        return { passed: false, reason: `The lots against hold more than ${percent(entitlementShare)} of the total entitlement` };
      }
      return {
        passed: true,
        reason: `Votes for are at least ${percent(forShare)} of the votes cast, and the votes and entitlement against are within the limits`,
      };
    }

    case "MORE_THAN_HALF_OF_LOTS": {
      if (tally.eligibleLots == null) {
        return { passed: false, reason: "The number of lots entitled to vote is needed to count this resolution" };
      }
      return tally.forCount * 2 > tally.eligibleLots
        ? { passed: true, reason: "Votes for are more than half of the lots entitled to vote" }
        : { passed: false, reason: "Votes for are not more than half of the lots entitled to vote" };
    }

    case "SHARE_OF_ALL_LOTS":
      return shareOfAllLots(rule, tally);

    case "AGAINST_SHARE_OF_VOTES_PRESENT":
      return againstShareOfVotesPresent(rule, tally, pollEntitlement);

    case "NONE_AGAINST_AT_LEAST_ONE_FOR":
      if (tally.againstCount > 0) return { passed: false, reason: `${tally.againstCount} vote(s) against` };
      return tally.forCount >= 1
        ? { passed: true, reason: "No vote against, and at least 1 vote for" }
        : { passed: false, reason: "No vote cast for" };

    case "EVERY_LOT_RECORDED_NONE_AGAINST": {
      if (tally.totalLots == null || tally.lotsRecorded == null) {
        return undetermined("The number of lots and the votes recorded for each are needed to count this resolution");
      }
      if (tally.againstCount > 0) return { passed: false, reason: `${tally.againstCount} vote(s) against` };
      if (tally.lotsRecorded < tally.totalLots) {
        return undetermined(
          `Only ${tally.lotsRecorded} of the ${tally.totalLots} votes in the scheme are recorded, and every one must be recorded, as a vote or an abstention, to count this resolution`,
        );
      }
      return tally.forCount >= 1
        ? { passed: true, reason: "Every vote is recorded, none against and at least 1 for" }
        : { passed: false, reason: "No vote cast for" };
    }

    case "BY_VARIANT":
      return undetermined(INCOMPLETE);

    default:
      return { passed: false, reason: "Unsupported resolution rule" };
  }
}

/*
 * The draft packs' rules (VIC, ACT and WA stage 2, PR 8a-i, 28 Oct 2026).
 * Anything the count cannot decide is UNDETERMINED, with the reason: it fails
 * closed, and the outcome is not recorded. Reasons are plain words with the
 * numbers from the rule; the citations stay in the pack.
 */

const INCOMPLETE = "The rule for this resolution is incomplete, so it cannot be counted";

const undetermined = (reason: string): ResolutionOutcome => ({ passed: false, reason, result: "UNDETERMINED" });

/** The keys only the draft packs' rules use. */
const DRAFT_KEYS: readonly (keyof ResolutionRule)[] = [
  "refusedBecause",
  "variants",
  "noVariantFitsRefusal",
  "tieRefusedBecause",
  "withoutQuorum",
  "votingPeriodDays",
  "interimCategory",
];

/** The bases only the draft packs' rules use. */
export const DRAFT_BASES: readonly ResolutionRule["basis"][] = [
  "SHARE_OF_ALL_LOTS",
  "AGAINST_SHARE_OF_VOTES_PRESENT",
  "NONE_AGAINST_AT_LEAST_ONE_FOR",
  "EVERY_LOT_RECORDED_NONE_AGAINST",
  "BY_VARIANT",
];

/** Whether a rule is one of the draft packs': a draft basis or key, on it or on one of its variants. */
export function usesDraftKeys(rule: ResolutionRule): boolean {
  return DRAFT_BASES.includes(rule.basis) || DRAFT_KEYS.some((k) => rule[k] !== undefined);
}

/** Whether another category of the rule set passes as this one instead (Victoria's interim special resolution). */
function isInterimCategory(ruleSet: MeetingRuleSet, category: ResolutionCategory): boolean {
  return Object.values(ruleSet.resolutionCategories).some(
    (r) => r?.interimCategory === category || !!r?.variants?.some((v) => v.rule.interimCategory === category),
  );
}

/**
 * The variant of a BY_VARIANT rule that fits the tally, merged with the
 * parent's keys, or why none can be chosen. Read in order: a variant that
 * needs a fact the tally does not have stops the choice (a later variant never
 * decides in its place).
 */
function chooseVariant(rule: ResolutionRule, tally: ResolutionTally): { rule: ResolutionRule } | { refusal: string } {
  const { variants, noVariantFitsRefusal, ...parent } = rule;
  if (!variants?.length) return { refusal: INCOMPLETE };
  for (const v of variants) {
    const { lotsAtLeast, lotsAtMost, memberBands } = v.when;
    const lots = tally.totalLots;
    const band = tally.memberBand;
    if ((lotsAtLeast != null || lotsAtMost != null) && lots == null) {
      return { refusal: "The number of lots in the scheme is needed to choose this resolution's test" };
    }
    if (memberBands && band == null) {
      return { refusal: "The building's number of members is not recorded in its building rules, so this resolution's test cannot be chosen" };
    }
    const fits =
      (lotsAtLeast == null || lots! >= lotsAtLeast) &&
      (lotsAtMost == null || lots! <= lotsAtMost) &&
      (!memberBands || memberBands.includes(band!));
    if (fits) {
      if (v.rule.variants || v.rule.basis === "BY_VARIANT") return { refusal: INCOMPLETE };
      return { rule: { ...parent, ...v.rule } };
    }
  }
  return { refusal: noVariantFitsRefusal ?? "No test for this resolution fits the building" };
}

/** Whether the votes for and against are equal, by entitlement on a poll. */
function isTie(tally: ResolutionTally): boolean {
  if (tally.poll && tally.forUE != null && tally.againstUE != null) return Math.abs(tally.forUE - tally.againstUE) < EPSILON;
  return tally.forCount === tally.againstCount;
}

/**
 * A draft pack's rule, in order: a refusal of the whole category, the variant
 * for the building's size (and its own refusal), the quorum, a tie, the test,
 * and where the test fails the interim category it may pass as.
 */
function evaluateDraftRule(
  ruleSet: MeetingRuleSet,
  given: ResolutionRule,
  tally: ResolutionTally,
  pollEntitlement: string,
  /** False while evaluating the interim category itself, so a rule set can never loop. */
  allowInterim: boolean = true,
): ResolutionOutcome {
  if (given.refusedBecause) return undetermined(given.refusedBecause);
  let rule = given;
  if (given.variants || given.basis === "BY_VARIANT") {
    const chosen = chooseVariant(given, tally);
    if ("refusal" in chosen) return undetermined(chosen.refusal);
    rule = chosen.rule;
    if (rule.refusedBecause) return undetermined(rule.refusedBecause);
  }
  // Decided when its voting period closes (Western Australia), whatever the count at the meeting gives.
  if (rule.votingPeriodDays != null) {
    return undetermined(
      `This resolution is decided when its ${rule.votingPeriodDays}-day voting period closes, which StrataVerze does not track yet, so the count at the meeting cannot decide it`,
    );
  }
  if (rule.withoutQuorum) {
    if (tally.quorumPresent == null) {
      return undetermined("Whether the meeting had a quorum for this item is not recorded, so the votes cannot decide it");
    }
    if (!tally.quorumPresent && rule.withoutQuorum === "DECIDED_LATER") {
      return undetermined("The meeting had no quorum for this item, so it is decided later, which StrataVerze does not track yet");
    }
  }
  if (rule.tieRefusedBecause && isTie(tally)) return undetermined(rule.tieRefusedBecause);

  const outcome = evaluateBasis(rule, tally, pollEntitlement);
  if (outcome.result) return outcome;
  if (outcome.passed) {
    // Every resolution of a meeting without a quorum is interim (Victoria).
    if (rule.withoutQuorum === "INTERIM" && tally.quorumPresent === false) {
      return { passed: false, reason: `${outcome.reason}, at a meeting without a quorum, so it is an interim resolution`, result: "INTERIM" };
    }
    return outcome;
  }
  if (!rule.interimCategory || !allowInterim) return outcome;
  const interimRule = ruleSet.resolutionCategories[rule.interimCategory];
  if (!interimRule) return outcome;
  const interim = evaluateDraftRule(ruleSet, interimRule, tally, pollEntitlement, false);
  if (interim.result === "UNDETERMINED") return undetermined(`${outcome.reason}. ${interim.reason}`);
  if (!interim.passed) return outcome;
  return { passed: false, reason: `${outcome.reason}. ${interim.reason}`, result: "INTERIM", interimCategory: rule.interimCategory };
}

const shareOf = (fraction: number, whole: string) => (fraction >= 1 ? `all of ${whole}` : `at least ${percent(fraction)} of ${whole}`);

/** SHARE_OF_ALL_LOTS: each test given, against every lot of the scheme and its total entitlement. */
function shareOfAllLots(rule: ResolutionRule, tally: ResolutionTally): ResolutionOutcome {
  const lots = tally.totalLots;
  if (lots == null) return undetermined("The number of lots in the scheme is needed to count this resolution");
  if (tally.poll) {
    const f = rule.pollForAtLeastFractionOfAllEntitlement;
    if (f == null) return undetermined("How a poll is counted for this resolution is not confirmed, so it cannot be counted on a poll");
    if (tally.totalEntitlement == null || tally.forUE == null) {
      return undetermined("The total entitlement and the entitlement of the lots for are needed to count this resolution on a poll");
    }
    return tally.forUE + EPSILON >= f * tally.totalEntitlement
      ? { passed: true, reason: `The lots for hold ${shareOf(f, "the total entitlement")} on a poll` }
      : { passed: false, reason: `The lots for do not hold ${shareOf(f, "the total entitlement")} on a poll` };
  }
  const needsEntitlement = rule.forAtLeastFractionOfAllEntitlement != null || rule.againstLessThanFractionOfAllEntitlement != null;
  const { totalEntitlement, forUE, againstUE } = tally;
  if (needsEntitlement && (totalEntitlement == null || forUE == null || againstUE == null)) {
    return undetermined("The total entitlement and the entitlement of the lots for and against are needed to count this resolution");
  }
  const tests: { holds: boolean; failure: string; success: string }[] = [];
  if (rule.forAtLeastFractionOfAllLots != null) {
    const f = rule.forAtLeastFractionOfAllLots;
    tests.push({
      holds: tally.forCount + EPSILON >= f * lots,
      failure: f >= 1 ? "Not every lot in the scheme voted for" : `Votes for are less than ${percent(f)} of all lots in the scheme`,
      success: f >= 1 ? "every lot in the scheme voted for" : `votes for are at least ${percent(f)} of all lots in the scheme`,
    });
  }
  if (rule.forAtLeastLots != null) {
    const n = rule.forAtLeastLots;
    tests.push({ holds: tally.forCount >= n, failure: `Fewer than ${n} lots voted for`, success: `at least ${n} lots voted for` });
  }
  if (rule.forAtLeastFractionOfAllEntitlement != null) {
    const f = rule.forAtLeastFractionOfAllEntitlement;
    tests.push({
      holds: forUE! + EPSILON >= f * totalEntitlement!,
      failure: `The lots for do not hold ${shareOf(f, "the total entitlement")}`,
      success: `the lots for hold ${shareOf(f, "the total entitlement")}`,
    });
  }
  if (rule.againstLessThanFractionOfAllLots != null) {
    const f = rule.againstLessThanFractionOfAllLots;
    tests.push({
      holds: tally.againstCount < f * lots - EPSILON,
      failure: `Votes against are ${percent(f)} or more of all lots in the scheme`,
      success: `votes against are less than ${percent(f)} of all lots in the scheme`,
    });
  }
  if (rule.againstLessThanFractionOfAllEntitlement != null) {
    const f = rule.againstLessThanFractionOfAllEntitlement;
    tests.push({
      holds: againstUE! < f * totalEntitlement! - EPSILON,
      failure: `The lots against hold ${percent(f)} or more of the total entitlement`,
      success: `the lots against hold less than ${percent(f)} of the total entitlement`,
    });
  }
  if (rule.againstNotMoreThanFractionOfAllLots != null) {
    const f = rule.againstNotMoreThanFractionOfAllLots;
    tests.push({
      holds: tally.againstCount <= f * lots + EPSILON,
      failure: `Votes against are more than ${percent(f)} of all lots in the scheme`,
      success: `votes against are not more than ${percent(f)} of all lots in the scheme`,
    });
  }
  if (tests.length === 0) return undetermined(INCOMPLETE);
  const failed = tests.find((t) => !t.holds);
  if (!failed) {
    const text = tests.map((t) => t.success).join(", and ");
    return { passed: true, reason: text.charAt(0).toUpperCase() + text.slice(1) };
  }
  // With no vote against it may still pass at a meeting with a quorum, but only with at least 1 vote for.
  if (rule.orNoneAgainstAtQuorateMeeting && tally.againstCount === 0 && tally.forCount >= 1) {
    if (tally.quorumPresent == null) {
      return undetermined(
        `${failed.failure}. With no vote against and at least 1 vote for it passes only at a meeting with a quorum, and whether there was one for this item is not recorded`,
      );
    }
    if (tally.quorumPresent) return { passed: true, reason: "No vote against and at least 1 vote for, at a meeting with a quorum" };
  }
  return { passed: false, reason: failed.failure };
}

/** AGAINST_SHARE_OF_VOTES_PRESENT: more for than against, and the votes against within their share of the votes present. */
function againstShareOfVotesPresent(rule: ResolutionRule, tally: ResolutionTally, pollEntitlement: string): ResolutionOutcome {
  const f = rule.againstNotMoreThanFractionOfVotesPresent;
  if (f == null) return undetermined(INCOMPLETE);
  if (tally.poll) {
    const { forUE, againstUE, votesPresentEntitlement } = tally;
    if (forUE == null || againstUE == null || votesPresentEntitlement == null) {
      return undetermined(`The ${pollEntitlement} of the votes for, against and present is needed to count this resolution on a poll`);
    }
    if (!(forUE > againstUE + EPSILON)) return { passed: false, reason: `Not more ${pollEntitlement} for than against on a poll` };
    return againstUE <= f * votesPresentEntitlement + EPSILON
      ? {
          passed: true,
          reason: `More ${pollEntitlement} for than against on a poll, and the ${pollEntitlement} against is not more than ${percent(f)} of that of those present`,
        }
      : { passed: false, reason: `The ${pollEntitlement} against is more than ${percent(f)} of that of those present, on a poll` };
  }
  if (tally.votesPresentCount == null) return undetermined("The votes those present could cast are needed to count this resolution");
  if (!(tally.forCount > tally.againstCount)) return { passed: false, reason: "Not more votes for than against" };
  return tally.againstCount <= f * tally.votesPresentCount + EPSILON
    ? { passed: true, reason: `More votes for than against, and the votes against are not more than ${percent(f)} of the votes those present could cast` }
    : { passed: false, reason: `Votes against are more than ${percent(f)} of the votes those present could cast` };
}

/** An immutable snapshot of the rule set to store against a meeting. */
export function snapshotRuleSet(ruleSet: MeetingRuleSet) {
  return { ...ruleSet };
}
