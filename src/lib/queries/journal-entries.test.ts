import { describe, it, expect } from "vitest";
import {
  validateJournalBalance,
  checkPeriodPostingRule,
} from "./journal-entries";

// ─── validateJournalBalance ──────────────────────────────────

describe("validateJournalBalance", () => {
  it("reports balanced when debits equal credits", () => {
    const result = validateJournalBalance([
      { debit: 100, credit: 0 },
      { debit: 0, credit: 100 },
    ]);
    expect(result.isBalanced).toBe(true);
    expect(result.totalDebits).toBe(100);
    expect(result.totalCredits).toBe(100);
  });

  it("reports unbalanced when debits exceed credits", () => {
    const result = validateJournalBalance([
      { debit: 150, credit: 0 },
      { debit: 0, credit: 100 },
    ]);
    expect(result.isBalanced).toBe(false);
    expect(result.totalDebits).toBe(150);
    expect(result.totalCredits).toBe(100);
  });

  it("reports unbalanced when credits exceed debits", () => {
    const result = validateJournalBalance([
      { debit: 50, credit: 0 },
      { debit: 0, credit: 100 },
    ]);
    expect(result.isBalanced).toBe(false);
  });

  it("handles multiple lines on each side", () => {
    const result = validateJournalBalance([
      { debit: 100, credit: 0 },
      { debit: 50, credit: 0 },
      { debit: 0, credit: 75 },
      { debit: 0, credit: 75 },
    ]);
    expect(result.isBalanced).toBe(true);
    expect(result.totalDebits).toBe(150);
    expect(result.totalCredits).toBe(150);
  });

  it("treats undefined debit/credit as zero", () => {
    const result = validateJournalBalance([
      { debit: 100 },
      { credit: 100 },
    ]);
    expect(result.isBalanced).toBe(true);
  });

  it("handles empty lines array", () => {
    const result = validateJournalBalance([]);
    expect(result.isBalanced).toBe(true);
    expect(result.totalDebits).toBe(0);
    expect(result.totalCredits).toBe(0);
  });

  it("rounds to 2 decimal places to handle floating-point errors", () => {
    // 0.1 + 0.2 !== 0.3 in IEEE 754
    const result = validateJournalBalance([
      { debit: 0.1, credit: 0 },
      { debit: 0.2, credit: 0 },
      { debit: 0, credit: 0.3 },
    ]);
    expect(result.isBalanced).toBe(true);
  });

  it("detects sub-cent imbalance as unbalanced", () => {
    // 100.01 vs 100.00 -- differs by 1 cent
    const result = validateJournalBalance([
      { debit: 100.01, credit: 0 },
      { debit: 0, credit: 100 },
    ]);
    expect(result.isBalanced).toBe(false);
  });

  it("handles large monetary values", () => {
    const result = validateJournalBalance([
      { debit: 999999.99, credit: 0 },
      { debit: 0, credit: 999999.99 },
    ]);
    expect(result.isBalanced).toBe(true);
  });

  it("handles GST-style split entries", () => {
    // Invoice: $110 (GST-inclusive), $100 expense + $10 GST
    const result = validateJournalBalance([
      { debit: 100, credit: 0 },    // Expense
      { debit: 10, credit: 0 },     // GST receivable
      { debit: 0, credit: 110 },    // Accounts payable
    ]);
    expect(result.isBalanced).toBe(true);
    expect(result.totalDebits).toBe(110);
    expect(result.totalCredits).toBe(110);
  });
});

// ─── checkPeriodPostingRule ──────────────────────────────────

describe("checkPeriodPostingRule", () => {
  it("allows posting to an OPEN period", () => {
    expect(checkPeriodPostingRule("OPEN", "FY2024 Q1", "STANDARD")).toBeNull();
  });

  it("allows ADJUSTMENT entries to a CLOSED period", () => {
    expect(
      checkPeriodPostingRule("CLOSED", "FY2024 Q1", "ADJUSTMENT"),
    ).toBeNull();
  });

  it("blocks non-ADJUSTMENT entries to a CLOSED period", () => {
    const result = checkPeriodPostingRule("CLOSED", "FY2024 Q1", "STANDARD");
    expect(result).not.toBeNull();
    expect(result).toContain("closed period");
    expect(result).toContain("FY2024 Q1");
  });

  it("blocks all entries to a LOCKED period, with the TC-010 message", () => {
    const result = checkPeriodPostingRule("LOCKED", "July 2026", "STANDARD");
    expect(result).toBe("This period is locked. Contact your system administrator to unlock. (July 2026)");
  });

  it("blocks ADJUSTMENT entries to a LOCKED period", () => {
    const result = checkPeriodPostingRule("LOCKED", "FY2024 Q1", "ADJUSTMENT");
    expect(result).not.toBeNull();
    expect(result).toContain("This period is locked.");
  });

  it("blocks REVERSAL entries to a CLOSED period", () => {
    const result = checkPeriodPostingRule("CLOSED", "FY2024 Q1", "REVERSAL");
    expect(result).not.toBeNull();
    expect(result).toContain("closed period");
  });

  it("allows any entry type to an OPEN period", () => {
    for (const entryType of ["STANDARD", "ADJUSTMENT", "REVERSAL", "SYSTEM"]) {
      expect(checkPeriodPostingRule("OPEN", "FY2024 Q1", entryType)).toBeNull();
    }
  });
});
