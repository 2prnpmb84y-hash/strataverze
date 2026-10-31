/**
 * Whether a supplier payout through Zai may be released (pure).
 *
 * The assessment's conditions (21 Oct 2026), on top of the existing payment
 * controls (src/lib/finance/payment-controls.ts), which are called, not
 * copied:
 *
 * 1. Every supplier invoice, the strata manager's included, has the owners
 *    corporation Treasurer's approval before it is paid: at least one of the
 *    invoice's approvals is by a Treasurer of the building.
 * 2. The invoice is approved for payment and the person asking for the
 *    payout passes the segregation check for recording a payment
 *    (checkSegregation RECORD_PAYMENT). An "exception" there, which the
 *    manual flow logs and allows, blocks a Zai payout.
 * 3. The supplier's bank details pass the change control
 *    (checkBankDetailsForPayment).
 * 4. Dual control: a second person releases the payout. Never the person who
 *    asked for it, always an eligible approver, never a strata manager
 *    (adviser), who never controls scheme money, and never the supplier.
 *
 * Nothing pays automatically: a payout exists only once a person asks for
 * it and is sent only once a second person releases it.
 */
import { checkSegregation, type ControlContext, type ControlDecision, type InvoiceForControls } from "@/lib/finance/payment-controls";

export interface PayoutReleaseInput {
  invoice: InvoiceForControls;
  context: ControlContext;
  /** The building's Treasurers (committee members with is_treasurer). */
  treasurerIds: readonly string[];
  /** The building's strata managers (advisers). */
  adviserIds: readonly string[];
  /** The supplier's own profiles (a supplier never approves or releases its own payment). */
  supplierProfileIds: readonly string[];
  /** checkBankDetailsForPayment for the supplier's latest bank details. */
  bankDetails: ControlDecision;
  initiatedBy: string;
  releasedBy: string;
}

export type PayoutReleaseDecision = { ok: true } | { ok: false; reasons: string[] };

export function payoutReleaseDecision(input: PayoutReleaseInput): PayoutReleaseDecision {
  const reasons: string[] = [];
  const { invoice } = input;
  if (!invoice.authorisedBy.some((id) => input.treasurerIds.includes(id))) {
    reasons.push("The owners corporation's Treasurer has not approved this invoice.");
  }
  const recording = checkSegregation("RECORD_PAYMENT", input.initiatedBy, invoice, input.context);
  if (recording.result !== "allowed") reasons.push(recording.reason ?? "The person asking for the payout may not record this payment.");
  if (input.bankDetails.result !== "allowed") reasons.push(input.bankDetails.reason ?? "The supplier's bank details are not cleared for payment.");
  if (!input.releasedBy || input.releasedBy === input.initiatedBy) reasons.push("A second person, not the one who asked for the payout, must release it.");
  if (!input.context.eligibleApproverIds.includes(input.releasedBy)) reasons.push("Only the Treasurer or a payment authoriser can release a payout.");
  if (input.adviserIds.includes(input.releasedBy) || input.adviserIds.includes(input.initiatedBy)) {
    reasons.push("A strata manager cannot ask for or release a payout of the owners corporation's money.");
  }
  if (input.supplierProfileIds.includes(input.releasedBy) || input.supplierProfileIds.includes(input.initiatedBy)) {
    reasons.push("The supplier cannot ask for or release its own payment.");
  }
  return reasons.length ? { ok: false, reasons } : { ok: true };
}
