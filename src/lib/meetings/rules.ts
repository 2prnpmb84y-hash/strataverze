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
 * building's rule set.
 */
export type ResolutionCategory =
  | "ORDINARY"
  | "SPECIAL"
  | "UNANIMOUS"
  | "SUSTAINABILITY_INFRASTRUCTURE"
  | "WITHOUT_DISSENT"
  | "MAJORITY";

export interface QuorumRule {
  /**
   * PERCENT_PRESENT_OR_UE: quorum on head count OR unit entitlement (NSW).
   * HALF_MEMBERS: committee.
   * PERCENT_VOTERS_WITH_MIN_PRESENT: at least `percent` of the voters, with at
   * least `minPersons` present personally where there are `minPersonsFromVoters`
   * or more voters, else `minPersonsBelow` (Queensland, SM s 99). Held as data:
   * quorum is not evaluated yet.
   */
  basis: "PERCENT_PRESENT_OR_UE" | "HALF_MEMBERS" | "PERCENT_VOTERS_WITH_MIN_PRESENT";
  percent?: number;
  minPersons?: number;
  /** PERCENT_VOTERS_WITH_MIN_PRESENT: the number of voters from which `minPersons` applies. */
  minPersonsFromVoters?: number;
  /** PERCENT_VOTERS_WITH_MIN_PRESENT: the least present personally where there are fewer voters. */
  minPersonsBelow?: number;
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
   */
  basis:
    | "COUNT_MAJORITY"
    | "UE_AGAINST_THRESHOLD"
    | "NO_AGAINST"
    | "TWO_THIRDS_LOTS_AND_ENTITLEMENT_CAPS"
    | "MORE_THAN_HALF_OF_LOTS";
  /** Fraction of against votes (by unit entitlement) at or above which the motion fails. */
  againstThreshold?: number;
  /** TWO_THIRDS_LOTS_AND_ENTITLEMENT_CAPS: the least share of the votes cast that must be for ("at least"). */
  forAtLeastFractionOfVotesCast?: number;
  /** TWO_THIRDS_LOTS_AND_ENTITLEMENT_CAPS: the most votes against, as a share of the lots in the scheme. */
  againstMaxFractionOfLots?: number;
  /** TWO_THIRDS_LOTS_AND_ENTITLEMENT_CAPS: the most entitlement held by the lots against, as a share of the total. */
  againstMaxFractionOfEntitlement?: number;
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
}

/** Whether a value is one of the building's resolution categories (one its rule set has a rule for). */
export function isResolutionCategory(
  ruleSet: Pick<MeetingRuleSet, "resolutionCategories">,
  category: string | null | undefined,
): category is ResolutionCategory {
  return !!category && Object.prototype.hasOwnProperty.call(ruleSet.resolutionCategories, category);
}

/** Evaluate whether a resolution passes, per the rule for its category. */
export function evaluateResolution(
  ruleSet: MeetingRuleSet,
  category: ResolutionCategory,
  tally: ResolutionTally,
): ResolutionOutcome {
  const rule = ruleSet.resolutionCategories[category];
  if (!rule) {
    return { passed: false, reason: `Unknown resolution category ${category}` };
  }

  switch (rule.basis) {
    case "NO_AGAINST":
      return tally.againstCount === 0
        ? { passed: true, reason: "No vote cast against (unanimous)" }
        : { passed: false, reason: `${tally.againstCount} vote(s) against` };

    case "COUNT_MAJORITY": {
      if (tally.poll && tally.forUE != null && tally.againstUE != null) {
        return tally.forUE > tally.againstUE
          ? { passed: true, reason: "Majority by unit entitlement on a poll" }
          : { passed: false, reason: "Not carried by unit entitlement on a poll" };
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

    default:
      return { passed: false, reason: "Unsupported resolution rule" };
  }
}

/** An immutable snapshot of the rule set to store against a meeting. */
export function snapshotRuleSet(ruleSet: MeetingRuleSet) {
  return { ...ruleSet };
}
