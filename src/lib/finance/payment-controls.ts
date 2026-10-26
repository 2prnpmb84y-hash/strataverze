/**
 * Payment controls (pure): dual authorisation of disbursements, segregation
 * of duties and supplier bank detail change control.
 *
 * Money is handled in whole cents. Nothing here reads the database.
 */
import { dayIn } from "@/lib/jurisdiction/time-zone";

// ─── Scheme payment policy ──────────────────────────────────────────────────

export interface PaymentPolicy {
  /** An invoice up to this amount (cents, incl. GST) needs one approver. */
  singleApproverLimitCents: number;
  /**
   * Optional separate threshold above which a second approver is required.
   * When unset, singleApproverLimitCents is the threshold.
   */
  requireSecondApproverAboveCents: number | null;
  /**
   * When a second approver is required but the scheme has only one eligible
   * approver, that person may approve alone. The exception is logged and the
   * invoice shows a banner. Off by default.
   */
  allowSelfApproval: boolean;
  /** Advisers (strata managers) may approve payments. Off by default: the adviser is also a supplier. */
  allowAdviserApproval: boolean;
}

export const DEFAULT_PAYMENT_POLICY: PaymentPolicy = {
  singleApproverLimitCents: 0,
  requireSecondApproverAboveCents: null,
  allowSelfApproval: false,
  allowAdviserApproval: false,
};

/** The amount above which two approvers are needed. */
export function secondApproverThresholdCents(policy: PaymentPolicy): number {
  return policy.requireSecondApproverAboveCents ?? policy.singleApproverLimitCents;
}

/** How many distinct approvers an invoice of this amount needs under the policy. */
export function approversRequired(policy: PaymentPolicy, amountCents: number): 1 | 2 {
  return amountCents > secondApproverThresholdCents(policy) ? 2 : 1;
}

/**
 * Which parts of a policy change loosen the controls: allowing self or
 * adviser approval, raising the approval limits, or shortening the bank
 * change cooling-off period. Empty when the change only tightens or keeps them.
 */
export function policyLoosening(
  current: { policy: PaymentPolicy; coolingOffDays: number },
  next: PaymentPolicy & { coolingOffDays: number },
): string[] {
  const loosened: string[] = [];
  if (next.allowSelfApproval && !current.policy.allowSelfApproval) loosened.push("allowSelfApproval");
  if (next.allowAdviserApproval && !current.policy.allowAdviserApproval) loosened.push("allowAdviserApproval");
  if (next.singleApproverLimitCents > current.policy.singleApproverLimitCents) loosened.push("singleApproverLimit");
  if (secondApproverThresholdCents(next) > secondApproverThresholdCents(current.policy)) {
    loosened.push("requireSecondApproverAbove");
  }
  if (next.coolingOffDays < current.coolingOffDays) loosened.push("coolingOffDays");
  return loosened;
}

// ─── Who may approve ────────────────────────────────────────────────────────

export interface SchemeMember {
  profileId: string;
  role: string;
  isActive: boolean;
  isTreasurer: boolean;
}

/** Whether a membership makes someone an eligible payment approver. */
export function isEligibleApprover(member: SchemeMember, policy: PaymentPolicy): boolean {
  if (!member.isActive) return false;
  if (member.role === "PAYMENT_AUTHORISER") return true;
  if (member.role === "COMMITTEE" && member.isTreasurer) return true;
  if (member.role === "ADVISER" && policy.allowAdviserApproval) return true;
  return false;
}

/** The distinct people who may approve payments for a scheme. */
export function eligibleApprovers(members: SchemeMember[], policy: PaymentPolicy): string[] {
  return [...new Set(members.filter((m) => isEligibleApprover(m, policy)).map((m) => m.profileId))];
}

// ─── Segregation of duties ──────────────────────────────────────────────────

export type ControlledAction = "PREPARE" | "APPROVE" | "RECORD_PAYMENT";

export interface InvoiceForControls {
  amountCents: number;
  status: string;
  /** Who prepared (entered or assessed) the invoice. Null for system invoices. */
  preparedById: string | null;
  /** Approvals already given, in order. */
  authorisedBy: string[];
}

export interface ControlContext {
  policy: PaymentPolicy;
  /** Eligible approvers for the scheme (see eligibleApprovers). */
  eligibleApproverIds: string[];
}

export type ControlDecision =
  | { result: "allowed"; reason?: string }
  | { result: "exception"; reason: string }
  | { result: "blocked"; reason: string };

const APPROVABLE = new Set(["DRAFT", "AWAITING_APPROVAL", "SUBMITTED", "UNDER_ASSESSMENT", "AWAITING_AUTHORISATION"]);
const PAYABLE = new Set(["APPROVED", "PARTIALLY_PAID", "PAYMENT_INSTRUCTED"]);

/**
 * Whether `actorId` may take `action` on the invoice.
 *
 * - PREPARE: anyone with a preparing role; nobody may prepare an invoice they
 *   have already approved.
 * - APPROVE: never the preparer, never twice, only an eligible approver.
 *   When a second approver is needed and the scheme has only one eligible
 *   approver, it is an exception if the policy allows self approval and
 *   blocked otherwise.
 * - RECORD_PAYMENT: only once approved. Recording a payment you prepared, or
 *   on an invoice you alone approved, is allowed as a logged exception.
 */
export function checkSegregation(
  action: ControlledAction,
  actorId: string,
  invoice: InvoiceForControls,
  context: ControlContext,
): ControlDecision {
  switch (action) {
    case "PREPARE":
      if (invoice.authorisedBy.includes(actorId)) {
        return { result: "blocked", reason: "You approved this invoice, so you cannot also prepare it." };
      }
      return { result: "allowed" };

    case "APPROVE": {
      if (!APPROVABLE.has(invoice.status)) {
        return { result: "blocked", reason: "This invoice is not waiting for approval." };
      }
      if (invoice.preparedById && invoice.preparedById === actorId) {
        return { result: "blocked", reason: "You prepared this invoice, so someone else must approve it." };
      }
      if (invoice.authorisedBy.includes(actorId)) {
        return { result: "blocked", reason: "You have already approved this invoice. A different person must give the second approval." };
      }
      if (!context.eligibleApproverIds.includes(actorId)) {
        return {
          result: "blocked",
          reason: "Only the treasurer, a payment authoriser, or an adviser the committee has allowed can approve payments.",
        };
      }
      const required = approversRequired(context.policy, invoice.amountCents);
      const othersAvailable = context.eligibleApproverIds.filter(
        (id) => id !== actorId && id !== invoice.preparedById && !invoice.authorisedBy.includes(id),
      ).length;
      const isLast = invoice.authorisedBy.length + 1 >= required;
      if (!isLast && othersAvailable === 0) {
        // A second approver is needed but nobody else can give it.
        if (context.policy.allowSelfApproval) {
          return {
            result: "exception",
            reason: "This scheme has only one eligible approver, so this invoice was approved by one person instead of two.",
          };
        }
        return {
          result: "blocked",
          reason:
            "This invoice needs two approvers but the scheme has only one. Flag another treasurer or payment authoriser, or allow single approval in the payment policy.",
        };
      }
      return { result: "allowed" };
    }

    case "RECORD_PAYMENT": {
      if (!PAYABLE.has(invoice.status)) {
        return { result: "blocked", reason: "This invoice has not been approved for payment." };
      }
      if (invoice.preparedById && invoice.preparedById === actorId) {
        return { result: "exception", reason: "The person recording this payment also prepared the invoice." };
      }
      if (invoice.authorisedBy.length === 1 && invoice.authorisedBy[0] === actorId) {
        return { result: "exception", reason: "The person recording this payment was its only approver." };
      }
      return { result: "allowed" };
    }
  }
}

/**
 * After an approval is added: has the invoice reached the approvals it needs?
 * `singleApproverException` is true when one approval is accepted in place of
 * two under the self approval exception.
 */
export function approvalComplete(
  policy: PaymentPolicy,
  amountCents: number,
  approvals: number,
  singleApproverException: boolean,
): boolean {
  if (singleApproverException) return approvals >= 1;
  return approvals >= approversRequired(policy, amountCents);
}

// ─── Supplier bank detail change control ────────────────────────────────────

export type BankDetailStatus = "PENDING" | "VERIFIED" | "REJECTED";
export type VerificationMethod = "CALLBACK" | "SUPPLIER_PORTAL_CONFIRMED" | "DOCUMENT";

export interface BankDetailVersionForControls {
  status: BankDetailStatus;
  changedById: string;
  /** ISO timestamp of the change. */
  changedAt: string;
  verifiedById: string | null;
  verifiedAt: string | null;
  verificationMethod: VerificationMethod | null;
  secondVerifiedById: string | null;
}

/** Default cooling-off period after a bank detail change, in business days. */
export const DEFAULT_BANK_CHANGE_COOLING_OFF_BUSINESS_DAYS = 5;

/** Monday to Friday business days from `from` to `to` (dates in the building's time zone). Public holidays are not excluded. */
export function businessDaysBetween(fromIso: string, toIso: string, timeZone: string): number {
  const toDay = (iso: string) => dayIn(timeZone, iso);
  const start = new Date(`${toDay(fromIso)}T00:00:00Z`);
  const end = new Date(`${toDay(toIso)}T00:00:00Z`);
  let days = 0;
  for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
    const next = new Date(d);
    next.setUTCDate(next.getUTCDate() + 1);
    const dow = next.getUTCDay();
    if (dow !== 0 && dow !== 6) days += 1;
  }
  return days;
}

/**
 * Whether a payment to the supplier may go ahead given the latest bank detail
 * version. A pending change blocks payment. A change within the cooling-off
 * period also needs a second, different person to verify it.
 */
export function checkBankDetailsForPayment(
  latest: BankDetailVersionForControls | null,
  now: string,
  coolingOffBusinessDays: number,
  /** The building's time zone: business days are counted in it. */
  timeZone: string,
): ControlDecision {
  if (!latest) return { result: "allowed" };
  if (latest.status === "PENDING") {
    return { result: "blocked", reason: "The supplier's bank details were changed and have not been verified. Verify them before paying." };
  }
  if (latest.status === "REJECTED") {
    return { result: "blocked", reason: "The supplier's latest bank details were rejected. Enter and verify correct details before paying." };
  }
  const withinCoolingOff = businessDaysBetween(latest.changedAt, now, timeZone) < coolingOffBusinessDays;
  if (withinCoolingOff && !latest.secondVerifiedById) {
    return {
      result: "blocked",
      reason: `The supplier's bank details changed within the last ${coolingOffBusinessDays} business days. A second person must also verify them before payment.`,
    };
  }
  return { result: "allowed" };
}

/** Who may verify a bank detail change: never the person who made it, and the second verifier must differ from the first. */
export function canVerifyBankChange(
  version: BankDetailVersionForControls,
  actorId: string,
): { ok: true; slot: "FIRST" | "SECOND" } | { ok: false; reason: string } {
  if (version.status === "REJECTED") return { ok: false, reason: "These bank details were rejected." };
  if (actorId === version.changedById) return { ok: false, reason: "The person who changed the bank details cannot verify them." };
  if (version.status === "PENDING") return { ok: true, slot: "FIRST" };
  if (version.secondVerifiedById) return { ok: false, reason: "These bank details are already fully verified." };
  if (version.verifiedById === actorId) return { ok: false, reason: "A different person must give the second verification." };
  return { ok: true, slot: "SECOND" };
}
