import { describe, it, expect } from "vitest";
import { buildPeriods } from "./levy-periods";

describe("buildPeriods", () => {
  // Use UTC dates to avoid timezone issues in tests
  const startDate = new Date(2024, 6, 1); // 1 July 2024

  // ── Quarterly ─────────────────────────────────────────────────

  describe("QUARTERLY frequency", () => {
    it("generates 4 quarterly periods", () => {
      const periods = buildPeriods("QUARTERLY", startDate, 10000, "Admin Fund");
      expect(periods).toHaveLength(4);
    });

    it("labels quarters correctly with prefix and FY label", () => {
      const periods = buildPeriods("QUARTERLY", startDate, 10000, "Admin Fund");
      expect(periods[0].title).toBe("Admin Fund Q1 FY25");
      expect(periods[1].title).toBe("Admin Fund Q2 FY25");
      expect(periods[2].title).toBe("Admin Fund Q3 FY25");
      expect(periods[3].title).toBe("Admin Fund Q4 FY25");
    });

    it("works without a prefix", () => {
      const periods = buildPeriods("QUARTERLY", startDate, 10000, "");
      expect(periods[0].title).toBe("Q1 FY25");
      expect(periods[3].title).toBe("Q4 FY25");
    });

    it("splits budget evenly across quarters", () => {
      const periods = buildPeriods("QUARTERLY", startDate, 10000, "");
      expect(periods[0].amount).toBe(2500);
      expect(periods[1].amount).toBe(2500);
      expect(periods[2].amount).toBe(2500);
      expect(periods[3].amount).toBe(2500);
    });

    it("handles rounding remainder in the last quarter", () => {
      // 10001 / 4 = 2500.25 per quarter
      // First 3: 2500.25 each = 7500.75
      // Last: 10001 - 7500.75 = 2500.25
      const periods = buildPeriods("QUARTERLY", startDate, 10001, "");
      const total = periods.reduce((sum, p) => sum + p.amount, 0);
      expect(total).toBe(10001);
    });

    it("handles odd amounts that cause rounding differences", () => {
      // 100.01 / 4 = 25.0025 -> rounds to 25.00
      // Last quarter: 100.01 - (25.00 * 3) = 25.01
      const periods = buildPeriods("QUARTERLY", startDate, 100.01, "");
      expect(periods[0].amount).toBe(25.0);
      expect(periods[3].amount).toBe(25.01);
      const total = periods.reduce((sum, p) => sum + p.amount, 0);
      expect(Math.round(total * 100) / 100).toBe(100.01);
    });

    it("spaces due dates 3 months apart", () => {
      const periods = buildPeriods("QUARTERLY", startDate, 10000, "");
      const dates = periods.map((p) => new Date(p.dueDate));

      expect(dates[0].getMonth()).toBe(6); // July
      expect(dates[1].getMonth()).toBe(9); // October
      expect(dates[2].getMonth()).toBe(0); // January (next year)
      expect(dates[3].getMonth()).toBe(3); // April (next year)
    });
  });

  // ── Half-Yearly ───────────────────────────────────────────────

  describe("HALF_YEARLY frequency", () => {
    it("generates 2 half-yearly periods", () => {
      const periods = buildPeriods("HALF_YEARLY", startDate, 10000, "Sinking Fund");
      expect(periods).toHaveLength(2);
    });

    it("labels halves correctly", () => {
      const periods = buildPeriods("HALF_YEARLY", startDate, 10000, "Sinking Fund");
      expect(periods[0].title).toBe("Sinking Fund H1 FY25");
      expect(periods[1].title).toBe("Sinking Fund H2 FY25");
    });

    it("splits budget evenly between halves", () => {
      const periods = buildPeriods("HALF_YEARLY", startDate, 10000, "");
      expect(periods[0].amount).toBe(5000);
      expect(periods[1].amount).toBe(5000);
    });

    it("handles rounding remainder in the second half", () => {
      // 10001 / 2 = 5000.5 each, both round the same way
      const periods = buildPeriods("HALF_YEARLY", startDate, 10001, "");
      const total = periods.reduce((sum, p) => sum + p.amount, 0);
      expect(total).toBe(10001);
    });

    it("spaces due dates 6 months apart", () => {
      const periods = buildPeriods("HALF_YEARLY", startDate, 10000, "");
      const dates = periods.map((p) => new Date(p.dueDate));
      expect(dates[0].getMonth()).toBe(6); // July
      expect(dates[1].getMonth()).toBe(0); // January (next year)
    });
  });

  // ── Annual ────────────────────────────────────────────────────

  describe("ANNUALLY frequency", () => {
    it("generates a single annual period", () => {
      const periods = buildPeriods("ANNUALLY", startDate, 10000, "Admin Fund");
      expect(periods).toHaveLength(1);
    });

    it("labels correctly with Annual Levy", () => {
      const periods = buildPeriods("ANNUALLY", startDate, 10000, "Admin Fund");
      expect(periods[0].title).toBe("Admin Fund Annual Levy FY25");
    });

    it("uses the full budget amount", () => {
      const periods = buildPeriods("ANNUALLY", startDate, 10000, "");
      expect(periods[0].amount).toBe(10000);
    });

    it("uses the start date as the due date", () => {
      const periods = buildPeriods("ANNUALLY", startDate, 10000, "");
      expect(new Date(periods[0].dueDate).getTime()).toBe(startDate.getTime());
    });
  });

  // ── Default / unknown ─────────────────────────────────────────

  describe("unknown frequency", () => {
    it("falls back to annual for unknown frequency", () => {
      const periods = buildPeriods("MONTHLY", startDate, 10000, "");
      expect(periods).toHaveLength(1);
      expect(periods[0].amount).toBe(10000);
    });
  });

  // ── FY label edge cases ───────────────────────────────────────

  describe("FY label generation", () => {
    it("generates correct FY label for 2024 start", () => {
      const periods = buildPeriods("ANNUALLY", new Date(2024, 6, 1), 1000, "");
      expect(periods[0].title).toContain("FY25");
    });

    it("generates correct FY label for 2030 start", () => {
      const periods = buildPeriods("ANNUALLY", new Date(2030, 6, 1), 1000, "");
      expect(periods[0].title).toContain("FY31");
    });
  });
});
