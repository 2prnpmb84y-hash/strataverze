import { describe, expect, it } from "vitest";
import {
  addMonths,
  allocateCents,
  checkPlan,
  financialYearStart,
  planNotices,
  toIsoDay,
  type PlanLot,
} from "./notice-plan";

const lots: PlanLot[] = [
  { lotId: "a", lotNumber: "1", entitlement: 33, ownerId: "o1" },
  { lotId: "b", lotNumber: "2", entitlement: 33, ownerId: null },
  { lotId: "c", lotNumber: "3", entitlement: 34, ownerId: "o3" },
];

describe("allocateCents", () => {
  it("splits in proportion and always sums to the total", () => {
    const parts = allocateCents(100_000, [33, 33, 34]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100_000);
    expect(parts).toEqual([33_000, 33_000, 34_000]);
    const odd = allocateCents(1000, [1, 1, 1]);
    expect(odd.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(odd).toEqual([334, 333, 333]);
  });

  it("rejects zero weights", () => {
    expect(() => allocateCents(100, [0, 0])).toThrow();
  });
});

describe("dates", () => {
  it("works out the financial year start from the year-end", () => {
    expect(financialYearStart(2026, "06-30")).toBe("2026-07-01");
    expect(financialYearStart(2026, "12-31")).toBe("2026-01-01");
    expect(financialYearStart(2026, "03-31")).toBe("2026-04-01");
  });

  it("adds months and clamps month ends", () => {
    expect(addMonths("2026-07-01", 3)).toBe("2026-10-01");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });
});

describe("planNotices", () => {
  it("raises quarterly notices per lot that add up exactly", () => {
    const plan = planNotices({
      lots,
      totalCents: 1_000_001,
      frequency: "QUARTERLY",
      periodStart: "2026-07-01",
      firstDueDate: "2026-07-01",
    });
    expect(plan).toHaveLength(12);
    expect(plan.reduce((a, n) => a + n.amountCents, 0)).toBe(1_000_001);
    const lotA = plan.filter((n) => n.lotId === "a");
    expect(lotA.map((n) => [n.periodStart, n.periodEnd, n.dueDate])).toEqual([
      ["2026-07-01", "2026-09-30", "2026-07-01"],
      ["2026-10-01", "2026-12-31", "2026-10-01"],
      ["2027-01-01", "2027-03-31", "2027-01-01"],
      ["2027-04-01", "2027-06-30", "2027-04-01"],
    ]);
  });

  it("raises one notice per lot for a special levy", () => {
    const plan = planNotices({
      lots,
      totalCents: 50_000,
      frequency: "ONE_OFF",
      periodStart: "2026-11-01",
      firstDueDate: "2026-12-01",
    });
    expect(plan).toHaveLength(3);
    expect(plan.every((n) => n.dueDate === "2026-12-01")).toBe(true);
    expect(plan.reduce((a, n) => a + n.amountCents, 0)).toBe(50_000);
  });
});

describe("checkPlan", () => {
  it("passes when registered entitlement matches the total", () => {
    expect(checkPlan({ lots, totalEntitlement: 100, totalCents: 1, words: { levy: "levy", entitlement: "unit entitlement" } })).toEqual([]);
  });

  it("blocks when lots are missing", () => {
    const issues = checkPlan({ lots: lots.slice(0, 2), totalEntitlement: 100, totalCents: 1, words: { levy: "levy", entitlement: "unit entitlement" } });
    expect(issues.map((i) => i.kind)).toEqual(["ENTITLEMENT_MISMATCH"]);
    expect(issues[0].message).toBe("Registered lots hold 66 unit entitlement, but the schedule's total is 100. Register every lot (or correct the total) so each lot is levied its proper share.");
  });

  it("names the entitlement and the levy in the building's words", () => {
    const words = { levy: "contribution", entitlement: "contribution schedule lot entitlement" };
    const issues = checkPlan({ lots: lots.slice(0, 2), totalEntitlement: 100, totalCents: 0, words });
    expect(issues.map((i) => i.message)).toEqual([
      "The contribution amount must be greater than zero.",
      "Registered lots hold 66 contribution schedule lot entitlement, but the schedule's total is 100. Register every lot (or correct the total) so each lot is levied its proper share.",
    ]);
  });
});

describe("toIsoDay", () => {
  it("normalises database dates", () => {
    expect(toIsoDay("2026-07-01")).toBe("2026-07-01");
    expect(toIsoDay("2026-07-01T00:00:00.000Z")).toBe("2026-07-01");
    expect(toIsoDay(new Date(Date.UTC(2026, 6, 1)))).toBe("2026-07-01");
    expect(toIsoDay(null)).toBe("");
  });
});
