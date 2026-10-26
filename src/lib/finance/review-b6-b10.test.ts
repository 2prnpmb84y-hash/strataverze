/** Financials review, 26 Oct 2026: findings B6 to B10. */
import { describe, expect, it, vi, beforeEach } from "vitest";

const data: Record<string, unknown[]> = {};
vi.mock("@/prisma/db", () => {
  const model = (name: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ["where", "include", "orderBy", "limit"]) chain[m] = () => chain;
    chain.all = async () => data[name] ?? [];
    chain.first = async () => (data[name] ?? [])[0] ?? null;
    return chain;
  };
  return { db: { orm: { public: new Proxy({}, { get: (_t, n: string) => model(n) }) } } };
});
vi.mock("@prisma/orm-postgres/orm-client", () => ({ and: (...c: unknown[]) => c, or: (...c: unknown[]) => c }));

import { noticeOwnerNames } from "@/lib/levies/notice-content-data";
import { lotRollForward } from "@/lib/queries/lots";
import { statutoryInterestForScheme } from "./interest-setting";
import { budgetTotals } from "@/app/(portal)/adviser/schemes/[id]/finance/budget/budget-client";
import { getBudgetVsActual } from "@/lib/queries/budget";

beforeEach(() => {
  for (const k of Object.keys(data)) delete data[k];
});

describe("B6: a lot with a name on the strata roll but no owner account", () => {
  it("uses the strata roll name for the notice", () => {
    expect(noticeOwnerNames(null, "Alex Nguyen")).toEqual(["Alex Nguyen"]);
    expect(noticeOwnerNames("Sam Lee", "Alex Nguyen")).toEqual(["Sam Lee"]);
    expect(noticeOwnerNames(" ", "  ")).toEqual([]);
  });
});

describe("B7: a lot's account rolls forward", () => {
  it("shows the takeover arrears as brought forward and interest as charged, and adds up", () => {
    // The review's Lot 1: $500.50 brought forward with $50.00 of old interest, and a $200.00 levy.
    const r = lotRollForward([
      { migrationBatchId: "b", amountDue: "500.50", interestCharged: "50", migratedInterestCharged: "50", amountPaid: "0", migratedInterestPaid: "0" },
      { amountDue: "200", interestCharged: "0", amountPaid: "0" },
    ]);
    expect(r).toEqual({ opening: 550.5, annual: 200, special: 0, interest: 0, paid: 0, closing: 750.5 });
    expect(r.opening + r.annual + r.special + r.interest - r.paid).toBe(r.closing);
  });

  it("keeps the old system's interest paid out of payments received here", () => {
    const r = lotRollForward([
      { migrationBatchId: "b", amountDue: "100", interestCharged: "30", migratedInterestCharged: "20", amountPaid: "50", migratedInterestPaid: "10" },
    ]);
    // Brought forward 100 + 20 - 10 = 110; interest here 10; paid here 40; owing 80.
    expect(r).toEqual({ opening: 110, annual: 0, special: 0, interest: 10, paid: 40, closing: 80 });
  });
});

describe("B8: interest brought over at takeover does not cancel new interest", () => {
  it("accrues the review's $16.04 on Lot 1", async () => {
    data.Scheme = [{ id: "s", state: "NSW", interestMode: "STATUTORY" }];
    data.LevyNotice = [
      { id: "n1", schemeId: "s", status: "ISSUED", amountDue: "500.50", dueDate: "2026-07-01", interestCharged: "50", migratedInterestCharged: "50", migrationBatchId: "b", issuedAt: "2026-07-01T00:00:00.000Z" },
    ];
    data.LevyPayment = [];
    const [i] = await statutoryInterestForScheme("s", "2026-10-26");
    expect(i.interestCents).toBe(1604);
    expect(i.previouslyChargedCents).toBe(0);
    expect(i.additionalCents).toBe(1604);
  });

  it("does not charge again for the time before takeover when the original due date was kept", async () => {
    data.Scheme = [{ id: "s", state: "NSW", interestMode: "STATUTORY" }];
    // Due 1 Jan 2026, taken over 1 Jul 2026 with the old system's interest charged.
    data.LevyNotice = [
      { id: "n1", schemeId: "s", status: "ISSUED", amountDue: "1000", dueDate: "2026-01-01", interestCharged: "49.59", migratedInterestCharged: "49.59", migrationBatchId: "b", issuedAt: "2026-07-01T00:00:00.000Z" },
    ];
    data.LevyPayment = [];
    const [i] = await statutoryInterestForScheme("s", "2026-10-26");
    // Only 1 Jul to 26 Oct (117 days) on $1,000: $32.05.
    expect(i.additionalCents).toBe(3205);
  });
});

describe("B9: budget totals", () => {
  const accounts = new Map([
    ["levy", { accountType: "INCOME", accountSubType: "LEVY_INCOME" }],
    ["int", { accountType: "INCOME", accountSubType: "INTEREST_INCOME" }],
    ["ins", { accountType: "EXPENSE", accountSubType: "INSURANCE_EXPENSE" }],
  ]);
  it("keeps income and expenditure apart and takes the levy from levy income", () => {
    const t = budgetTotals([{ accountCodeId: "levy", budgetAmount: 40_000 }, { accountCodeId: "ins", budgetAmount: 40_000.01 }], accounts);
    expect(t).toEqual({ income: 40_000, levyIncome: 40_000, expenditure: 40_000.01, annualLevy: 40_000 });
    expect(t.annualLevy / 4).toBe(10_000);
  });
  it("without a levy income line, raises expenditure less other income", () => {
    expect(budgetTotals([{ accountCodeId: "int", budgetAmount: 1_000 }, { accountCodeId: "ins", budgetAmount: 9_000 }], accounts).annualLevy).toBe(8_000);
  });
});

describe("B10: budget vs actual", () => {
  it("includes accounts with spending but no budget line, nets reversals, and follows the scheme's year", async () => {
    data.Budget = [{ id: "b1", fundId: "f", financialYear: 2026, version: 1, status: "ADOPTED" }];
    data.BudgetLine = [{ id: "bl1", budgetId: "b1", fundId: "f", accountCodeId: "ins", financialYear: 2026, budgetAmount: "1000", notes: null }];
    data.AccountCode = [
      { id: "ins", code: "5-1100", name: "Insurance", accountType: "EXPENSE" },
      { id: "util", code: "5-1300", name: "Utilities", accountType: "EXPENSE" },
      { id: "lift", code: "5-2010", name: "Lift", accountType: "EXPENSE" },
    ];
    data.Scheme = [{ id: "s", financialYearEnd: "12-31" }];
    const l = (id: string, a: string, debit: number | null, credit: number | null) => ({ accountCodeId: a, fundId: "f", debit, credit, accountCode: data.AccountCode!.find((x) => (x as { id: string }).id === a) });
    data.JournalEntry = [
      { id: "1", transactionDate: "2026-03-01T00:00:00.000Z", status: "POSTED", lines: [l("1", "util", 25.55, null)] },
      { id: "2", transactionDate: "2026-04-01T00:00:00.000Z", status: "POSTED", lines: [l("2", "lift", 40, null)] },
      { id: "3", transactionDate: "2026-04-02T00:00:00.000Z", status: "POSTED", lines: [l("3", "lift", null, 40)] },
      { id: "4", transactionDate: "2027-02-01T00:00:00.000Z", status: "POSTED", lines: [l("4", "ins", 500, null)] },
    ];
    const r = await getBudgetVsActual("s", "f", 2026);
    expect(r.lines.map((x) => [x.accountCode, x.budgetAmount, x.actualAmount])).toEqual([
      ["5-1100", 1000, 0],
      ["5-1300", 0, 25.55],
    ]);
    expect(r.totalActual).toBe(25.55);
  });
});
