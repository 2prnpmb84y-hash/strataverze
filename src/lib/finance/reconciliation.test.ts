import { describe, expect, it } from "vitest";
import {
  allocationProblem,
  bankSideCents,
  checkRunningBalance,
  statusAfterAllocation,
  suspenseBlockingClose,
  threeWayReconciliation,
  unallocatedCents,
} from "./reconciliation";

describe("allocations", () => {
  it("is MATCHED only when allocations equal the transaction amount", () => {
    expect(statusAfterAllocation("UNMATCHED", 150_000, 150_000)).toBe("MATCHED");
    expect(statusAfterAllocation("UNMATCHED", -42_000, 42_000)).toBe("MATCHED");
  });

  it("keeps a partly allocated transaction UNMATCHED", () => {
    expect(statusAfterAllocation("UNMATCHED", 150_000, 100_000)).toBe("UNMATCHED");
    expect(statusAfterAllocation("MATCHED", 150_000, 100_000)).toBe("UNMATCHED");
    expect(unallocatedCents(150_000, 100_000)).toBe(50_000);
  });

  it("leaves reconciled and excluded transactions alone", () => {
    expect(statusAfterAllocation("RECONCILED", 1000, 0)).toBe("RECONCILED");
    expect(statusAfterAllocation("EXCLUDED", 1000, 0)).toBe("EXCLUDED");
  });

  it("works out the bank side of a journal entry", () => {
    expect(
      bankSideCents([
        { accountSubType: "BANK", debitCents: 82_509, creditCents: 0 },
        { accountSubType: "ACCOUNTS_RECEIVABLE", debitCents: 0, creditCents: 82_509 },
      ]),
    ).toBe(82_509);
  });

  const entries = [
    { id: "lot1", bankSideCents: 82_509, allocatedCents: 0 },
    { id: "lot2", bankSideCents: 67_491, allocatedCents: 0 },
    { id: "invoice", bankSideCents: -50_000, allocatedCents: 20_000 },
  ];

  it("splits a deposit across several levy receipts", () => {
    expect(
      allocationProblem({
        transactionCents: 150_000,
        status: "UNMATCHED",
        alreadyAllocatedCents: 0,
        requests: [
          { journalEntryId: "lot1", amountCents: 82_509 },
          { journalEntryId: "lot2", amountCents: 67_491 },
        ],
        entries,
      }),
    ).toBeNull();
  });

  it("refuses more than the transaction or the entry has left", () => {
    expect(
      allocationProblem({ transactionCents: 100_000, status: "UNMATCHED", alreadyAllocatedCents: 0, requests: [{ journalEntryId: "lot1", amountCents: 90_000 }], entries }),
    ).toMatch(/left on that entry/);
    expect(
      allocationProblem({
        transactionCents: 100_000,
        status: "UNMATCHED",
        alreadyAllocatedCents: 50_000,
        requests: [{ journalEntryId: "lot1", amountCents: 60_000 }],
        entries,
      }),
    ).toMatch(/left on this transaction/);
  });

  it("combines several payments against one invoice", () => {
    expect(
      allocationProblem({ transactionCents: -30_000, status: "UNMATCHED", alreadyAllocatedCents: 0, requests: [{ journalEntryId: "invoice", amountCents: 30_000 }], entries }),
    ).toBeNull();
  });

  it("refuses a deposit against a payment entry", () => {
    expect(
      allocationProblem({ transactionCents: 30_000, status: "UNMATCHED", alreadyAllocatedCents: 0, requests: [{ journalEntryId: "invoice", amountCents: 10_000 }], entries }),
    ).toMatch(/money received/);
  });
});

describe("suspense and period close", () => {
  it("blocks closing a period with open suspense items in it", () => {
    const items = [
      { id: "a", transactionDate: "2026-09-28", amountCents: 12_000, description: "Unknown deposit" },
      { id: "b", transactionDate: "2026-10-03", amountCents: 5_000, description: "Later" },
    ];
    expect(suspenseBlockingClose("2026-09-30", items).map((i) => i.id)).toEqual(["a"]);
    expect(suspenseBlockingClose("2026-08-31", items)).toEqual([]);
  });
});

describe("checkRunningBalance", () => {
  const rows = [
    { date: "2026-09-01", amountCents: 10_000, balanceCents: 110_000 },
    { date: "2026-09-02", amountCents: -2_000, balanceCents: 108_000 },
    { date: "2026-09-05", amountCents: 5_000, balanceCents: 113_000 },
  ];

  it("passes a complete statement and finds the opening and closing balances", () => {
    expect(checkRunningBalance(rows)).toMatchObject({ checked: true, order: "OLDEST_FIRST", openingCents: 100_000, closingCents: 113_000, gaps: [] });
  });

  it("handles a newest first file", () => {
    expect(checkRunningBalance([...rows].reverse())).toMatchObject({ order: "NEWEST_FIRST", openingCents: 100_000, gaps: [] });
  });

  it("warns on a gap such as a missing page", () => {
    const missing = [rows[0], { ...rows[2], balanceCents: 120_000 }];
    const check = checkRunningBalance(missing);
    expect(check.gaps).toHaveLength(1);
    expect(check.gaps[0]).toMatchObject({ afterDate: "2026-09-01", beforeDate: "2026-09-05", missingCents: 5_000 });
  });

  it("warns when the file does not start where the last import ended", () => {
    expect(checkRunningBalance(rows, 99_000).openingGapCents).toBe(1_000);
    expect(checkRunningBalance(rows, 100_000).openingGapCents).toBeNull();
  });

  it("skips the check without a balance column", () => {
    expect(checkRunningBalance(rows.map((r) => ({ ...r, balanceCents: null }))).checked).toBe(false);
  });
});

describe("threeWayReconciliation", () => {
  it("explains the difference between ledger and statement", () => {
    const r = threeWayReconciliation({
      ledgerByFund: [
        { fundId: "a", fundName: "Admin", cents: 500_000 },
        { fundId: "c", fundName: "Capital works", cents: 200_000 },
      ],
      statementByAccount: [{ bankAccountId: "b", accountName: "Operating", cents: 710_000, asAt: "2026-09-30" }],
      walletCents: null,
      unmatchedBank: [{ id: "t1", date: "2026-09-29", description: "Unknown deposit", cents: 15_000 }],
      pendingLedger: [{ id: "j1", date: "2026-09-30", description: "Cheque not presented", cents: 5_000 }],
      suspense: [],
    });
    expect(r).toMatchObject({ ledgerCents: 700_000, statementCents: 710_000, adjustedStatementCents: 700_000, unexplainedCents: 0, walletCents: null });
  });

  it("cannot reconcile without a statement balance", () => {
    const r = threeWayReconciliation({
      ledgerByFund: [{ fundId: "a", fundName: "Admin", cents: 1 }],
      statementByAccount: [{ bankAccountId: "b", accountName: "Operating", cents: null, asAt: null }],
      walletCents: null,
      unmatchedBank: [],
      pendingLedger: [],
      suspense: [],
    });
    expect(r.unexplainedCents).toBeNull();
    expect(r.missingStatementAccounts).toEqual(["Operating"]);
  });
});
