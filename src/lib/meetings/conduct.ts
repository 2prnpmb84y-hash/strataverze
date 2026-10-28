/**
 * Conduct helpers (pure).
 *
 * Maps a chair's recorded outcome (and optional vote tally) to the stored
 * agenda-item outcome and status, using the rule set to evaluate the tally per
 * resolution category (the categories are the building's rule set's).
 */
import {
  evaluateResolution,
  isResolutionCategory,
  type MeetingRuleSet,
  type ResolutionOutcome,
  type ResolutionTally,
} from "./rules";

export const OUTCOMES = ["RESOLVED", "MOTION_LOST", "DEFERRED"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export function isOutcome(value: string): value is Outcome {
  return (OUTCOMES as readonly string[]).includes(value);
}

/** The agenda-item status that corresponds to an outcome. */
export function statusForOutcome(outcome: Outcome): string {
  switch (outcome) {
    case "RESOLVED":
      return "CARRIED";
    case "MOTION_LOST":
      return "LOST";
    case "DEFERRED":
      return "DEFERRED";
  }
}

export interface OutcomeResult {
  outcome: Outcome;
  status: string;
  /** Present when a tally was supplied and evaluated. */
  evaluation?: ResolutionOutcome;
  /**
   * Why the outcome cannot be recorded, where the count gives neither carried
   * nor lost (the draft packs only: an interim resolution, or one the count
   * cannot decide). Nothing may be written then. Left out otherwise.
   */
  refused?: string;
}

/** "a" or "an" before a name, by its first sound: "a unanimous resolution", "an interim special resolution". */
const article = (text: string) => (/^[aeiou]/i.test(text) && !/^(?:unan|uni|use|usu)/i.test(text) ? `an ${text}` : `a ${text}`);

/**
 * What the chair is told when the count gives neither carried nor lost (VIC,
 * ACT and WA stage 2, PR 8a-i, 28 Oct 2026). Plain words; the reason comes
 * from the evaluation.
 */
function countRefusal(ruleSet: Pick<MeetingRuleSet, "resolutionLabels">, evaluation: ResolutionOutcome): string {
  if (evaluation.result === "INTERIM") {
    const name = evaluation.interimCategory
      ? (ruleSet.resolutionLabels[evaluation.interimCategory]?.full ?? evaluation.interimCategory).toLowerCase()
      : "interim resolution";
    return `The votes recorded make this motion ${article(name)}. ${evaluation.reason}. StrataVerze does not record interim resolutions yet, so this outcome cannot be recorded here. Nothing was saved. The item can be deferred.`;
  }
  return `The votes recorded cannot decide this motion. ${evaluation.reason}. Nothing was saved. The item can be deferred.`;
}

/**
 * Resolve the outcome for an agenda item. If a tally is supplied, the rule set
 * evaluates it for the item's resolution category and the pass/fail drives the
 * outcome (carried vs lost); an explicit DEFERRED is always honoured. Where
 * the count gives neither (an interim resolution, or one it cannot decide:
 * the draft packs only), the result carries `refused` and must not be written.
 */
export function resolveOutcome(
  ruleSet: MeetingRuleSet,
  params: {
    requestedOutcome: Outcome;
    resolutionCategory?: string | null;
    tally?: ResolutionTally | null;
    /** The entitlement a poll is counted by, as the building's pack names it (see evaluateResolution). */
    pollEntitlement?: string;
  },
): OutcomeResult {
  if (params.requestedOutcome === "DEFERRED") {
    return { outcome: "DEFERRED", status: statusForOutcome("DEFERRED") };
  }

  if (params.tally && isResolutionCategory(ruleSet, params.resolutionCategory)) {
    const evaluation = evaluateResolution(
      ruleSet,
      params.resolutionCategory,
      params.tally,
      params.pollEntitlement,
    );
    // Neither carried nor lost (the draft packs only): refused, and nothing is written.
    if (evaluation.result) {
      return {
        outcome: params.requestedOutcome,
        status: statusForOutcome(params.requestedOutcome),
        evaluation,
        refused: countRefusal(ruleSet, evaluation),
      };
    }
    const outcome: Outcome = evaluation.passed ? "RESOLVED" : "MOTION_LOST";
    return { outcome, status: statusForOutcome(outcome), evaluation };
  }

  return {
    outcome: params.requestedOutcome,
    status: statusForOutcome(params.requestedOutcome),
  };
}
