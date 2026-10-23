import { describe, expect, it } from "vitest";
import { addMonths, allocatePayment, interestSettingProblem, statutoryInterest } from "./statutory-interest";

const notice = { levyCents: 100000, dueDate: "2026-07-01", payments: [] as { date: string; amountCents: number }[] };

describe("statutoryInterest", () => {
  it("charges nothing inside the one month grace period", () => {
    expect(statutoryInterest({ ...notice, asAt: "2026-07-20" })).toMatchObject({ interestCents: 0, reason: "IN_GRACE" });
  });

  it("charges nothing when paid in full within the grace period, even if checked later", () => {
    const r = statutoryInterest({ ...notice, payments: [{ date: "2026-07-31", amountCents: 100000 }], asAt: "2026-09-30" });
    expect(r).toMatchObject({ interestCents: 0, reason: "PAID_IN_GRACE" });
  });

  it("charges simple interest at 10% from the due date for 45 days overdue", () => {
    const r = statutoryInterest({ ...notice, asAt: "2026-08-15" });
    // $1,000 x 10% x 45 / 365 = $12.33
    expect(r).toMatchObject({ interestCents: 1233, daysAccrued: 45, reason: "ACCRUED" });
  });

  it("never compounds: interest is on the unpaid levy only", () => {
    const year = statutoryInterest({ ...notice, asAt: "2027-07-01" });
    expect(year.interestCents).toBe(10000); // exactly 10% of $1,000 for 365 days
  });

  it("accrues on the reduced balance after a part payment", () => {
    const r = statutoryInterest({ ...notice, payments: [{ date: "2026-07-11", amountCents: 50000 }], asAt: "2026-08-15" });
    // 10 days on $1,000 then 35 days on $500
    expect(r.interestCents).toBe(Math.round((100000 * 10 + 50000 * 35) * 10 / 100 / 365));
  });

  it("honours a resolution to charge no interest", () => {
    expect(statutoryInterest({ ...notice, asAt: "2026-12-01", noInterest: true })).toMatchObject({
      interestCents: 0,
      reason: "NO_INTEREST_RESOLUTION",
    });
  });

  it("stops accruing when a payment plan starts", () => {
    const paused = statutoryInterest({ ...notice, asAt: "2026-12-01", stopAt: "2026-08-15" });
    expect(paused.interestCents).toBe(1233);
  });

  it("handles month ends for the grace period", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
  });
});

describe("interestSettingProblem", () => {
  it("does not allow any rate other than the statutory rate", () => {
    expect(interestSettingProblem({ mode: "STATUTORY", ratePercent: 12 })).toMatch(/fixed at 10%/);
    expect(interestSettingProblem({ mode: "STATUTORY", ratePercent: 5 })).toMatch(/fixed at 10%/);
    expect(interestSettingProblem({ mode: "STATUTORY" })).toBeNull();
  });

  it("needs the resolution to charge no interest", () => {
    expect(interestSettingProblem({ mode: "NO_INTEREST" })).toMatch(/resolution/);
    expect(interestSettingProblem({ mode: "NO_INTEREST", resolutionMeetingId: "m", resolutionMotionId: "x" })).toBeNull();
  });
});

describe("allocatePayment", () => {
  it("applies payments to levies, then interest, then recovery costs, with any excess left over", () => {
    expect(allocatePayment(15000, { levyCents: 10000, interestCents: 2000, recoveryCostsCents: 5000 })).toEqual({
      levyCents: 10000,
      interestCents: 2000,
      recoveryCostsCents: 3000,
      excessCents: 0,
    });
    expect(allocatePayment(20000, { levyCents: 10000, interestCents: 2000, recoveryCostsCents: 5000 }).excessCents).toBe(3000);
  });
});
