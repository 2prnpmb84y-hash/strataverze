/**
 * Rules for who may act on a debt recovery case, and which values an action
 * may write. Pure, so they can be unit tested; the server actions in
 * src/lib/actions/debt-recovery.ts load the records and apply them.
 *
 * Security finding SEC-003: these actions previously checked only that the
 * caller was signed in, so a defaulting owner could mark their own
 * instalments paid or write off their own case.
 */

export const CASE_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "PAYMENT_PLAN",
  "ON_HOLD",
  "REFERRED_LEGAL",
  "CLOSED_PAID",
  "CLOSED_WRITTEN_OFF",
  "CLOSED_SETTLED",
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const CLOSED_STATUSES = ["CLOSED_PAID", "CLOSED_WRITTEN_OFF", "CLOSED_SETTLED"] as const;
export type ClosedStatus = (typeof CLOSED_STATUSES)[number];

export const CASE_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

/** Longest free-text note or reason accepted. */
export const MAX_NOTE_LENGTH = 5000;

export function isCaseStatus(value: unknown): value is CaseStatus {
  return typeof value === "string" && (CASE_STATUSES as readonly string[]).includes(value);
}

export function isClosedStatus(value: unknown): value is ClosedStatus {
  return typeof value === "string" && (CLOSED_STATUSES as readonly string[]).includes(value);
}

export function isCasePriority(value: unknown): boolean {
  return typeof value === "string" && (CASE_PRIORITIES as readonly string[]).includes(value);
}

export type CaseForAccess = {
  schemeId: string;
  ownerId: string | null;
  status: string;
};

/**
 * Why the caller may not act on this case, or null if they may.
 *
 * The caller has already been authorised as ADVISER or COMMITTEE on
 * `schemeId`. The case must belong to that scheme, and nobody may act on the
 * case for their own lot (a committee member who is also the debtor).
 */
export function caseAccessProblem(
  caseRow: CaseForAccess | null | undefined,
  schemeId: string,
  profileId: string,
): string | null {
  if (!caseRow || caseRow.schemeId !== schemeId) return "Case not found.";
  if (caseRow.ownerId && caseRow.ownerId === profileId) {
    return "You cannot act on a debt recovery case for your own lot.";
  }
  return null;
}

/** Whether the case is already closed. */
export function isCaseClosed(caseRow: CaseForAccess): boolean {
  return isClosedStatus(caseRow.status);
}

/** The initiating role, taken from the caller's memberships, never the client. */
export function initiatingRole(roles: readonly string[]): "ADVISER" | "COMMITTEE" | null {
  if (roles.includes("ADVISER")) return "ADVISER";
  if (roles.includes("COMMITTEE")) return "COMMITTEE";
  return null;
}

/** A positive, finite amount of money with at most two decimal places. */
export function isValidAmount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    Math.abs(value * 100 - Math.round(value * 100)) < 1e-6
  );
}
