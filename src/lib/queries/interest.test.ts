import { describe, it, expect } from "vitest";
import { calculateInterestForNotice } from "./interest";

describe("calculateInterestForNotice", () => {
  const fixedNow = new Date("2024-07-01T00:00:00");

  it("calculates simple daily interest", () => {
    // $1000 outstanding, due 30 days ago, 10% annual rate
    const dueDate = new Date("2024-06-01");
    const result = calculateInterestForNotice(1000, dueDate, 10, fixedNow);
    // Expected: 1000 * 0.10 * 30 / 365 = 8.2191... ≈ 8.22
    expect(result).toBe(8.22);
  });

  it("returns 0 when balance is zero", () => {
    const result = calculateInterestForNotice(0, "2024-06-01", 10, fixedNow);
    expect(result).toBe(0);
  });

  it("returns 0 when balance is negative", () => {
    const result = calculateInterestForNotice(-100, "2024-06-01", 10, fixedNow);
    expect(result).toBe(0);
  });

  it("returns 0 when rate is zero", () => {
    const result = calculateInterestForNotice(1000, "2024-06-01", 0, fixedNow);
    expect(result).toBe(0);
  });

  it("returns 0 when rate is negative", () => {
    const result = calculateInterestForNotice(1000, "2024-06-01", -5, fixedNow);
    expect(result).toBe(0);
  });

  it("returns 0 when due date is in the future", () => {
    const futureDate = new Date("2024-08-01");
    const result = calculateInterestForNotice(1000, futureDate, 10, fixedNow);
    expect(result).toBe(0);
  });

  it("returns 0 when due date equals asAt date", () => {
    const result = calculateInterestForNotice(
      1000,
      "2024-07-01",
      10,
      fixedNow,
    );
    expect(result).toBe(0);
  });

  it("accepts string due dates", () => {
    const result = calculateInterestForNotice(
      1000,
      "2024-06-01",
      10,
      fixedNow,
    );
    expect(result).toBe(8.22);
  });

  it("rounds to 2 decimal places", () => {
    // Create a scenario that produces more than 2 decimal places
    const dueDate = new Date("2024-06-15");
    // 16 days overdue: 1000 * 0.10 * 16 / 365 = 4.38356... ≈ 4.38
    const result = calculateInterestForNotice(1000, dueDate, 10, fixedNow);
    expect(result).toBe(4.38);
  });

  it("handles large balances correctly", () => {
    const dueDate = new Date("2024-01-01"); // 182 days overdue
    const result = calculateInterestForNotice(50000, dueDate, 10, fixedNow);
    // 50000 * 0.10 * 182 / 365 = 2493.15068... ≈ 2493.15
    expect(result).toBe(2493.15);
  });

  it("handles one day overdue", () => {
    const dueDate = new Date("2024-06-30"); // 1 day overdue
    const result = calculateInterestForNotice(1000, dueDate, 10, fixedNow);
    // 1000 * 0.10 * 1 / 365 = 0.27397... ≈ 0.27
    expect(result).toBe(0.27);
  });
});
