/**
 * Insurance status logic (pure, no DB).
 *
 * Three independent concerns live here:
 *  - policy lifecycle status, derived from its dates (kept separate from renewal)
 *  - the claim status machine
 *  - the renewal stage machine
 */

import type { PolicyStatus } from "./constants";

// ─── Policy lifecycle ────────────────────────────────────────────

export interface PolicyDates {
  startDate: Date;
  endDate: Date;
  /** Explicit override: DRAFT or CANCELLED are set by a user and win over dates. */
  status?: string | null;
}

/**
 * Effective lifecycle status of a policy. DRAFT and CANCELLED are explicit and
 * take precedence. Otherwise the status is derived from the current date:
 * UPCOMING before it starts, EXPIRED after it ends, ACTIVE in between.
 */
export function derivePolicyStatus(
  policy: PolicyDates,
  now: Date = new Date(),
): PolicyStatus {
  if (policy.status === "DRAFT") return "DRAFT";
  if (policy.status === "CANCELLED") return "CANCELLED";
  if (now.getTime() < policy.startDate.getTime()) return "UPCOMING";
  if (now.getTime() > policy.endDate.getTime()) return "EXPIRED";
  return "ACTIVE";
}

/** Whole days until a policy expires. Negative once expired. */
export function daysUntilExpiry(endDate: Date, now: Date = new Date()): number {
  const ms = startOfDay(endDate).getTime() - startOfDay(now).getTime();
  return Math.round(ms / 86_400_000);
}

function startOfDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

// ─── Claim status machine ────────────────────────────────────────

export type ClaimStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "ACKNOWLEDGED"
  | "UNDER_ASSESSMENT"
  | "FURTHER_INFO_REQUIRED"
  | "APPROVED"
  | "PARTIALLY_APPROVED"
  | "DECLINED"
  | "WITHDRAWN"
  | "CLOSED";

export const CLAIM_STATUSES: ClaimStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "ACKNOWLEDGED",
  "UNDER_ASSESSMENT",
  "FURTHER_INFO_REQUIRED",
  "APPROVED",
  "PARTIALLY_APPROVED",
  "DECLINED",
  "WITHDRAWN",
  "CLOSED",
];

/**
 * Permitted claim transitions. The insurer's coverage decision (APPROVED /
 * PARTIALLY_APPROVED / DECLINED) is kept separate from administrative progress:
 * a decided claim still moves to CLOSED when the matter is finalised.
 */
const CLAIM_TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  DRAFT: ["SUBMITTED", "WITHDRAWN"],
  SUBMITTED: ["ACKNOWLEDGED", "UNDER_ASSESSMENT", "WITHDRAWN"],
  ACKNOWLEDGED: ["UNDER_ASSESSMENT", "WITHDRAWN"],
  UNDER_ASSESSMENT: [
    "FURTHER_INFO_REQUIRED",
    "APPROVED",
    "PARTIALLY_APPROVED",
    "DECLINED",
    "WITHDRAWN",
  ],
  FURTHER_INFO_REQUIRED: ["UNDER_ASSESSMENT", "WITHDRAWN"],
  APPROVED: ["CLOSED"],
  PARTIALLY_APPROVED: ["CLOSED"],
  DECLINED: ["UNDER_ASSESSMENT", "CLOSED"],
  WITHDRAWN: [],
  CLOSED: [],
};

export function isClaimStatus(value: string): value is ClaimStatus {
  return (CLAIM_STATUSES as string[]).includes(value);
}

export function canTransitionClaim(from: string, to: string): boolean {
  if (!isClaimStatus(from) || !isClaimStatus(to)) return false;
  return CLAIM_TRANSITIONS[from].includes(to);
}

export function allowedClaimTransitions(from: string): ClaimStatus[] {
  return isClaimStatus(from) ? [...CLAIM_TRANSITIONS[from]] : [];
}

export function isTerminalClaim(status: string): boolean {
  return (
    isClaimStatus(status) && CLAIM_TRANSITIONS[status].length === 0
  );
}

/** A decision has been recorded by the insurer (vs purely administrative state). */
export function isClaimDecided(status: string): boolean {
  return (
    status === "APPROVED" ||
    status === "PARTIALLY_APPROVED" ||
    status === "DECLINED"
  );
}

// ─── Renewal stage machine ───────────────────────────────────────

export type RenewalStage =
  | "NOT_STARTED"
  | "INFORMATION_REQUIRED"
  | "QUOTES_REQUESTED"
  | "QUOTES_RECEIVED"
  | "UNDER_REVIEW"
  | "AWAITING_APPROVAL"
  | "PLACEMENT_REQUESTED"
  | "COVER_CONFIRMED"
  | "COMPLETED"
  | "NOT_PROCEEDING";

export const RENEWAL_STAGES: RenewalStage[] = [
  "NOT_STARTED",
  "INFORMATION_REQUIRED",
  "QUOTES_REQUESTED",
  "QUOTES_RECEIVED",
  "UNDER_REVIEW",
  "AWAITING_APPROVAL",
  "PLACEMENT_REQUESTED",
  "COVER_CONFIRMED",
  "COMPLETED",
  "NOT_PROCEEDING",
];

/**
 * The ordered "happy path" stages. Any active stage may also branch to
 * NOT_PROCEEDING. Internal approval or a placement request is never treated as
 * confirmation that cover is bound; only COVER_CONFIRMED means bound.
 */
const RENEWAL_ORDER: RenewalStage[] = [
  "NOT_STARTED",
  "INFORMATION_REQUIRED",
  "QUOTES_REQUESTED",
  "QUOTES_RECEIVED",
  "UNDER_REVIEW",
  "AWAITING_APPROVAL",
  "PLACEMENT_REQUESTED",
  "COVER_CONFIRMED",
  "COMPLETED",
];

export function isRenewalStage(value: string): value is RenewalStage {
  return (RENEWAL_STAGES as string[]).includes(value);
}

/**
 * A renewal may move forward or back along the ordered stages (to correct a
 * mistake), or to NOT_PROCEEDING from any non-terminal stage. COMPLETED and
 * NOT_PROCEEDING are terminal.
 */
export function canAdvanceRenewal(from: string, to: string): boolean {
  if (!isRenewalStage(from) || !isRenewalStage(to)) return false;
  if (from === to) return false;
  if (from === "COMPLETED" || from === "NOT_PROCEEDING") return false;
  if (to === "NOT_PROCEEDING") return true;
  const fromIdx = RENEWAL_ORDER.indexOf(from);
  const toIdx = RENEWAL_ORDER.indexOf(to);
  if (fromIdx === -1 || toIdx === -1) return false;
  // COMPLETED may only follow COVER_CONFIRMED.
  if (to === "COMPLETED") return from === "COVER_CONFIRMED";
  return true;
}

export function isTerminalRenewal(stage: string): boolean {
  return stage === "COMPLETED" || stage === "NOT_PROCEEDING";
}

/** 0..1 progress along the happy path, for a progress indicator. */
export function renewalProgress(stage: string): number {
  if (!isRenewalStage(stage)) return 0;
  if (stage === "NOT_PROCEEDING") return 0;
  const idx = RENEWAL_ORDER.indexOf(stage);
  if (idx === -1) return 0;
  return idx / (RENEWAL_ORDER.length - 1);
}
