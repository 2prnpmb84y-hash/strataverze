/** Releasing a Zai payout: the Treasurer's approval, the existing payment controls, and a second person. */
import { describe, expect, it } from "vitest";
import { DEFAULT_PAYMENT_POLICY } from "@/lib/finance/payment-controls";
import { payoutReleaseDecision, type PayoutReleaseInput } from "./payout-controls";

const input = (over: Partial<PayoutReleaseInput> = {}): PayoutReleaseInput => ({
  invoice: { amountCents: 50000, status: "APPROVED", preparedById: "manager", authorisedBy: ["treasurer"] },
  context: { policy: DEFAULT_PAYMENT_POLICY, eligibleApproverIds: ["treasurer", "authoriser"] },
  treasurerIds: ["treasurer"],
  adviserIds: ["manager"],
  supplierProfileIds: ["supplier"],
  bankDetails: { result: "allowed" },
  initiatedBy: "authoriser",
  releasedBy: "treasurer",
  ...over,
});

describe("payoutReleaseDecision", () => {
  it("releases an approved invoice the Treasurer approved, asked for by one person and released by another", () => {
    expect(payoutReleaseDecision(input())).toEqual({ ok: true });
  });

  it("needs the Treasurer's approval, even of the strata manager's own invoice", () => {
    const r = payoutReleaseDecision(input({ invoice: { amountCents: 50000, status: "APPROVED", preparedById: "manager", authorisedBy: ["authoriser"] }, initiatedBy: "treasurer", releasedBy: "authoriser" }));
    expect(r).toEqual({ ok: false, reasons: ["The owners corporation's Treasurer has not approved this invoice."] });
  });

  it("never lets one person ask for and release the same payout", () => {
    const r = payoutReleaseDecision(input({ initiatedBy: "treasurer", releasedBy: "treasurer" }));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reasons).toContain("A second person, not the one who asked for the payout, must release it.");
  });

  it("blocks a strata manager or the supplier from asking for or releasing it", () => {
    const manager = payoutReleaseDecision(input({ context: { policy: { ...DEFAULT_PAYMENT_POLICY, allowAdviserApproval: true }, eligibleApproverIds: ["treasurer", "authoriser", "manager"] }, releasedBy: "manager" }));
    expect(!manager.ok && manager.reasons).toContain("A strata manager cannot ask for or release a payout of the owners corporation's money.");
    const supplier = payoutReleaseDecision(input({ initiatedBy: "supplier" }));
    expect(!supplier.ok && supplier.reasons).toContain("The supplier cannot ask for or release its own payment.");
  });

  it("blocks a releaser who is not an eligible approver", () => {
    const r = payoutReleaseDecision(input({ releasedBy: "owner" }));
    expect(!r.ok && r.reasons).toContain("Only the Treasurer or a payment authoriser can release a payout.");
  });

  it("blocks what the existing controls block or only allow as an exception", () => {
    const unapproved = payoutReleaseDecision(input({ invoice: { amountCents: 50000, status: "AWAITING_APPROVAL", preparedById: "manager", authorisedBy: ["treasurer"] } }));
    expect(!unapproved.ok && unapproved.reasons).toContain("This invoice has not been approved for payment.");
    // The manual flow allows this as a logged exception; a Zai payout does not.
    const preparer = payoutReleaseDecision(input({ invoice: { amountCents: 50000, status: "APPROVED", preparedById: "authoriser", authorisedBy: ["treasurer"] } }));
    expect(!preparer.ok && preparer.reasons).toContain("The person recording this payment also prepared the invoice.");
    const bank = payoutReleaseDecision(input({ bankDetails: { result: "blocked", reason: "The supplier's bank details were changed and have not been verified. Verify them before paying." } }));
    expect(!bank.ok && bank.reasons).toContain("The supplier's bank details were changed and have not been verified. Verify them before paying.");
  });
});
