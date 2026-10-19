import { describe, it, expect } from "vitest";
import { calculateLevyPayment } from "./levy-schedules";

describe("calculateLevyPayment", () => {
  it("calculates a partial payment correctly", () => {
    const result = calculateLevyPayment(0, 1000, 400);
    expect(result.newPaid).toBe(400);
    expect(result.newBalance).toBe(600);
    expect(result.isPaidInFull).toBe(false);
    expect(result.status).toBe("PARTIALLY_PAID");
  });

  it("calculates exact full payment", () => {
    const result = calculateLevyPayment(0, 1000, 1000);
    expect(result.newPaid).toBe(1000);
    expect(result.newBalance).toBe(0);
    expect(result.isPaidInFull).toBe(true);
    expect(result.status).toBe("PAID");
  });

  it("handles second payment completing the balance", () => {
    // First payment of $600 already recorded, now paying remaining $400
    const result = calculateLevyPayment(600, 1000, 400);
    expect(result.newPaid).toBe(1000);
    expect(result.newBalance).toBe(0);
    expect(result.isPaidInFull).toBe(true);
    expect(result.status).toBe("PAID");
  });

  it("handles overpayment by clamping balance to zero", () => {
    const result = calculateLevyPayment(0, 1000, 1200);
    expect(result.newPaid).toBe(1200);
    expect(result.newBalance).toBe(0); // Clamped, not -200
    expect(result.isPaidInFull).toBe(true);
    expect(result.status).toBe("PAID");
  });

  it("handles overpayment on top of existing partial payment", () => {
    const result = calculateLevyPayment(800, 1000, 500);
    expect(result.newPaid).toBe(1300);
    expect(result.newBalance).toBe(0); // Clamped
    expect(result.isPaidInFull).toBe(true);
    expect(result.status).toBe("PAID");
  });

  it("handles small cent-level payments", () => {
    const result = calculateLevyPayment(0, 100.50, 50.25);
    expect(result.newPaid).toBe(50.25);
    expect(result.newBalance).toBe(50.25);
    expect(result.isPaidInFull).toBe(false);
    expect(result.status).toBe("PARTIALLY_PAID");
  });

  it("handles zero payment amount", () => {
    const result = calculateLevyPayment(0, 1000, 0);
    expect(result.newPaid).toBe(0);
    expect(result.newBalance).toBe(1000);
    expect(result.isPaidInFull).toBe(false);
    expect(result.status).toBe("PARTIALLY_PAID");
  });

  it("handles zero totalDue (fully credited notice)", () => {
    const result = calculateLevyPayment(0, 0, 0);
    expect(result.newBalance).toBe(0);
    expect(result.isPaidInFull).toBe(true);
    expect(result.status).toBe("PAID");
  });

  it("handles large strata levy amounts", () => {
    // $50,000 quarterly levy, $25,000 partial payment
    const result = calculateLevyPayment(0, 50000, 25000);
    expect(result.newPaid).toBe(25000);
    expect(result.newBalance).toBe(25000);
    expect(result.isPaidInFull).toBe(false);
  });

  it("handles multiple small payments accumulating", () => {
    // Simulate 3 payments: $300, $300, $400 on a $1000 levy
    let result = calculateLevyPayment(0, 1000, 300);
    expect(result.status).toBe("PARTIALLY_PAID");

    result = calculateLevyPayment(result.newPaid, 1000, 300);
    expect(result.newPaid).toBe(600);
    expect(result.status).toBe("PARTIALLY_PAID");

    result = calculateLevyPayment(result.newPaid, 1000, 400);
    expect(result.newPaid).toBe(1000);
    expect(result.newBalance).toBe(0);
    expect(result.status).toBe("PAID");
  });

  it("handles floating-point precision in payment amounts", () => {
    // $33.33 * 3 = $99.99, not exactly $100
    const result = calculateLevyPayment(66.66, 100, 33.33);
    expect(result.newPaid).toBeCloseTo(99.99, 2);
    expect(result.newBalance).toBeCloseTo(0.01, 2);
    expect(result.isPaidInFull).toBe(false);
    expect(result.status).toBe("PARTIALLY_PAID");
  });
});
