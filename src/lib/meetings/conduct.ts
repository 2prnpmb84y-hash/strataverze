/**
 * Conduct helpers (pure).
 *
 * Maps a chair's recorded outcome (and optional vote tally) to the stored
 * agenda-item outcome and status, using the rule set to evaluate the tally per
 * resolution category.
 */
import {
  evaluateResolution,
  type MeetingRuleSet,
  type ResolutionCategory,
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
  evaluation?: { passed: boolean; reason: string };
}

/**
 * Resolve the outcome for an agenda item. If a tally is supplied, the rule set
 * evaluates it for the item's resolution category and the pass/fail drives the
 * outcome (carried vs lost); an explicit DEFERRED is always honoured.
 */
export function resolveOutcome(
  ruleSet: MeetingRuleSet,
  params: {
    requestedOutcome: Outcome;
    resolutionCategory?: string | null;
    tally?: ResolutionTally | null;
  },
): OutcomeResult {
  if (params.requestedOutcome === "DEFERRED") {
    return { outcome: "DEFERRED", status: statusForOutcome("DEFERRED") };
  }

  if (
    params.tally &&
    params.resolutionCategory &&
    (["ORDINARY", "SPECIAL", "UNANIMOUS", "SUSTAINABILITY_INFRASTRUCTURE"] as string[]).includes(
      params.resolutionCategory,
    )
  ) {
    const evaluation = evaluateResolution(
      ruleSet,
      params.resolutionCategory as ResolutionCategory,
      params.tally,
    );
    const outcome: Outcome = evaluation.passed ? "RESOLVED" : "MOTION_LOST";
    return { outcome, status: statusForOutcome(outcome), evaluation };
  }

  return {
    outcome: params.requestedOutcome,
    status: statusForOutcome(params.requestedOutcome),
  };
}
