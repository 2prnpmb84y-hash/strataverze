/**
 * The budget page's ?fund= stays inside the building (finding S-02, 31 Oct
 * 2026): a fund that is not one of the scheme's (another building's) is not
 * found and is never passed to the budget queries. The scheme's own funds
 * still work. The queries are scoped too (src/lib/queries/budget.scope.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const X = "aaaaaaaa-0000-4000-8000-000000000001";

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("@/lib/queries/profiles", () => ({ getCurrentProfile: vi.fn(async () => ({ id: "adviser-x" })) }));
vi.mock("@/lib/queries/schemes", () => ({
  getSchemeById: vi.fn(async (id: string) =>
    id === X ? { id: X, name: "X", state: "NSW", memberships: [{ profileId: "adviser-x", role: "ADVISER" }] } : null,
  ),
}));
vi.mock("@/lib/queries/funds", () => ({
  getFundsForScheme: vi.fn(async () => [
    { id: "fund-x-admin", name: "Administrative Fund", fundType: "ADMINISTRATIVE" },
    { id: "fund-x-capital", name: "Capital Works Fund", fundType: "CAPITAL_WORKS" },
  ]),
}));
vi.mock("@/lib/queries/account-codes", () => ({ getAccountCodesForScheme: vi.fn(async () => []) }));
vi.mock("@/lib/queries/budget", () => ({
  getBudgetLinesForScheme: vi.fn(async () => []),
  getBudgetVsActual: vi.fn(async () => null),
}));
vi.mock("@/lib/finance/budgets", () => ({ getBudgets: vi.fn(async () => []) }));
vi.mock("@/lib/finance/resolutions", () => ({ resolutionMeetings: vi.fn(async () => []) }));
vi.mock("./budget-client", () => ({ BudgetClient: () => null }));
vi.mock("./budget-status-panel", () => ({ BudgetStatusPanel: () => null }));

const { getBudgetVsActual } = await import("@/lib/queries/budget");
const { default: BudgetPage } = await import("./page");

const open = (fund?: string) =>
  BudgetPage({ params: Promise.resolve({ id: X }), searchParams: Promise.resolve({ year: "2026", ...(fund ? { fund } : {}) }) });

beforeEach(() => vi.clearAllMocks());

describe("the budget page's fund (S-02)", () => {
  it("is not found for another building's fund, which never reaches the queries", async () => {
    await expect(open("fund-of-scheme-y")).rejects.toThrow("NOT_FOUND");
    expect(getBudgetVsActual).not.toHaveBeenCalled();
  });

  it("compares one of the scheme's own funds", async () => {
    await open("fund-x-capital");
    expect(getBudgetVsActual).toHaveBeenCalledWith(X, "fund-x-capital", 2026);
  });

  it("defaults to the scheme's first fund", async () => {
    await open();
    expect(getBudgetVsActual).toHaveBeenCalledWith(X, "fund-x-admin", 2026);
  });
});
