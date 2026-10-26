/**
 * A statutory pack adopted before rule packs were recorded (26 Oct 2026) has
 * no `rules` in its stored copy. Its PDF must still render, using the
 * building's current rules (phase 1b review finding).
 */
import { describe, expect, it, vi } from "vitest";

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
const stored = vi.fn(async () => ({ id: "doc" }));
vi.mock("./store", () => ({ storeGeneratedPdf: (...a: unknown[]) => stored(...(a as [])) }));

import { generateStatutoryPackPdf } from "./generate";

describe("an adopted statutory pack stored before rule packs were recorded", () => {
  it("still renders, with the building's current rules", async () => {
    const fund = {
      fundId: "a",
      fundName: "Administrative Fund",
      fundType: "ADMINISTRATIVE",
      basis: "CASH",
      keyInformation: {
        balanceCarriedForwardCents: 0,
        totalIncomeReceivedCents: 0,
        totalInterestEarnedCents: 0,
        totalExpenditureCents: 0,
        administrationExpenditureCents: 0,
        balanceAtEndCents: 0,
        principalItemsNextPeriod: [],
      },
      income: [],
      expenditure: [],
      comparative: { incomeCents: 0, expenseCents: 0, surplusCents: 0 },
      totals: { incomeCents: 0, expenseCents: 0, surplusCents: 0 },
      balanceSheet: { assets: [], liabilities: [], ownersFundsCents: 0 },
      levyRegister: [],
      arrearsByLot: [],
    };
    // The shape stored before 26 Oct 2026: no `rules` key.
    const oldCopy = {
      scheme: { name: "Harbour View", planNumber: "12345", lots: 12 },
      financialYear: 2025,
      start: "2025-07-01",
      end: "2026-06-30",
      generatedAt: "2026-09-01T00:00:00Z",
      funds: [fund],
      notes: [],
      audit: { required: false, byLots: false, byBudget: false, annualBudgetCents: 0 },
      adopted: null,
    };
    data.Scheme = [{ id: "s", state: "NSW" }];
    data.StatutoryPackSnapshot = [{ id: "snap", meetingId: "m", adoptedAt: "2026-09-15T00:00:00Z", content: JSON.stringify(oldCopy) }];
    const pdf = await generateStatutoryPackPdf({ schemeId: "s", financialYear: 2025, actorId: "u" });
    expect(pdf?.bytes.length).toBeGreaterThan(1000);
    expect(pdf?.fileName).toMatch(/adopted/);
  });
});
