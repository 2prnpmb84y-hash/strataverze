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

export type ResolutionCategory =
  | "ORDINARY"
  | "SPECIAL"
  | "UNANIMOUS"
  | "SUSTAINABILITY_INFRASTRUCTURE";

export interface QuorumRule {
  /** PERCENT_PRESENT_OR_UE: quorum on head count OR unit entitlement. HALF_MEMBERS: committee. */
  basis: "PERCENT_PRESENT_OR_UE" | "HALF_MEMBERS";
  percent?: number;
  minPersons?: number;
}

export interface ResolutionRule {
  /**
   * COUNT_MAJORITY: majority of votes cast (poll switches to UE weighting).
   * UE_AGAINST_THRESHOLD: fails if against (by unit entitlement) >= threshold.
   * NO_AGAINST: fails on any against vote.
   */
  basis: "COUNT_MAJORITY" | "UE_AGAINST_THRESHOLD" | "NO_AGAINST";
  /** Fraction of against votes (by unit entitlement) at or above which the motion fails. */
  againstThreshold?: number;
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
  resolutionCategories: Record<ResolutionCategory, ResolutionRule>;
  retention: { generalYears: number; secretBallotMonths: number };
  /** Pre-meeting electronic voting (Reg cl 14-17). */
  preMeetingEvoting: {
    /** Ballot access must be given at least this many days before (cl 15). */
    ballotOpenDaysBefore: number;
    /** Ballot closes this many hours before the meeting, by meeting type (cl 17). */
    ballotCloseHoursBefore: Partial<Record<MeetingType, number>>;
  };
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
}

export interface ResolutionOutcome {
  passed: boolean;
  reason: string;
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

    default:
      return { passed: false, reason: "Unsupported resolution rule" };
  }
}

/** An immutable snapshot of the rule set to store against a meeting. */
export function snapshotRuleSet(ruleSet: MeetingRuleSet) {
  return { ...ruleSet };
}
