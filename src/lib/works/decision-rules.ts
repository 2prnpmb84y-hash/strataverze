/**
 * Works decisions by the committee (pure, 25 Oct 2026). A member proposes
 * a decision; it is made once enough members vote for it under the
 * building's rule, and fails once enough vote against that it can no longer
 * be made. Decisions are electronic votes with no meeting needed (Matthew's
 * reading of SSMA Sch 2 as in force, 25 Oct 2026).
 */
import type { ApprovalRule } from "@/config/works";

export type DecisionRule = ApprovalRule | "URGENT" | "DELEGATED";

/**
 * Votes needed for a decision. Urgent works can be decided by any one
 * member (the building's urgent spending limit applies to the work order).
 * Null when the building has no committee members to vote.
 */
export function votesRequired(rule: ApprovalRule, committeeSize: number, opts: { urgent?: boolean } = {}): { rule: DecisionRule; required: number } | null {
  if (committeeSize < 1) return null;
  if (opts.urgent) return { rule: "URGENT", required: 1 };
  if (rule === "ONE") return { rule, required: 1 };
  if (rule === "TWO") return { rule, required: Math.min(2, committeeSize) };
  return { rule, required: Math.floor(committeeSize / 2) + 1 };
}

export type Tally = { status: "OPEN" | "DECIDED" | "NOT_AGREED"; votesFor: number; votesAgainst: number };

/** Where a decision stands after these votes. */
export function tally(required: number, committeeSize: number, votes: ReadonlyArray<{ vote: string }>): Tally {
  const votesFor = votes.filter((v) => v.vote === "FOR").length;
  const votesAgainst = votes.filter((v) => v.vote === "AGAINST").length;
  if (votesFor >= required) return { status: "DECIDED", votesFor, votesAgainst };
  // Enough against that the rest of the committee could not reach it.
  if (committeeSize - votesAgainst < required) return { status: "NOT_AGREED", votesFor, votesAgainst };
  return { status: "OPEN", votesFor, votesAgainst };
}

/** How a works request is handled, and what each choice does to it. */
export const ROUTE_OUTCOMES = {
  URGENT: { label: "Urgent: order the work now", status: "PROCUREMENT", review: "EMERGENCY_APPROVED", procurementRoute: "EMERGENCY" },
  QUOTES: { label: "Get quotes", status: "PROCUREMENT", review: "APPROVED", procurementRoute: "SELECTIVE_TENDER" },
  RETURN: { label: "Return to the owner for more detail", status: "DRAFT", review: "RETURNED", procurementRoute: null },
  DECLINE: { label: "Decline", status: "CLOSED", review: "REJECTED", procurementRoute: null },
} as const;

export type RouteOutcome = keyof typeof ROUTE_OUTCOMES;

export function isRouteOutcome(value: unknown): value is RouteOutcome {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ROUTE_OUTCOMES, value);
}

/** A plain-English status for owners and the committee. */
export function requestStatusLabel(r: { status: string; isEmergency?: boolean | null; returnReason?: string | null }): string {
  switch (r.status) {
    case "DRAFT":
      return r.returnReason ? "Returned for more detail" : "Draft";
    case "SUBMITTED":
      return "Waiting for the committee";
    case "UNDER_REVIEW":
      return "Committee deciding";
    case "PROCUREMENT":
      return r.isEmergency ? "Urgent: contractor being arranged" : "Getting quotes";
    case "SCOPE_PREPARATION":
      return "Scope being prepared";
    case "APPROVAL":
      return "Quote approved: contractor confirming";
    case "DELIVERY":
      return "Work under way";
    case "CLOSE_OUT":
      return "Work done: invoice and payment";
    case "CLOSED":
      return "Closed";
    default:
      return r.status;
  }
}

/** A sentence on where a decision's votes stand. */
export function votesSentence(t: Tally, required: number): string {
  if (t.status === "DECIDED") return `Agreed (${t.votesFor} for${t.votesAgainst ? `, ${t.votesAgainst} against` : ""}).`;
  if (t.status === "NOT_AGREED") return `Not agreed (${t.votesAgainst} against).`;
  const more = required - t.votesFor;
  return `${t.votesFor} of ${required} vote${required === 1 ? "" : "s"} needed so far; ${more} more to agree.`;
}
