/**
 * The late charge in the shared shape (QLD stage 2, step 6, 27 Oct 2026):
 * Queensland's monthly penalty (Standard Module ss 165, 166(5)), the dispatch
 * by each pack's LATE_CHARGE, the payment order and the setting check. NSW
 * interest itself is covered by statutory-interest.test.ts and the golden
 * tests, which are unchanged.
 */
import { describe, expect, it } from "vitest";
import { QLD_RULE_PACK, statutoryRulesFor, type NswRules } from "@/config/statutory";
import {
  addMonths,
  allocatePayment,
  effectiveLateChargeMode,
  interestSettingProblem,
  lateCharge,
  lateChargeApplies,
  monthlyPenalty,
  statutoryInterest,
} from "./statutory-interest";

const NSW = statutoryRulesFor("NSW") as NswRules;
const QLD = QLD_RULE_PACK.rules;
const none = [] as { date: string; amountCents: number }[];

describe("the late charge rule of each pack", () => {
  it("is NSW's statutory interest, unchanged", () => {
    expect(NSW.LATE_CHARGE).toEqual({
      method: "DAILY_SIMPLE_ANNUAL",
      modes: ["STATUTORY", "NO_INTEREST"],
      defaultMode: "STATUTORY",
      resolutionRequiredFor: ["NO_INTEREST"],
      annualRatePercent: NSW.STATUTORY_INTEREST.annualRatePercent,
      maxMonthlyRatePercent: null,
      graceMonths: NSW.STATUTORY_INTEREST.graceMonths,
      source: NSW.STATUTORY_INTEREST.source,
    });
  });

  it("is Queensland's late payment penalty: none until resolved, at most 2.5% a month, no grace", () => {
    expect(QLD.LATE_CHARGE).toMatchObject({
      method: "MONTHLY_SIMPLE_WHOLE_MONTHS",
      modes: ["NONE", "RESOLVED_RATE"],
      defaultMode: "NONE",
      resolutionRequiredFor: ["RESOLVED_RATE"],
      annualRatePercent: null,
      maxMonthlyRatePercent: QLD.LATE_PAYMENT_PENALTY.maxMonthlyPercent,
      graceMonths: 0,
    });
    expect(QLD.LATE_PAYMENT_PENALTY.perWholeMonthInArrears).toBe(true);
    expect(QLD.LATE_CHARGE.source).toMatch(/s 165$/);
  });

  it("applies payments in each pack's order: NSW levy first, Queensland penalty first", () => {
    expect(NSW.PAYMENT_ALLOCATION_ORDER).toEqual(["LEVY", "INTEREST", "RECOVERY_COSTS"]);
    expect(QLD.PAYMENT_ALLOCATION_ORDER).toEqual(["INTEREST", "LEVY", "RECOVERY_COSTS"]);
  });
});

describe("addMonths, as the month marks use it", () => {
  it("clamps to the month end and counts each mark from the due date", () => {
    expect([1, 2, 3].map((k) => addMonths("2026-03-31", k))).toEqual(["2026-04-30", "2026-05-31", "2026-06-30"]);
    expect([1, 2, 3].map((k) => addMonths("2027-01-31", k))).toEqual(["2027-02-28", "2027-03-31", "2027-04-30"]);
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
  });
});

describe("monthlyPenalty (Standard Module s 165)", () => {
  const rate = { monthlyRatePercent: 2.5 };

  it("follows the Standard Module's example: due 31 March, paid 27 June, 2 whole months", () => {
    // Paid in full on 27 June: the $1,000 contribution and the $50 penalty charged by then.
    const r = monthlyPenalty({ levyCents: 100_000, dueDate: "2026-03-31", payments: [{ date: "2026-06-27", amountCents: 105_000 }], asAt: "2026-07-31" }, rate);
    // Marks 30 April and 31 May unpaid; 30 June paid. Each month 2.5% of $1,000.
    expect(r).toEqual({ interestCents: 5_000, daysAccrued: 61, graceEnds: "2026-03-31", reason: "ACCRUED", monthsAccrued: 2 });
    // Worked out on the days in between: one month once 30 April has passed, two once 31 May has.
    const unpaid = { levyCents: 100_000, dueDate: "2026-03-31", payments: none };
    expect(monthlyPenalty({ ...unpaid, asAt: "2026-05-31" }, rate).monthsAccrued).toBe(1);
    expect(monthlyPenalty({ ...unpaid, asAt: "2026-06-01" }, rate).monthsAccrued).toBe(2);
  });

  it("keeps charging on the part a payment of the contribution alone leaves unpaid, as the penalty is paid first", () => {
    const r = monthlyPenalty({ levyCents: 100_000, dueDate: "2026-03-31", payments: [{ date: "2026-06-27", amountCents: 100_000 }], asAt: "2026-07-31" }, rate);
    // $50 of the $1,000 paid goes to the penalty, so $50 of the contribution is unpaid at 30 June: 2.5% of $50 = $1.25.
    // The 31 July mark has not passed on 31 July.
    expect(r).toMatchObject({ interestCents: 5_000 + 125, monthsAccrued: 3 });
  });

  it("counts a month only once its mark has passed, with no grace period", () => {
    const notice = { levyCents: 100_000, dueDate: "2026-03-31", payments: none };
    expect(monthlyPenalty({ ...notice, asAt: "2026-04-01" }, rate)).toMatchObject({
      interestCents: 0,
      reason: "NOT_A_MONTH_IN_ARREARS",
      graceEnds: "2026-03-31",
      monthsAccrued: 0,
    });
    // On the mark day the owner can still pay within the month: no month yet.
    expect(monthlyPenalty({ ...notice, asAt: "2026-04-30" }, rate)).toMatchObject({ interestCents: 0, monthsAccrued: 0, reason: "NOT_A_MONTH_IN_ARREARS" });
    expect(monthlyPenalty({ ...notice, asAt: "2026-05-01" }, rate)).toEqual({ interestCents: 2_500, daysAccrued: 30, graceEnds: "2026-03-31", reason: "ACCRUED", monthsAccrued: 1 });
    expect(monthlyPenalty({ ...notice, asAt: "2027-03-31" }, rate)).toMatchObject({ interestCents: 27_500, monthsAccrued: 11 });
    expect(monthlyPenalty({ ...notice, asAt: "2027-04-01" }, rate)).toMatchObject({ interestCents: 30_000, monthsAccrued: 12 });
  });

  it("never charges a month a run on its mark day would have to take back", () => {
    const notice = { levyCents: 100_000, dueDate: "2026-03-31" };
    // A run on 30 April charges nothing; the owner pays in full that day, within the month; later runs charge nothing either.
    expect(monthlyPenalty({ ...notice, payments: none, asAt: "2026-04-30" }, rate).interestCents).toBe(0);
    const paid = { ...notice, payments: [{ date: "2026-04-30", amountCents: 100_000 }] };
    for (const asAt of ["2026-04-30", "2026-05-01", "2026-12-31"]) expect(monthlyPenalty({ ...paid, asAt }, rate).interestCents).toBe(0);
    expect(monthlyPenalty({ ...paid, asAt: "2026-12-31" }, rate).reason).toBe("NOT_A_MONTH_IN_ARREARS");
  });

  it("charges nothing when paid on or before the first mark", () => {
    const notice = { levyCents: 100_000, dueDate: "2026-03-31", asAt: "2026-12-31" };
    expect(monthlyPenalty({ ...notice, payments: [{ date: "2026-04-30", amountCents: 100_000 }] }, rate).interestCents).toBe(0);
    expect(monthlyPenalty({ ...notice, payments: [{ date: "2026-05-01", amountCents: 102_500 }] }, rate)).toMatchObject({ interestCents: 2_500, monthsAccrued: 1 });
  });

  it("charges each month on what is unpaid at its mark, after part payments before the mark", () => {
    const r = monthlyPenalty(
      { levyCents: 100_000, dueDate: "2026-01-15", payments: [{ date: "2026-02-01", amountCents: 40_000 }], asAt: "2026-03-20" },
      { monthlyRatePercent: 2 },
    );
    // 15 Feb and 15 Mar: 2% of $600 each.
    expect(r).toMatchObject({ interestCents: 2_400, monthsAccrued: 2 });
  });

  it("applies a payment after a mark to the penalty first, then the contribution (s 166(5))", () => {
    const r = monthlyPenalty(
      { levyCents: 100_000, dueDate: "2026-01-15", payments: [{ date: "2026-02-20", amountCents: 100_000 }], asAt: "2026-04-20" },
      rate,
    );
    // 15 Feb: 2.5% of $1,000 = $25. The $1,000 paid on 20 Feb pays the $25, then $975 of the contribution, so $25 stays unpaid.
    // 15 Mar: 2.5% of $25 = 62.5 cents, rounded half up to 63. 15 Apr: the same ($25 still unpaid; the penalty is not charged on penalty).
    expect(r).toMatchObject({ interestCents: 2_500 + 63 + 63, monthsAccrued: 3 });
    // Applied to the contribution first instead, the payment would clear it and no later month would be charged.
    const levyFirst = allocatePayment(100_000, { levyCents: 100_000, interestCents: 2_500, recoveryCostsCents: 0 });
    expect(levyFirst).toEqual({ levyCents: 100_000, interestCents: 0, recoveryCostsCents: 0, excessCents: 0 });
  });

  it("applies payments in date order, whatever order they are given in", () => {
    const payments = [
      { date: "2026-03-10", amountCents: 50_000 },
      { date: "2026-02-10", amountCents: 50_000 },
    ];
    const r = monthlyPenalty({ levyCents: 100_000, dueDate: "2026-01-15", payments, asAt: "2026-05-01" }, rate);
    // 15 Feb: $500 unpaid ($12.50). 10 Mar: $12.50 to the penalty, $487.50 to the contribution, so $12.50 unpaid.
    // 15 Mar and 15 Apr: 2.5% of $12.50 = 31.25 cents, rounded to 31 each.
    expect(r).toMatchObject({ interestCents: 1_250 + 31 + 31, monthsAccrued: 3 });
  });

  it("counts months from a 31 January due date to each month end, once each has passed", () => {
    const notice = { levyCents: 100_000, dueDate: "2027-01-31", payments: none };
    expect(monthlyPenalty({ ...notice, asAt: "2027-02-28" }, rate).interestCents).toBe(0);
    expect(monthlyPenalty({ ...notice, asAt: "2027-03-01" }, rate)).toMatchObject({ interestCents: 2_500, daysAccrued: 28, monthsAccrued: 1 });
    expect(monthlyPenalty({ ...notice, asAt: "2027-03-31" }, rate).monthsAccrued).toBe(1);
    expect(monthlyPenalty({ ...notice, asAt: "2027-04-01" }, rate)).toMatchObject({ monthsAccrued: 2, daysAccrued: 59 });
    expect(monthlyPenalty({ ...notice, dueDate: "2028-01-31", asAt: "2028-02-29" }, rate).monthsAccrued).toBe(0);
    expect(monthlyPenalty({ ...notice, dueDate: "2028-01-31", asAt: "2028-03-01" }, rate).monthsAccrued).toBe(1);
  });

  it("stops at write-off: a month ending on the stop day counts, later months do not", () => {
    const notice = { levyCents: 100_000, dueDate: "2026-01-15", payments: none, asAt: "2026-12-31" };
    expect(monthlyPenalty({ ...notice, stopAt: "2026-04-15" }, rate).monthsAccrued).toBe(3);
    expect(monthlyPenalty({ ...notice, stopAt: "2026-04-14" }, rate).monthsAccrued).toBe(2);
    // Written off on the first mark day: that month counts; before it, none.
    expect(monthlyPenalty({ ...notice, stopAt: "2026-02-15" }, rate).monthsAccrued).toBe(1);
    expect(monthlyPenalty({ ...notice, stopAt: "2026-02-14" }, rate)).toMatchObject({ monthsAccrued: 0, reason: "NOT_A_MONTH_IN_ARREARS" });
    // Stopping on the as-at day changes nothing.
    expect(monthlyPenalty({ ...notice, stopAt: "2026-12-31" }, rate)).toEqual(monthlyPenalty(notice, rate));
  });

  it("rounds each month's penalty half up to the cent, at a rate with 2 decimal places", () => {
    const month = (levyCents: number, monthlyRatePercent: number) =>
      monthlyPenalty({ levyCents, dueDate: "2026-01-15", payments: none, asAt: "2026-02-16" }, { monthlyRatePercent }).interestCents;
    expect(month(33_333, 1.25)).toBe(417); // 416.6625
    expect(month(5_000, 0.01)).toBe(1); // 0.5
    expect(month(4_999, 0.01)).toBe(0); // 0.4999
    expect(month(100_001, 2.5)).toBe(2_500); // 2500.025
    expect(month(100_020, 2.5)).toBe(2_501); // 2500.5
    expect(month(123_456, 0.1 + 0.2)).toBe(370); // 0.30000000000000004 is read as 0.3: 370.368
  });

  it("adds negative amounts (corrections) in, as NSW interest sums payments", () => {
    const notice = { levyCents: 100_000, dueDate: "2026-01-15", asAt: "2026-03-20" };
    const unpaid = monthlyPenalty({ ...notice, payments: none }, rate);
    // Paid and taken back before the first mark: as if never paid.
    const reversed = [
      { date: "2026-02-01", amountCents: 60_000 },
      { date: "2026-02-05", amountCents: -60_000 },
    ];
    expect(monthlyPenalty({ ...notice, payments: reversed }, rate)).toEqual(unpaid);
    // A correction on its own adds to what is unpaid, as NSW's sum does: 2.5% of $1,100 at 15 Feb and 15 Mar.
    expect(monthlyPenalty({ ...notice, payments: [{ date: "2026-02-01", amountCents: -10_000 }] }, rate).interestCents).toBe(2 * 2_750);
    // It first takes back what was paid above the contribution: $1,100 paid, $100 taken back, still paid in full.
    const over = [
      { date: "2026-02-01", amountCents: 110_000 },
      { date: "2026-02-03", amountCents: -10_000 },
    ];
    expect(monthlyPenalty({ ...notice, payments: over }, rate).interestCents).toBe(0);
    // Taken back after a mark: the contribution is unpaid again from the next mark.
    const later = [
      { date: "2026-02-01", amountCents: 100_000 },
      { date: "2026-02-20", amountCents: -100_000 },
    ];
    // 15 Feb was paid; at 15 Mar the contribution is unpaid again (1 month, of 28 days).
    expect(monthlyPenalty({ ...notice, payments: later }, rate)).toMatchObject({ interestCents: 2_500, monthsAccrued: 1, daysAccrued: 28, reason: "ACCRUED" });
  });

  it("charges nothing that is not yet due, owes nothing, or has no penalty", () => {
    const notice = { levyCents: 100_000, dueDate: "2026-03-31", payments: none };
    expect(monthlyPenalty({ ...notice, asAt: "2026-03-31" }, rate)).toMatchObject({ interestCents: 0, reason: "NOT_YET_DUE" });
    expect(monthlyPenalty({ ...notice, levyCents: 0, asAt: "2026-12-31" }, rate)).toMatchObject({ interestCents: 0, reason: "NOTHING_OWING" });
    expect(monthlyPenalty({ ...notice, asAt: "2026-12-31", noInterest: true }, rate)).toEqual({
      interestCents: 0,
      daysAccrued: 0,
      graceEnds: "2026-03-31",
      reason: "NO_INTEREST_RESOLUTION",
    });
  });
});

describe("lateCharge, by the pack's method and the building's setting", () => {
  const notice = { levyCents: 100_000, dueDate: "2026-03-31", payments: [{ date: "2026-06-27", amountCents: 105_000 }], asAt: "2026-09-30" };

  it("is NSW statutory interest, or none by resolution, exactly as before", () => {
    expect(lateCharge(notice, NSW.LATE_CHARGE, { mode: "STATUTORY" })).toEqual(statutoryInterest(notice, NSW.STATUTORY_INTEREST));
    expect(lateCharge(notice, NSW.LATE_CHARGE, { mode: "NO_INTEREST" })).toEqual(statutoryInterest({ ...notice, noInterest: true }, NSW.STATUTORY_INTEREST));
    // A setting the pack does not have is read as its default, as NSW always charged unless NO_INTEREST.
    expect(lateCharge(notice, NSW.LATE_CHARGE, { mode: "RESOLVED_RATE", monthlyRatePercent: 2 })).toEqual(statutoryInterest(notice, NSW.STATUTORY_INTEREST));
  });

  it("is the Queensland penalty only at a resolved rate", () => {
    expect(lateCharge(notice, QLD.LATE_CHARGE, { mode: "RESOLVED_RATE", monthlyRatePercent: 2.5 })).toMatchObject({ interestCents: 5_000, monthsAccrued: 2 });
    expect(lateCharge(notice, QLD.LATE_CHARGE, { mode: "NONE" })).toMatchObject({ interestCents: 0, reason: "NO_INTEREST_RESOLUTION", graceEnds: "2026-03-31" });
    // A resolved rate with no rate recorded charges nothing.
    expect(lateCharge(notice, QLD.LATE_CHARGE, { mode: "RESOLVED_RATE", monthlyRatePercent: null }).interestCents).toBe(0);
    // A stored rate above the pack's maximum (2.5%), or not above 0, is not relied on: nothing is charged.
    for (const monthlyRatePercent of [2.51, 10, 0, -1, Number.NaN]) {
      expect(lateCharge(notice, QLD.LATE_CHARGE, { mode: "RESOLVED_RATE", monthlyRatePercent })).toMatchObject({ interestCents: 0, reason: "NO_INTEREST_RESOLUTION" });
    }
    // The database default (STATUTORY) is not a Queensland setting: none applies.
    expect(effectiveLateChargeMode(QLD.LATE_CHARGE, "STATUTORY")).toBe("NONE");
    expect(lateCharge(notice, QLD.LATE_CHARGE, { mode: "STATUTORY" }).interestCents).toBe(0);
  });

  it("says whether anything is charged", () => {
    expect(lateChargeApplies(NSW.LATE_CHARGE, { mode: "STATUTORY" })).toBe(true);
    expect(lateChargeApplies(NSW.LATE_CHARGE, { mode: "NO_INTEREST" })).toBe(false);
    expect(lateChargeApplies(QLD.LATE_CHARGE, { mode: "NONE" })).toBe(false);
    expect(lateChargeApplies(QLD.LATE_CHARGE, { mode: "RESOLVED_RATE", monthlyRatePercent: 1.5 })).toBe(true);
    expect(lateChargeApplies(QLD.LATE_CHARGE, { mode: "RESOLVED_RATE", monthlyRatePercent: 0 })).toBe(false);
    expect(lateChargeApplies(QLD.LATE_CHARGE, { mode: "RESOLVED_RATE", monthlyRatePercent: 2.5 })).toBe(true);
    expect(lateChargeApplies(QLD.LATE_CHARGE, { mode: "RESOLVED_RATE", monthlyRatePercent: 2.51 })).toBe(false);
  });
});

describe("allocatePayment in the pack's order", () => {
  const owing = { levyCents: 50_000, interestCents: 2_000, recoveryCostsCents: 10_000 };

  it("applies NSW payments to the levy first, as without an order", () => {
    for (const p of [10_000, 51_000, 62_000, 70_000]) expect(allocatePayment(p, owing, NSW.PAYMENT_ALLOCATION_ORDER)).toEqual(allocatePayment(p, owing));
    expect(allocatePayment(10_000, owing, NSW.PAYMENT_ALLOCATION_ORDER)).toEqual({ levyCents: 10_000, interestCents: 0, recoveryCostsCents: 0, excessCents: 0 });
  });

  it("applies Queensland payments to the penalty first, then the contribution, then recovery costs", () => {
    expect(allocatePayment(1_500, owing, QLD.PAYMENT_ALLOCATION_ORDER)).toEqual({ levyCents: 0, interestCents: 1_500, recoveryCostsCents: 0, excessCents: 0 });
    expect(allocatePayment(10_000, owing, QLD.PAYMENT_ALLOCATION_ORDER)).toEqual({ levyCents: 8_000, interestCents: 2_000, recoveryCostsCents: 0, excessCents: 0 });
    expect(allocatePayment(70_000, owing, QLD.PAYMENT_ALLOCATION_ORDER)).toEqual({ levyCents: 50_000, interestCents: 2_000, recoveryCostsCents: 10_000, excessCents: 8_000 });
  });
});

describe("interestSettingProblem from the pack", () => {
  const nsw = (i: Parameters<typeof interestSettingProblem>[0]) => interestSettingProblem(i, NSW.LATE_CHARGE, NSW.TERMINOLOGY);
  const qld = (i: Parameters<typeof interestSettingProblem>[0]) => interestSettingProblem(i, QLD.LATE_CHARGE, QLD.TERMINOLOGY);
  const resolution = { resolutionMeetingId: "m", resolutionMotionId: "x" };

  it("gives NSW the same answers as the interest rule on its own, word for word", () => {
    const inputs = [
      { mode: "STATUTORY" },
      { mode: "STATUTORY", ratePercent: 8 },
      { mode: "NO_INTEREST" },
      { mode: "NO_INTEREST", ...resolution },
      { mode: "CUSTOM" },
      { mode: "NONE" },
      { mode: "RESOLVED_RATE", monthlyRatePercent: 2 },
    ];
    for (const i of inputs) expect(nsw(i)).toBe(interestSettingProblem(i, NSW.STATUTORY_INTEREST));
    expect(nsw({ mode: "NONE" })).toBe("Choose the statutory rate or no interest.");
  });

  it("offers Queensland no penalty or a penalty at the resolved rate", () => {
    expect(qld({ mode: "NONE" })).toBeNull();
    expect(qld({ mode: "STATUTORY" })).toBe("Choose no penalty or a penalty at the rate the body corporate resolved.");
    expect(qld({ mode: "NO_INTEREST" })).toBe("Choose no penalty or a penalty at the rate the body corporate resolved.");
  });

  it("needs a Queensland rate above 0, at most 2.5% a month, to 2 decimal places", () => {
    expect(qld({ mode: "RESOLVED_RATE", ...resolution })).toBe("Enter the monthly penalty rate the body corporate resolved, as a percentage more than 0.");
    expect(qld({ mode: "RESOLVED_RATE", monthlyRatePercent: 0, ...resolution })).toMatch(/more than 0/);
    expect(qld({ mode: "RESOLVED_RATE", monthlyRatePercent: Number.NaN, ...resolution })).toMatch(/more than 0/);
    expect(qld({ mode: "RESOLVED_RATE", monthlyRatePercent: 2.51, ...resolution })).toBe("The monthly penalty rate can be at most 2.5%.");
    expect(qld({ mode: "RESOLVED_RATE", monthlyRatePercent: 1.255, ...resolution })).toBe("Enter the monthly penalty rate with no more than 2 decimal places.");
    expect(qld({ mode: "RESOLVED_RATE", monthlyRatePercent: 2.5, ...resolution })).toBeNull();
    expect(qld({ mode: "RESOLVED_RATE", monthlyRatePercent: 0.01, ...resolution })).toBeNull();
    expect(qld({ mode: "RESOLVED_RATE", monthlyRatePercent: 0.1 + 0.2, ...resolution })).toBeNull();
  });

  it("needs the general meeting resolution for a Queensland penalty", () => {
    expect(qld({ mode: "RESOLVED_RATE", monthlyRatePercent: 2 })).toBe(
      "Charging a penalty needs the general meeting resolution that decided it. Choose the meeting and motion.",
    );
  });

  it("never names interest to a Queensland building, and has no dashes or semicolons", () => {
    const messages = [
      qld({ mode: "X" }),
      qld({ mode: "RESOLVED_RATE" }),
      qld({ mode: "RESOLVED_RATE", monthlyRatePercent: 9 }),
      qld({ mode: "RESOLVED_RATE", monthlyRatePercent: 1.001 }),
      qld({ mode: "RESOLVED_RATE", monthlyRatePercent: 1 }),
    ];
    for (const m of messages) {
      expect(m).toBeTruthy();
      expect(m).not.toMatch(/interest/i);
      expect(m).not.toMatch(/[;–—]| - /);
    }
  });
});
