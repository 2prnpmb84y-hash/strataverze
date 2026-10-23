import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAYMENT_POLICY,
  approvalComplete,
  approversRequired,
  businessDaysBetween,
  canVerifyBankChange,
  checkBankDetailsForPayment,
  checkSegregation,
  eligibleApprovers,
  policyLoosening,
  type BankDetailVersionForControls,
  type ControlContext,
  type InvoiceForControls,
} from "./payment-controls";

const policy = { ...DEFAULT_PAYMENT_POLICY, singleApproverLimitCents: 100000 }; // $1,000
const members = [
  { profileId: "treasurer", role: "COMMITTEE", isActive: true, isTreasurer: true },
  { profileId: "authoriser", role: "PAYMENT_AUTHORISER", isActive: true, isTreasurer: false },
  { profileId: "committee", role: "COMMITTEE", isActive: true, isTreasurer: false },
  { profileId: "adviser", role: "ADVISER", isActive: true, isTreasurer: false },
  { profileId: "former", role: "PAYMENT_AUTHORISER", isActive: false, isTreasurer: false },
];
const ctx: ControlContext = { policy, eligibleApproverIds: eligibleApprovers(members, policy) };
const invoice = (over: Partial<InvoiceForControls> = {}): InvoiceForControls => ({
  amountCents: 50000,
  status: "AWAITING_APPROVAL",
  preparedById: "adviser",
  authorisedBy: [],
  ...over,
});

describe("eligible approvers", () => {
  it("includes the treasurer and payment authorisers, not other committee members, advisers or inactive members", () => {
    expect(ctx.eligibleApproverIds.sort()).toEqual(["authoriser", "treasurer"]);
  });
  it("includes advisers only when the policy allows it", () => {
    expect(eligibleApprovers(members, { ...policy, allowAdviserApproval: true })).toContain("adviser");
  });
});

describe("approvers required", () => {
  it("needs a second approver above the limit", () => {
    expect(approversRequired(policy, 100000)).toBe(1);
    expect(approversRequired(policy, 100001)).toBe(2);
    expect(approversRequired({ ...policy, requireSecondApproverAboveCents: 500000 }, 200000)).toBe(1);
  });
  it("defaults to two approvers for any amount", () => {
    expect(approversRequired(DEFAULT_PAYMENT_POLICY, 1)).toBe(2);
  });
});

describe("checkSegregation: approve", () => {
  it("never lets the preparer approve", () => {
    const d = checkSegregation("APPROVE", "treasurer", invoice({ preparedById: "treasurer" }), ctx);
    expect(d.result).toBe("blocked");
  });
  it("does not let the same person approve twice", () => {
    const d = checkSegregation("APPROVE", "treasurer", invoice({ amountCents: 200000, authorisedBy: ["treasurer"] }), ctx);
    expect(d).toMatchObject({ result: "blocked", reason: expect.stringMatching(/already approved/) });
  });
  it("blocks advisers by default", () => {
    const d = checkSegregation("APPROVE", "adviser", invoice({ preparedById: "treasurer" }), ctx);
    expect(d.result).toBe("blocked");
  });
  it("blocks committee members who are not the treasurer", () => {
    expect(checkSegregation("APPROVE", "committee", invoice(), ctx).result).toBe("blocked");
  });
  it("requires a second approver above the limit", () => {
    const big = invoice({ amountCents: 200000 });
    expect(checkSegregation("APPROVE", "treasurer", big, ctx).result).toBe("allowed");
    expect(approvalComplete(policy, big.amountCents, 1, false)).toBe(false);
    const after = invoice({ amountCents: 200000, authorisedBy: ["treasurer"] });
    expect(checkSegregation("APPROVE", "authoriser", after, ctx).result).toBe("allowed");
    expect(approvalComplete(policy, big.amountCents, 2, false)).toBe(true);
  });
  it("logs an exception when a scheme has one eligible approver and allows self approval", () => {
    const solo: ControlContext = { policy: { ...policy, allowSelfApproval: true }, eligibleApproverIds: ["treasurer"] };
    const d = checkSegregation("APPROVE", "treasurer", invoice({ amountCents: 200000 }), solo);
    expect(d.result).toBe("exception");
    expect(approvalComplete(solo.policy, 200000, 1, true)).toBe(true);
  });
  it("blocks a single approver scheme when self approval is off", () => {
    const solo: ControlContext = { policy, eligibleApproverIds: ["treasurer"] };
    expect(checkSegregation("APPROVE", "treasurer", invoice({ amountCents: 200000 }), solo).result).toBe("blocked");
  });
  it("does not count the preparer as a possible second approver", () => {
    const c: ControlContext = { policy, eligibleApproverIds: ["treasurer", "authoriser"] };
    // The authoriser prepared it, so only the treasurer can approve: a second approval is impossible.
    expect(checkSegregation("APPROVE", "treasurer", invoice({ amountCents: 200000, preparedById: "authoriser" }), c).result).toBe(
      "blocked",
    );
  });
  it("only approves invoices waiting for approval", () => {
    expect(checkSegregation("APPROVE", "treasurer", invoice({ status: "PAID" }), ctx).result).toBe("blocked");
  });
});

describe("checkSegregation: prepare and record payment", () => {
  it("does not let an approver prepare the same invoice", () => {
    expect(checkSegregation("PREPARE", "treasurer", invoice({ authorisedBy: ["treasurer"] }), ctx).result).toBe("blocked");
    expect(checkSegregation("PREPARE", "adviser", invoice(), ctx).result).toBe("allowed");
  });
  it("only records payment on an approved invoice", () => {
    expect(checkSegregation("RECORD_PAYMENT", "adviser", invoice(), ctx).result).toBe("blocked");
  });
  it("logs an exception when the preparer or the sole approver records the payment", () => {
    expect(checkSegregation("RECORD_PAYMENT", "adviser", invoice({ status: "APPROVED" }), ctx).result).toBe("exception");
    expect(
      checkSegregation("RECORD_PAYMENT", "treasurer", invoice({ status: "APPROVED", preparedById: "x", authorisedBy: ["treasurer"] }), ctx)
        .result,
    ).toBe("exception");
  });
  it("allows a separate person to record payment", () => {
    expect(
      checkSegregation("RECORD_PAYMENT", "adviser", invoice({ status: "APPROVED", preparedById: "x", authorisedBy: ["treasurer", "authoriser"] }), ctx)
        .result,
    ).toBe("allowed");
  });
});

describe("bank detail change control", () => {
  const version = (over: Partial<BankDetailVersionForControls> = {}): BankDetailVersionForControls => ({
    status: "VERIFIED",
    changedById: "adviser",
    changedAt: "2026-10-19T01:00:00Z", // Monday 19 October, Sydney
    verifiedById: "treasurer",
    verifiedAt: "2026-10-19T03:00:00Z",
    verificationMethod: "CALLBACK",
    secondVerifiedById: null,
    ...over,
  });

  it("counts Monday to Friday business days", () => {
    expect(businessDaysBetween("2026-10-19T01:00:00Z", "2026-10-19T05:00:00Z")).toBe(0);
    expect(businessDaysBetween("2026-10-19T01:00:00Z", "2026-10-26T01:00:00Z")).toBe(5);
    expect(businessDaysBetween("2026-10-23T01:00:00Z", "2026-10-26T01:00:00Z")).toBe(1); // Friday to Monday
  });

  it("blocks payment while a change is pending", () => {
    expect(checkBankDetailsForPayment(version({ status: "PENDING", verifiedById: null }), "2026-11-30T00:00:00Z").result).toBe(
      "blocked",
    );
  });

  it("enforces the cooling-off period even after verification", () => {
    expect(checkBankDetailsForPayment(version(), "2026-10-22T00:00:00Z").result).toBe("blocked");
    expect(checkBankDetailsForPayment(version({ secondVerifiedById: "authoriser" }), "2026-10-22T00:00:00Z").result).toBe("allowed");
  });

  it("allows a verified change after the cooling-off period", () => {
    expect(checkBankDetailsForPayment(version(), "2026-10-26T01:00:00Z").result).toBe("allowed");
  });

  it("allows payment when no change has been recorded", () => {
    expect(checkBankDetailsForPayment(null, "2026-10-22T00:00:00Z").result).toBe("allowed");
  });

  it("never lets the person who changed the details verify them, or one person verify twice", () => {
    expect(canVerifyBankChange(version({ status: "PENDING", verifiedById: null }), "adviser").ok).toBe(false);
    expect(canVerifyBankChange(version({ status: "PENDING", verifiedById: null }), "treasurer")).toEqual({ ok: true, slot: "FIRST" });
    expect(canVerifyBankChange(version(), "treasurer").ok).toBe(false);
    expect(canVerifyBankChange(version(), "authoriser")).toEqual({ ok: true, slot: "SECOND" });
  });
});

describe("policyLoosening", () => {
  const current = { policy, coolingOffDays: 5 };
  it("is empty for an unchanged or tightened policy", () => {
    expect(policyLoosening(current, { ...policy, coolingOffDays: 5 })).toEqual([]);
    expect(policyLoosening(current, { ...policy, singleApproverLimitCents: 50000, coolingOffDays: 10 })).toEqual([]);
  });
  it("names each loosening change", () => {
    expect(
      policyLoosening(current, {
        singleApproverLimitCents: 200000,
        requireSecondApproverAboveCents: null,
        allowSelfApproval: true,
        allowAdviserApproval: true,
        coolingOffDays: 1,
      }),
    ).toEqual(["allowSelfApproval", "allowAdviserApproval", "singleApproverLimit", "requireSecondApproverAbove", "coolingOffDays"]);
  });
  it("treats raising the separate second-approver threshold as loosening", () => {
    expect(policyLoosening(current, { ...policy, requireSecondApproverAboveCents: 500000, coolingOffDays: 5 })).toEqual([
      "requireSecondApproverAbove",
    ]);
  });
});
