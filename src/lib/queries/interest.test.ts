import { describe, it, expect } from "vitest";
import { calculateInterestForNotice } from "./interest";

describe("calculateInterestForNotice", () => {
  // Use UTC midnight dates to avoid timezone ambiguity
  const asAt = new Date("2024-07-01T00:00:00Z");

  function expectedInterest(
    balance: number,
    rate: number,
    days: number,
  ): number {
    return Math.round(((balance * (rate / 100) * days) / 365) * 100) / 100;
  }

  it("calculates daily interest for an overdue balance", () => {
    // Due 2024-06-01T00:00:00Z, asAt 2024-07-01T00:00:00Z
    // The function converts dueDate via new Date(String(...))
    const dueDate = "2024-06-01T00:00:00Z";
    const result = calculateInterestForNotice(1000, dueDate, 10, asAt);
    // Whatever the day count is, the formula should hold
    expect(result).toBeGreaterThan(0);
    expect(result).toBe(expectedInterest(1000, 10, 30));
  });

  it("returns 0 when balance is zero", () => {
    expect(
      calculateInterestForNotice(0, "2024-06-01T00:00:00Z", 10, asAt),
    ).toBe(0);
  });

  it("returns 0 when balance is negative", () => {
    expect(
      calculateInterestForNotice(-100, "2024-06-01T00:00:00Z", 10, asAt),
    ).toBe(0);
  });

  it("returns 0 when rate is zero", () => {
    expect(
      calculateInterestForNotice(1000, "2024-06-01T00:00:00Z", 0, asAt),
    ).toBe(0);
  });

  it("returns 0 when rate is negative", () => {
    expect(
      calculateInterestForNotice(1000, "2024-06-01T00:00:00Z", -5, asAt),
    ).toBe(0);
  });

  it("returns 0 when due date is in the future", () => {
    expect(
      calculateInterestForNotice(1000, "2024-08-01T00:00:00Z", 10, asAt),
    ).toBe(0);
  });

  it("returns 0 when due date equals asAt date", () => {
    expect(
      calculateInterestForNotice(1000, "2024-07-01T00:00:00Z", 10, asAt),
    ).toBe(0);
  });

  it("accepts Date objects as dueDate", () => {
    const dueDate = new Date("2024-06-01T00:00:00Z");
    const result = calculateInterestForNotice(1000, dueDate, 10, asAt);
    expect(result).toBe(expectedInterest(1000, 10, 30));
  });

  it("rounds result to 2 decimal places", () => {
    // 15 days overdue: 1000 * 0.10 * 15 / 365 = 4.10958...
    const dueDate = "2024-06-16T00:00:00Z";
    const result = calculateInterestForNotice(1000, dueDate, 10, asAt);
    // Should be rounded to exactly 2 decimal places
    const parts = String(result).split(".");
    if (parts.length > 1) {
      expect(parts[1].length).toBeLessThanOrEqual(2);
    }
  });

  it("handles large balances correctly", () => {
    const dueDate = "2024-01-01T00:00:00Z";
    const result = calculateInterestForNotice(50000, dueDate, 10, asAt);
    expect(result).toBeGreaterThan(2000);
    // 182 days: 50000 * 0.10 * 182 / 365 = 2493.15
    expect(result).toBe(expectedInterest(50000, 10, 182));
  });

  it("handles fractional rate", () => {
    const dueDate = "2024-06-01T00:00:00Z";
    const result = calculateInterestForNotice(1000, dueDate, 7.5, asAt);
    expect(result).toBe(expectedInterest(1000, 7.5, 30));
  });
});
