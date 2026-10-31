/**
 * Budget queries stay inside the scheme (finding S-02, 31 Oct 2026). The app
 * connects as a role that bypasses RLS, so the query is the boundary: an
 * Adviser of scheme X who passes a fund id of scheme Y must see none of Y's
 * budget lines, and X's own fund still works.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
// Actuals come from the scheme's own ledger; none are needed here.
vi.mock("@/lib/finance/fund-position", () => ({ ledgerLinesUpTo: vi.fn(async () => []) }));

const { sharedFake } = await import("@/test/fake-orm");
const { getBudgetLinesForFund, getBudgetLinesForScheme, getBudgetVsActual } = await import("./budget");

const X = "aaaaaaaa-0000-4000-8000-000000000001";
const Y = "bbbbbbbb-0000-4000-8000-000000000002";

beforeEach(() => {
  sharedFake.reset({
    Scheme: [
      { id: X, financialYearEnd: "06-30" },
      { id: Y, financialYearEnd: "06-30" },
    ],
    Fund: [
      { id: "fund-x", schemeId: X, name: "Administrative Fund" },
      { id: "fund-y", schemeId: Y, name: "Administrative Fund" },
    ],
    Budget: [
      { id: "budget-x", schemeId: X, fundId: "fund-x", financialYear: 2026, version: 1, status: "ADOPTED" },
      { id: "budget-y", schemeId: Y, fundId: "fund-y", financialYear: 2026, version: 1, status: "ADOPTED" },
    ],
    BudgetLine: [
      { id: "line-x", budgetId: "budget-x", fundId: "fund-x", accountCodeId: "acct-x", financialYear: 2026, budgetAmount: "1000", notes: "X's line" },
      { id: "line-y", budgetId: "budget-y", fundId: "fund-y", accountCodeId: "acct-y", financialYear: 2026, budgetAmount: "99999", notes: "Y's secret line" },
    ],
    AccountCode: [
      { id: "acct-x", schemeId: X, code: "5-1100", name: "Insurance", accountType: "EXPENSE" },
      { id: "acct-y", schemeId: Y, code: "5-1100", name: "Insurance", accountType: "EXPENSE" },
    ],
  });
});

describe("budget lines for a fund (S-02)", () => {
  it("give nothing for another scheme's fund", async () => {
    expect(await getBudgetLinesForFund(X, "fund-y", 2026)).toEqual([]);
  });

  it("give the scheme's own fund's lines", async () => {
    expect((await getBudgetLinesForFund(X, "fund-x", 2026)).map((l) => l.id)).toEqual(["line-x"]);
  });

  it("give nothing without a scheme", async () => {
    expect(await getBudgetLinesForFund("", "fund-y", 2026)).toEqual([]);
  });

  it("for the whole scheme, give only the scheme's lines", async () => {
    expect((await getBudgetLinesForScheme(X, 2026)).map((l) => l.id)).toEqual(["line-x"]);
  });
});

describe("budget vs actual (S-02)", () => {
  it("shows none of another scheme's budget lines, amounts or notes", async () => {
    const r = await getBudgetVsActual(X, "fund-y", 2026);
    expect(r.lines).toEqual([]);
    expect(r.totalBudget).toBe(0);
    expect(JSON.stringify(r)).not.toContain("line-y");
    expect(JSON.stringify(r)).not.toContain("Y's secret line");
  });

  it("still compares the scheme's own fund", async () => {
    const r = await getBudgetVsActual(X, "fund-x", 2026);
    expect(r.lines.map((l) => [l.budgetLineId, l.accountName, l.budgetAmount])).toEqual([["line-x", "Insurance", 1000]]);
    expect(r.totalBudget).toBe(1000);
  });
});
