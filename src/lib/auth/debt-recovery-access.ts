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
 * case for a lot they own or co-own (a committee member who is also liable
 * for the debt). `lotOwnerIds` are the profiles holding an OWNER membership
 * on the case's lot, active or recently ended.
 */
export function caseAccessProblem(
  caseRow: CaseForAccess | null | undefined,
  schemeId: string,
  profileId: string,
  lotOwnerIds: readonly string[] = [],
): string | null {
  if (!caseRow || caseRow.schemeId !== schemeId) return "Case not found.";
  if ((caseRow.ownerId && caseRow.ownerId === profileId) || lotOwnerIds.includes(profileId)) {
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

/** A case's recovery step, as far as the order of the steps goes. */
export type StepForOrder = { id: string; stepType: string; stepOrder: number; status: string };

/**
 * The case's current step: the first step not yet complete, by step order,
 * when it is also the step the case records as current (`currentStep`, moved
 * to the next step by order as each step is completed). It is the one step
 * the case screens offer to complete. Null when the case has no such step
 * (every step is complete, or the record and the steps disagree, in which
 * case nothing may be completed rather than a step passed over).
 */
export function currentRecoveryStep<T extends StepForOrder>(caseRow: { currentStep: string | null }, steps: readonly T[]): T | null {
  const next = [...steps].sort((a, b) => a.stepOrder - b.stepOrder).find((s) => s.status !== "COMPLETED");
  return next && next.stepType === caseRow.currentStep ? next : null;
}

/**
 * Why this step may not be completed now, or null if it may. As the case
 * screens allow: only the current step, and only while the case is open.
 * `labels` are the building's step names (`rules.DEBT_RECOVERY_STEP_LABELS`).
 */
export function stepCompletionProblem(
  caseRow: { status: string; currentStep: string | null },
  steps: readonly StepForOrder[],
  stepId: string,
  labels: Readonly<Record<string, string>> = {},
): string | null {
  if (isClosedStatus(caseRow.status)) return "This case is closed, so its steps cannot be completed.";
  const step = steps.find((s) => s.id === stepId);
  if (!step) return "Step not found";
  if (step.status === "COMPLETED") return "This step is already complete";
  const current = currentRecoveryStep(caseRow, steps);
  if (current?.id === step.id) return null;
  return current
    ? `Steps are completed in order. Complete ${labels[current.stepType] ?? current.stepType} first.`
    : "Steps are completed in order, and this step is not the current step.";
}

/** Whether the case's legal referral step is complete, so it may be marked as referred for legal recovery. */
export function legalReferralComplete(steps: readonly Pick<StepForOrder, "stepType" | "status">[]): boolean {
  return steps.some((s) => s.stepType === "LEGAL_REFERRAL" && s.status === "COMPLETED");
}
