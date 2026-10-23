import { describe, expect, it } from "vitest";
import { planAdoptionProblem, projectPlan, requiredAnnualContribution, reviewDueDate, spendByYear } from "./capital-works-plan";
import { budgetAdoptionProblem, budgetEditProblem, currentBudgets, levyScheduleActivationProblem } from "./budget-status";

const items = [
  { plannedYear: 2027, estimatedCostCents: 5_000_000 }, // year 2 of the plan
  { plannedYear: 2031, estimatedCostCents: 12_000_000 },
  { plannedYear: 2040, estimatedCostCents: 99_000_000 }, // outside a 2026 to 2035 plan
];

describe("capital works plan", () => {
  it("spreads spending across the 10 years and ignores items outside it", () => {
    const s = spendByYear(items, 2026);
    expect(s).toHaveLength(10);
    expect(s[1]).toBe(5_000_000);
    expect(s[5]).toBe(12_000_000);
    expect(s.reduce((a, b) => a + b, 0)).toBe(17_000_000);
  });

  it("finds the level contribution that keeps the fund above zero", () => {
    const c = requiredAnnualContribution({ items, startYear: 2026, openingBalanceCents: 2_000_000, method: "LEVEL" });
    // Worst point: by year 6, 170,000 needed less 20,000 held over 6 years = 25,000 a year.
    expect(c).toBe(2_500_000);
    const p = projectPlan({ items, startYear: 2026, openingBalanceCents: 2_000_000, annualContributionCents: c });
    expect(Math.min(...p.map((y) => y.closingCents))).toBeGreaterThanOrEqual(0);
  });

  it("averages when asked", () => {
    expect(requiredAnnualContribution({ items, startYear: 2026, openingBalanceCents: 2_000_000, method: "AVERAGE" })).toBe(1_500_000);
  });

  it("needs nothing when the fund already covers the plan", () => {
    expect(requiredAnnualContribution({ items, startYear: 2026, openingBalanceCents: 50_000_000, method: "LEVEL" })).toBe(0);
  });

  it("is due for review five years after it is prepared", () => {
    expect(reviewDueDate("2026-10-23")).toBe("2031-10-23");
    expect(reviewDueDate("2028-02-29")).toBe("2033-02-28");
  });

  it("needs items inside the plan and the adopting resolution", () => {
    const ok = { status: "DRAFT", items: items.slice(0, 2), startYear: 2026, meetingId: "m", motionId: "a" };
    expect(planAdoptionProblem(ok)).toBeNull();
    expect(planAdoptionProblem({ ...ok, items })).toMatch(/within the plan/);
    expect(planAdoptionProblem({ ...ok, motionId: null })).toMatch(/motion/);
  });
});

describe("budget lifecycle", () => {
  it("makes an adopted budget read-only", () => {
    expect(budgetEditProblem("DRAFT")).toBeNull();
    expect(budgetEditProblem("ADOPTED")).toMatch(/revision/);
  });

  it("needs the adopting resolution", () => {
    expect(budgetAdoptionProblem({ status: "PROPOSED", meetingId: "m", motionId: "a" })).toBeNull();
    expect(budgetAdoptionProblem({ status: "ADOPTED", meetingId: "m", motionId: "a" })).toMatch(/draft or proposed/);
  });

  it("only activates budget levies against an adopted budget", () => {
    const base = { levyType: "BUDGET", financialYear: 2026, fundName: "Administrative Fund" };
    expect(levyScheduleActivationProblem({ ...base, budgets: [{ financialYear: 2026, status: "PROPOSED" }] })).toMatch(/not been adopted/);
    expect(levyScheduleActivationProblem({ ...base, budgets: [{ financialYear: 2026, status: "ADOPTED" }] })).toBeNull();
    expect(levyScheduleActivationProblem({ ...base, levyType: "SPECIAL", budgets: [] })).toBeNull();
  });

  it("uses the adopted version, else the latest", () => {
    const b = (version: number, status: string) => ({ fundId: "f", financialYear: 2026, version, status });
    expect(currentBudgets([b(1, "ADOPTED"), b(2, "DRAFT")])[0].version).toBe(1);
    expect(currentBudgets([b(1, "SUPERSEDED"), b(2, "ADOPTED"), b(3, "DRAFT")])[0].version).toBe(2);
    expect(currentBudgets([b(1, "DRAFT"), b(2, "DRAFT")])[0].version).toBe(2);
  });
});
