import { describe, it, expect } from "vitest";
import { availableCredit, creditJournalAccounts, planCreditApplication, refundProblem, splitLevyPayment } from "./owner-credit";

describe("splitLevyPayment", () => {
  it("holds the excess of an overpayment as credit", () => {
    expect(splitLevyPayment(120_000, 100_000)).toEqual({ appliedCents: 100_000, excessCents: 20_000 });
  });
  it("applies a part payment in full with no credit", () => {
    expect(splitLevyPayment(30_000, 100_000)).toEqual({ appliedCents: 30_000, excessCents: 0 });
  });
  it("treats a payment on a paid notice as all credit", () => {
    expect(splitLevyPayment(50_000, 0)).toEqual({ appliedCents: 0, excessCents: 50_000 });
  });
});

describe("planCreditApplication", () => {
  const notices = [
    { id: "b", dueDate: "2026-12-01", owingCents: 40_000 },
    { id: "a", dueDate: "2026-11-01", owingCents: 30_000 },
  ];
  it("applies credit to the earliest notice first", () => {
    expect(planCreditApplication(20_000, notices)).toEqual([{ noticeId: "a", amountCents: 20_000 }]);
  });
  it("spreads credit across notices and stops when it runs out", () => {
    expect(planCreditApplication(50_000, notices)).toEqual([
      { noticeId: "a", amountCents: 30_000 },
      { noticeId: "b", amountCents: 20_000 },
    ]);
  });
  it("never applies more than the notices owe", () => {
    expect(planCreditApplication(500_000, notices)).toEqual([
      { noticeId: "a", amountCents: 30_000 },
      { noticeId: "b", amountCents: 40_000 },
    ]);
  });
  it("does nothing without credit", () => {
    expect(planCreditApplication(0, notices)).toEqual([]);
  });
});

describe("refunds", () => {
  const ok = { amountCents: 10_000, balanceCents: 20_000, pendingRefundsCents: 0, bsb: "062-000", accountNumber: "12345678", payeeName: "J Citizen", verificationMethod: "CALLBACK" };
  it("reserves credit for refunds already requested", () => {
    expect(availableCredit(20_000, 15_000)).toBe(5_000);
    expect(refundProblem({ ...ok, pendingRefundsCents: 15_000 })).toMatch(/more than the credit available/);
  });
  it("accepts a valid refund", () => {
    expect(refundProblem(ok)).toBeNull();
  });
  it("needs the bank details confirmed", () => {
    expect(refundProblem({ ...ok, verificationMethod: "" })).toMatch(/confirmed/);
    expect(refundProblem({ ...ok, bsb: "12" })).toMatch(/BSB/);
  });
});

describe("creditJournalAccounts", () => {
  const accounts = { bankId: "bank", receivableId: "ar", advanceId: "advance" };
  it("holds an overpayment as a liability", () => {
    expect(creditJournalAccounts("HELD", accounts)).toEqual({ debitAccountId: "bank", creditAccountId: "advance" });
  });
  it("applies credit against the receivable", () => {
    expect(creditJournalAccounts("APPLIED", accounts)).toEqual({ debitAccountId: "advance", creditAccountId: "ar" });
  });
  it("journals a refund out of the bank", () => {
    expect(creditJournalAccounts("REFUNDED", accounts)).toEqual({ debitAccountId: "advance", creditAccountId: "bank" });
  });
});
