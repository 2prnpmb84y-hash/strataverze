import { describe, it, expect } from "vitest";
import { calculateLevyPayment } from "./levy-schedules";

describe("calculateLevyPayment", () => {
  it("calculates a partial payment correctly", () => {
    const result = calculateLevyPayment(0, 1000, 250);
    expect(result.newPaid).toBe(250);
    expect(result.newBalance).toBe(750);
    expect(result.isPaidInFull).toBe(false);
    expect(result.status).toBe("PARTIALLY_PAID");
  });

  it("marks as PAID when payment covers the full amount", () => {
    const result = calculateLevyPayment(0, 1000, 1000);
    expect(result.newPaid).toBe(1000);
    expect(result.newBalance).toBe(0);
    expect(result.isPaidInFull).toBe(true);
    expect(result.status).toBe("PAID");
  });

  it("handles overpayment gracefully", () => {
    const result = calculateLevyPayment(0, 1000, 1200);
    expect(result.newPaid).toBe(1200);
    expect(result.newBalance).toBe(0); // clamped to 0
    expect(result.isPaidInFull).toBe(true);
    expect(result.status).toBe("PAID");
  });

  it("accumulates multiple partial payments", () => {
    // First payment of 300
    const first = calculateLevyPayment(0, 1000, 300);
    expect(first.newPaid).toBe(300);
    expect(first.newBalance).toBe(700);

    // Second payment of 400 (currentPaid = 300)
    const second = calculateLevyPayment(300, 1000, 400);
    expect(second.newPaid).toBe(700);
    expect(second.newBalance).toBe(300);
    expect(second.isPaidInFull).toBe(false);

    // Final payment of 300 (currentPaid = 700)
    const third = calculateLevyPayment(700, 1000, 300);
    expect(third.newPaid).toBe(1000);
    expect(third.newBalance).toBe(0);
    expect(third.isPaidInFull).toBe(true);
    expect(third.status).toBe("PAID");
  });

  it("handles zero payment amount", () => {
    const result = calculateLevyPayment(500, 1000, 0);
    expect(result.newPaid).toBe(500);
    expect(result.newBalance).toBe(500);
    expect(result.isPaidInFull).toBe(false);
  });

  it("handles small fractional amounts", () => {
    const result = calculateLevyPayment(0, 100.50, 100.50);
    expect(result.newPaid).toBe(100.50);
    expect(result.newBalance).toBe(0);
    expect(result.isPaidInFull).toBe(true);
    expect(result.status).toBe("PAID");
  });

  it("handles very large amounts", () => {
    const result = calculateLevyPayment(0, 500000, 250000);
    expect(result.newPaid).toBe(250000);
    expect(result.newBalance).toBe(250000);
    expect(result.isPaidInFull).toBe(false);
  });

  it("marks paid when final payment brings balance to exactly zero", () => {
    const result = calculateLevyPayment(999.99, 1000, 0.01);
    expect(result.newPaid).toBeCloseTo(1000);
    expect(result.newBalance).toBeCloseTo(0);
    expect(result.isPaidInFull).toBe(true);
    expect(result.status).toBe("PAID");
  });
});
