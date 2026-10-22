import { describe, expect, it } from "vitest";
import {
  applyCreditTransaction,
  creditBalance,
  creditPacksOnSale,
  creditTransactionProblem,
  CreditLedgerError,
  type CreditTransaction,
} from "./credits";

const purchase: CreditTransaction = { id: "p1", type: "PURCHASE", credits: 100 };

describe("credit ledger", () => {
  it("adds purchases and allocations and takes consumptions", () => {
    let h = applyCreditTransaction([], purchase).history;
    h = applyCreditTransaction(h, { id: "a1", type: "ALLOCATION", credits: 20 }).history;
    const r = applyCreditTransaction(h, { id: "c1", type: "CONSUMPTION", credits: -55, feeEventId: "fee1" });
    expect(r.balance).toBe(65);
    expect(creditBalance(r.history)).toBe(65);
  });

  it("never lets the balance go below zero", () => {
    expect(() => applyCreditTransaction([purchase], { id: "c1", type: "CONSUMPTION", credits: -101, feeEventId: "fee1" })).toThrow(
      CreditLedgerError,
    );
    expect(creditTransactionProblem([purchase], { id: "x", type: "ADJUSTMENT", credits: -101 })).toMatch(/below zero/);
  });

  it("only spends credits on a StrataVerze charge, once per charge", () => {
    expect(creditTransactionProblem([purchase], { id: "c1", type: "CONSUMPTION", credits: -10 })).toMatch(/StrataVerze charge/);
    const h = applyCreditTransaction([purchase], { id: "c1", type: "CONSUMPTION", credits: -10, feeEventId: "fee1" }).history;
    expect(creditTransactionProblem(h, { id: "c2", type: "CONSUMPTION", credits: -10, feeEventId: "fee1" })).toMatch(/already been paid/);
  });

  it("refunds no more than was consumed, and only against a consumption", () => {
    const h = applyCreditTransaction([purchase], { id: "c1", type: "CONSUMPTION", credits: -30, feeEventId: "fee1" }).history;
    const after = applyCreditTransaction(h, { id: "r1", type: "REFUND", credits: 20, refundOfId: "c1" });
    expect(after.balance).toBe(90);
    expect(creditTransactionProblem(after.history, { id: "r2", type: "REFUND", credits: 11, refundOfId: "c1" })).toMatch(/more credits/);
    expect(creditTransactionProblem(after.history, { id: "r3", type: "REFUND", credits: 5, refundOfId: "p1" })).toMatch(/point at/);
  });

  it("rejects wrong signs, fractions, zero and duplicates", () => {
    expect(creditTransactionProblem([], { id: "p", type: "PURCHASE", credits: -5 })).toMatch(/must add/);
    expect(creditTransactionProblem([purchase], { id: "c", type: "CONSUMPTION", credits: 5, feeEventId: "f" })).toMatch(/must take/);
    expect(creditTransactionProblem([], { id: "p", type: "PURCHASE", credits: 1.5 })).toMatch(/whole number/);
    expect(creditTransactionProblem([], { id: "p", type: "PURCHASE", credits: 0 })).toMatch(/whole number/);
    expect(creditTransactionProblem([purchase], purchase)).toMatch(/already in the ledger/);
  });

  it("allows signed adjustments that keep the balance at or above zero", () => {
    expect(applyCreditTransaction([purchase], { id: "adj", type: "ADJUSTMENT", credits: -100 }).balance).toBe(0);
    expect(applyCreditTransaction([purchase], { id: "adj", type: "ADJUSTMENT", credits: 7 }).balance).toBe(107);
  });
});

describe("credit rate card", () => {
  const card = [
    { code: "PACK_A", credits: 100, priceCents: 10000, gstInclusive: false, effectiveFrom: "2026-01-01", isActive: true },
    { code: "OLD", credits: 50, priceCents: 5000, gstInclusive: false, effectiveFrom: "2025-01-01", effectiveTo: "2026-01-01", isActive: true },
    { code: "OFF", credits: 10, priceCents: 1000, gstInclusive: false, effectiveFrom: "2026-01-01", isActive: false },
  ];
  it("lists only packs on sale today", () => {
    expect(creditPacksOnSale(card, "2026-10-22").map((p) => p.code)).toEqual(["PACK_A"]);
  });
});
