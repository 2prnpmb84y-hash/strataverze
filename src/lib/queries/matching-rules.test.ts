import { describe, it, expect } from "vitest";
import { transactionMatchesRule } from "./matching-rules";

// Helper to build a rule with defaults
function makeRule(overrides: Partial<Parameters<typeof transactionMatchesRule>[1]> = {}) {
  return {
    matchType: "DESCRIPTION",
    descriptionPattern: null,
    referencePattern: null,
    exactAmount: null,
    minAmount: null,
    maxAmount: null,
    transactionSign: null,
    ...overrides,
  };
}

// Helper to build a transaction with defaults
function makeTxn(overrides: Partial<Parameters<typeof transactionMatchesRule>[0]> = {}) {
  return {
    description: "Transfer from owner",
    reference: null,
    amount: 100,
    ...overrides,
  };
}

// ─── DESCRIPTION matching ────────────────────────────────────

describe("transactionMatchesRule — DESCRIPTION", () => {
  it("matches when description contains the pattern (case-insensitive)", () => {
    const rule = makeRule({
      matchType: "DESCRIPTION",
      descriptionPattern: "LEVY PAYMENT",
    });
    const txn = makeTxn({ description: "Levy Payment from Lot 5" });
    expect(transactionMatchesRule(txn, rule)).toBe(true);
  });

  it("does not match when pattern is absent from description", () => {
    const rule = makeRule({
      matchType: "DESCRIPTION",
      descriptionPattern: "INSURANCE",
    });
    const txn = makeTxn({ description: "Levy Payment from Lot 5" });
    expect(transactionMatchesRule(txn, rule)).toBe(false);
  });

  it("does not match when descriptionPattern is null", () => {
    const rule = makeRule({
      matchType: "DESCRIPTION",
      descriptionPattern: null,
    });
    expect(transactionMatchesRule(makeTxn(), rule)).toBe(false);
  });

  it("matches partial substrings", () => {
    const rule = makeRule({
      matchType: "DESCRIPTION",
      descriptionPattern: "levy",
    });
    const txn = makeTxn({ description: "Q3 levy instalment" });
    expect(transactionMatchesRule(txn, rule)).toBe(true);
  });
});

// ─── REFERENCE matching ──────────────────────────────────────

describe("transactionMatchesRule — REFERENCE", () => {
  it("matches when reference contains the pattern", () => {
    const rule = makeRule({
      matchType: "REFERENCE",
      referencePattern: "INV-",
    });
    const txn = makeTxn({ reference: "INV-2024-001" });
    expect(transactionMatchesRule(txn, rule)).toBe(true);
  });

  it("does not match when reference is null", () => {
    const rule = makeRule({
      matchType: "REFERENCE",
      referencePattern: "INV-",
    });
    const txn = makeTxn({ reference: null });
    expect(transactionMatchesRule(txn, rule)).toBe(false);
  });

  it("is case-insensitive", () => {
    const rule = makeRule({
      matchType: "REFERENCE",
      referencePattern: "ref-abc",
    });
    const txn = makeTxn({ reference: "REF-ABC-123" });
    expect(transactionMatchesRule(txn, rule)).toBe(true);
  });
});

// ─── AMOUNT matching ─────────────────────────────────────────

describe("transactionMatchesRule — AMOUNT", () => {
  it("matches exact amount", () => {
    const rule = makeRule({
      matchType: "AMOUNT",
      exactAmount: 250,
    });
    const txn = makeTxn({ amount: 250 });
    expect(transactionMatchesRule(txn, rule)).toBe(true);
  });

  it("matches exact amount with sub-cent tolerance (0.005)", () => {
    const rule = makeRule({
      matchType: "AMOUNT",
      exactAmount: 250,
    });
    const txn = makeTxn({ amount: 250.004 });
    expect(transactionMatchesRule(txn, rule)).toBe(true);
  });

  it("does not match when amount exceeds tolerance", () => {
    const rule = makeRule({
      matchType: "AMOUNT",
      exactAmount: 250,
    });
    const txn = makeTxn({ amount: 250.01 });
    expect(transactionMatchesRule(txn, rule)).toBe(false);
  });

  it("uses absolute value for exact amount matching", () => {
    const rule = makeRule({
      matchType: "AMOUNT",
      exactAmount: 100,
    });
    const txn = makeTxn({ amount: -100 });
    expect(transactionMatchesRule(txn, rule)).toBe(true);
  });

  it("matches amount range with min and max", () => {
    const rule = makeRule({
      matchType: "AMOUNT",
      minAmount: 100,
      maxAmount: 500,
    });
    expect(transactionMatchesRule(makeTxn({ amount: 250 }), rule)).toBe(true);
    expect(transactionMatchesRule(makeTxn({ amount: 100 }), rule)).toBe(true);
    expect(transactionMatchesRule(makeTxn({ amount: 500 }), rule)).toBe(true);
  });

  it("does not match outside amount range", () => {
    const rule = makeRule({
      matchType: "AMOUNT",
      minAmount: 100,
      maxAmount: 500,
    });
    expect(transactionMatchesRule(makeTxn({ amount: 50 }), rule)).toBe(false);
    expect(transactionMatchesRule(makeTxn({ amount: 600 }), rule)).toBe(false);
  });

  it("matches with only minAmount set", () => {
    const rule = makeRule({
      matchType: "AMOUNT",
      minAmount: 100,
    });
    expect(transactionMatchesRule(makeTxn({ amount: 500 }), rule)).toBe(true);
    expect(transactionMatchesRule(makeTxn({ amount: 50 }), rule)).toBe(false);
  });

  it("matches with only maxAmount set", () => {
    const rule = makeRule({
      matchType: "AMOUNT",
      maxAmount: 200,
    });
    expect(transactionMatchesRule(makeTxn({ amount: 150 }), rule)).toBe(true);
    expect(transactionMatchesRule(makeTxn({ amount: 300 }), rule)).toBe(false);
  });

  it("does not match when no amount criteria are provided", () => {
    const rule = makeRule({ matchType: "AMOUNT" });
    expect(transactionMatchesRule(makeTxn({ amount: 100 }), rule)).toBe(false);
  });
});

// ─── DESCRIPTION_AND_AMOUNT matching ─────────────────────────

describe("transactionMatchesRule — DESCRIPTION_AND_AMOUNT", () => {
  it("matches when both description and exact amount match", () => {
    const rule = makeRule({
      matchType: "DESCRIPTION_AND_AMOUNT",
      descriptionPattern: "levy",
      exactAmount: 500,
    });
    const txn = makeTxn({ description: "Levy payment Q3", amount: 500 });
    expect(transactionMatchesRule(txn, rule)).toBe(true);
  });

  it("does not match when description matches but amount does not", () => {
    const rule = makeRule({
      matchType: "DESCRIPTION_AND_AMOUNT",
      descriptionPattern: "levy",
      exactAmount: 500,
    });
    const txn = makeTxn({ description: "Levy payment Q3", amount: 250 });
    expect(transactionMatchesRule(txn, rule)).toBe(false);
  });

  it("does not match when amount matches but description does not", () => {
    const rule = makeRule({
      matchType: "DESCRIPTION_AND_AMOUNT",
      descriptionPattern: "insurance",
      exactAmount: 500,
    });
    const txn = makeTxn({ description: "Levy payment Q3", amount: 500 });
    expect(transactionMatchesRule(txn, rule)).toBe(false);
  });

  it("matches description with amount range", () => {
    const rule = makeRule({
      matchType: "DESCRIPTION_AND_AMOUNT",
      descriptionPattern: "levy",
      minAmount: 400,
      maxAmount: 600,
    });
    const txn = makeTxn({ description: "Levy payment Q3", amount: 500 });
    expect(transactionMatchesRule(txn, rule)).toBe(true);
  });
});

// ─── Transaction sign filtering ──────────────────────────────

describe("transactionMatchesRule — transactionSign", () => {
  it("CREDIT sign rejects negative amounts (debits)", () => {
    const rule = makeRule({
      matchType: "DESCRIPTION",
      descriptionPattern: "payment",
      transactionSign: "CREDIT",
    });
    expect(transactionMatchesRule(makeTxn({ amount: -100, description: "payment received" }), rule)).toBe(false);
  });

  it("CREDIT sign allows positive amounts", () => {
    const rule = makeRule({
      matchType: "DESCRIPTION",
      descriptionPattern: "payment",
      transactionSign: "CREDIT",
    });
    expect(transactionMatchesRule(makeTxn({ amount: 100, description: "payment received" }), rule)).toBe(true);
  });

  it("DEBIT sign rejects positive amounts (credits)", () => {
    const rule = makeRule({
      matchType: "DESCRIPTION",
      descriptionPattern: "expense",
      transactionSign: "DEBIT",
    });
    expect(transactionMatchesRule(makeTxn({ amount: 100, description: "expense payment" }), rule)).toBe(false);
  });

  it("DEBIT sign allows negative amounts", () => {
    const rule = makeRule({
      matchType: "DESCRIPTION",
      descriptionPattern: "expense",
      transactionSign: "DEBIT",
    });
    expect(transactionMatchesRule(makeTxn({ amount: -100, description: "expense payment" }), rule)).toBe(true);
  });

  it("null transactionSign allows any amount sign", () => {
    const rule = makeRule({
      matchType: "DESCRIPTION",
      descriptionPattern: "transfer",
      transactionSign: null,
    });
    expect(transactionMatchesRule(makeTxn({ amount: 100, description: "transfer in" }), rule)).toBe(true);
    expect(transactionMatchesRule(makeTxn({ amount: -100, description: "transfer out" }), rule)).toBe(true);
  });
});

// ─── Unknown match type ──────────────────────────────────────

describe("transactionMatchesRule — unknown matchType", () => {
  it("returns false for unrecognised match types", () => {
    const rule = makeRule({ matchType: "UNKNOWN_TYPE" });
    expect(transactionMatchesRule(makeTxn(), rule)).toBe(false);
  });
});
