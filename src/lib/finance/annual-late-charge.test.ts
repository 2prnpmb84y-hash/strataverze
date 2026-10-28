/**
 * The annual resolved rate and the one-case waiver (VIC, ACT and WA stage 2,
 * PR 5, 28 Oct 2026).
 *
 * The packs are tested as they are: where the notes leave a value out, the
 * engine refuses to charge (RULE_NOT_CONFIRMED). The working itself is tested
 * with fixtures that fill in only those missing values (as the plan says:
 * engine PRs are tested with fixtures, not pack values), marked "fixture".
 */
import { describe, expect, it } from "vitest";
import { PENDING_RULE_PACKS, statutoryRulesFor } from "@/config/statutory";
import {
  allocatePayment,
  annualLateChargeMissing,
  annualRateProblem,
  interestSettingProblem,
  lateCharge,
  lateChargeApplies,
  lateChargeFirst,
  lateChargeWaiverProblem,
  type InterestInput,
  type LateChargeRule,
  type LateChargeWaiver,
} from "./statutory-interest";
import { lateChargeWaiverWords, lateChargeWords, noticeLateCharge } from "@/lib/jurisdiction/wording";

const ACT = PENDING_RULE_PACKS.ACT.rules;
const WA = PENDING_RULE_PACKS.WA.rules;
const VIC = PENDING_RULE_PACKS.VIC.rules;
const NSW = statutoryRulesFor("NSW");
const QLD = PENDING_RULE_PACKS.QLD.rules;

/** A fixture: the pack's rule with the given accrual and range values filled in, as a later pack version would record them. */
function fixture(
  rule: LateChargeRule,
  fill: { from?: boolean; graceMonths?: number; daysInYear?: number; simple?: boolean; whoDecides?: boolean; maxPercent?: number; waiverKinds?: ("WHOLE" | "AMOUNT" | "PERIOD")[] },
): LateChargeRule {
  const a = rule.annual!;
  const v = <T>(value: T) => ({ value, status: "STRATAVERZE" as const, source: "fixture" });
  return {
    ...rule,
    annual: {
      ...a,
      accrual: {
        from: fill.from ? v("DUE_DATE" as const) : a.accrual.from,
        graceMonths: fill.graceMonths != null ? v(fill.graceMonths) : a.accrual.graceMonths,
        simple: fill.simple ? v(true as const) : a.accrual.simple,
        daysInYear: fill.daysInYear != null ? v(fill.daysInYear) : a.accrual.daysInYear,
      },
      resolvedRate: a.resolvedRate && {
        ...a.resolvedRate,
        resolution: fill.whoDecides ? v({ kind: "GENERAL_MEETING" as const, words: "general meeting resolution" }) : a.resolvedRate.resolution,
        maxPercent: fill.maxPercent != null ? v(fill.maxPercent) : a.resolvedRate.maxPercent,
      },
      waiver: a.waiver && {
        ...a.waiver,
        ...(fill.whoDecides ? { decidedBy: v({ kind: "GENERAL_MEETING" as const, words: "general meeting resolution" }) } : {}),
        ...(fill.waiverKinds ? { kinds: fill.waiverKinds } : {}),
      },
    },
  };
}
const ACT_FIX = fixture(ACT.LATE_CHARGE, { from: true, graceMonths: 0, daysInYear: 365 });
const WA_FIX = fixture(WA.LATE_CHARGE, { daysInYear: 365 });
const VIC_FIX = fixture(VIC.LATE_CHARGE, { simple: true, daysInYear: 365, maxPercent: 10 });
/** Fixture: the Victorian waiver as proposed (a general meeting resolution; all, an amount or a period), as if decided. */
const VIC_WAIVER_FIX = fixture(VIC.LATE_CHARGE, { simple: true, daysInYear: 365, maxPercent: 10, whoDecides: true, waiverKinds: ["WHOLE", "AMOUNT", "PERIOD"] });

const LEVY_FIRST = ["LEVY", "INTEREST", "RECOVERY_COSTS"] as const;
/** $1,000 due 31 January 2026, unpaid. */
const input = (asAt: string, extra: Partial<InterestInput> = {}): InterestInput => ({ levyCents: 100_000, dueDate: "2026-01-31", payments: [], asAt, ...extra });
const T = (rules: { TERMINOLOGY: { lateCharge: string; ownersCorporation: string } }) => rules.TERMINOLOGY;
const resolution = { resolutionMeetingId: "m", resolutionMotionId: "x" };

describe("the shared shape", () => {
  it("NSW and Queensland have no annual-rate rule, so nothing new applies to them", () => {
    expect(NSW.LATE_CHARGE.annual).toBeUndefined();
    expect(QLD.LATE_CHARGE.annual).toBeUndefined();
    expect(NSW.LATE_CHARGE.modes).not.toContain("RESOLVED_ANNUAL_RATE");
    expect(QLD.LATE_CHARGE.modes).not.toContain("RESOLVED_ANNUAL_RATE");
  });

  it("an annual-rate pack leaves the older rate fields empty, so a reader of those charges nothing", () => {
    for (const rules of [ACT, WA, VIC]) {
      expect(rules.LATE_CHARGE).toMatchObject({ method: "ANNUAL_RATE", annualRatePercent: null, maxMonthlyRatePercent: null, graceMonths: 0 });
    }
  });

  it("VIC, ACT and WA apply payments to the levy first, as NSW, as Matthew Wrigley decided on 28 Oct 2026", () => {
    for (const rules of [ACT, WA, VIC]) {
      expect(rules.PAYMENT_ALLOCATION_ORDER).toEqual(NSW.PAYMENT_ALLOCATION_ORDER);
      expect(lateChargeFirst(rules.PAYMENT_ALLOCATION_ORDER)).toBe(false);
      expect(rules.DECISIONS.some((d) => d.decision.includes("PAYMENT_ALLOCATION_ORDER") && d.decidedBy === "Matthew Wrigley" && d.decidedOn === "2026-10-28")).toBe(true);
    }
    expect(allocatePayment(10_000, { levyCents: 8_000, interestCents: 3_000, recoveryCostsCents: 0 }, ACT.PAYMENT_ALLOCATION_ORDER)).toEqual({ levyCents: 8_000, interestCents: 2_000, recoveryCostsCents: 0, excessCents: 0 });
  });

  it("a payment order that pays the late charge first is refused by the annual engine", () => {
    const r = lateCharge(input("2026-03-02"), ACT_FIX, { mode: "STATUTORY" }, { order: ["INTEREST", "LEVY", "RECOVERY_COSTS"] });
    expect(r).toMatchObject({ reason: "RULE_NOT_CONFIRMED", interestCents: 0, missing: ["paymentAllocationOrder"] });
    expect(lateChargeApplies(ACT_FIX, { mode: "STATUTORY" }, ["INTEREST", "LEVY", "RECOVERY_COSTS"])).toBe(false);
    expect(lateChargeApplies(ACT_FIX, { mode: "STATUTORY" }, LEVY_FIRST)).toBe(true);
  });
});

describe("ACT: 10% by default, 0 to 20% by special resolution (UTMA s 94)", () => {
  const rule = ACT.LATE_CHARGE;

  it("records the rates and the special resolution from the notes", () => {
    expect(rule.defaultMode).toBe("STATUTORY");
    expect(rule.modes).toEqual(["STATUTORY", "RESOLVED_ANNUAL_RATE"]);
    expect(rule.annual!.statutoryRatePercent).toMatchObject({ value: 10, status: "CONFIRMED" });
    expect(rule.annual!.resolvedRate).toMatchObject({
      resolution: { value: { kind: "SPECIAL" }, status: "CONFIRMED" },
      minPercent: { value: 0, status: "CONFIRMED" },
      maxPercent: { value: 20, status: "CONFIRMED" },
      maxInclusive: true,
    });
    expect(rule.annual!.waiver).toBeNull();
  });

  it("charges nothing as the pack stands: the start day, grace and day basis are not in the notes", () => {
    expect(rule.annual!.accrual.from.value).toBeNull();
    expect(rule.annual!.accrual.graceMonths.value).toBeNull();
    expect(rule.annual!.accrual.daysInYear.value).toBeNull();
    const r = lateCharge(input("2026-03-02"), rule, { mode: "STATUTORY" }, { order: ACT.PAYMENT_ALLOCATION_ORDER });
    expect(r).toMatchObject({ interestCents: 0, reason: "RULE_NOT_CONFIRMED", missing: ["accrual.from", "accrual.graceMonths", "accrual.daysInYear"] });
    expect(lateChargeApplies(rule, { mode: "STATUTORY" })).toBe(false);
  });

  it("fixture: 10% a year by default, day by day from the due date", () => {
    // 30 days on $1,000 at 10%: 1000 x 0.10 x 30 / 365 = $8.219..., so $8.22.
    expect(lateCharge(input("2026-03-02"), ACT_FIX, { mode: "STATUTORY" }, { order: LEVY_FIRST })).toEqual({ interestCents: 822, daysAccrued: 30, graceEnds: "2026-01-31", reason: "ACCRUED" });
  });

  it("a special resolution may set 0% (nothing charged) or 20%", () => {
    expect(interestSettingProblem({ mode: "RESOLVED_ANNUAL_RATE", annualRatePercent: 0, ...resolution }, rule, T(ACT))).toBeNull();
    expect(interestSettingProblem({ mode: "RESOLVED_ANNUAL_RATE", annualRatePercent: 20, ...resolution }, rule, T(ACT))).toBeNull();
    const zero = { mode: "RESOLVED_ANNUAL_RATE", annualRatePercent: 0 };
    expect(lateCharge(input("2026-03-02"), ACT_FIX, zero, { order: LEVY_FIRST })).toMatchObject({ interestCents: 0, reason: "NO_INTEREST_RESOLUTION" });
    expect(lateChargeApplies(ACT_FIX, zero)).toBe(false);
    // 30 days at 20%: $16.438..., so $16.44.
    expect(lateCharge(input("2026-03-02"), ACT_FIX, { mode: "RESOLVED_ANNUAL_RATE", annualRatePercent: 20 }, { order: LEVY_FIRST })).toMatchObject({ interestCents: 1_644, reason: "ACCRUED" });
  });

  it("refuses 21%, a negative rate, 3 decimal places and a missing resolution", () => {
    expect(interestSettingProblem({ mode: "RESOLVED_ANNUAL_RATE", annualRatePercent: 21, ...resolution }, rule, T(ACT))).toBe("The yearly interest rate must be from 0% to 20% a year.");
    expect(interestSettingProblem({ mode: "RESOLVED_ANNUAL_RATE", annualRatePercent: 20.01, ...resolution }, rule, T(ACT))).toBe("The yearly interest rate must be from 0% to 20% a year.");
    expect(interestSettingProblem({ mode: "RESOLVED_ANNUAL_RATE", annualRatePercent: -1, ...resolution }, rule, T(ACT))).toMatch(/as a percentage/);
    expect(interestSettingProblem({ mode: "RESOLVED_ANNUAL_RATE", annualRatePercent: 12.345, ...resolution }, rule, T(ACT))).toMatch(/2 decimal places/);
    expect(interestSettingProblem({ mode: "RESOLVED_ANNUAL_RATE", annualRatePercent: 12 }, rule, T(ACT))).toBe(
      "Charging interest at a resolved rate needs the special resolution that decided it. Choose the meeting and motion.",
    );
    expect(interestSettingProblem({ mode: "NO_INTEREST", ...resolution }, rule, T(ACT))).toMatch(/^Choose the statutory rate or interest at a yearly rate/);
  });

  it("a 21% rate found stored is not relied on (fails closed)", () => {
    const r = lateCharge(input("2026-03-02"), ACT_FIX, { mode: "RESOLVED_ANNUAL_RATE", annualRatePercent: 21 }, { order: LEVY_FIRST });
    expect(r).toMatchObject({ interestCents: 0, reason: "RULE_NOT_CONFIRMED", missing: ["resolvedRatePercent"] });
  });
});

describe("WA: 11% simple from the due date, or a lower rate (STA s 100(4)(b); reg 78)", () => {
  const rule = WA.LATE_CHARGE;

  it("records 11% from the due date with no grace period, and a lower rate decided by a body not confirmed", () => {
    expect(rule.annual!.statutoryRatePercent).toMatchObject({ value: 11, status: "CONFIRMED" });
    expect(rule.annual!.accrual).toMatchObject({ from: { value: "DUE_DATE", status: "CONFIRMED" }, graceMonths: { value: 0, status: "CONFIRMED" }, simple: { value: true } });
    expect(rule.annual!.accrual.daysInYear).toMatchObject({ value: null, status: "NOT_CONFIRMED" });
    expect(rule.annual!.resolvedRate).toMatchObject({ resolution: { value: null, status: "NOT_CONFIRMED" }, minPercent: { value: 0 }, maxPercent: { value: 11 }, maxInclusive: false });
    expect(missingFor(rule, { mode: "STATUTORY" })).toEqual(["accrual.daysInYear"]);
  });

  it("fixture: 11% from the due date, with no grace period", () => {
    // Paid the day after: one day on $1,000 at 11% is 30.1 cents, so 30 cents.
    expect(lateCharge(input("2026-03-31", { payments: [{ date: "2026-02-01", amountCents: 100_000 }] }), WA_FIX, { mode: "STATUTORY" }, { order: LEVY_FIRST })).toMatchObject({ interestCents: 30, daysAccrued: 1, reason: "ACCRUED" });
    // Paid on the due date: nothing owing.
    expect(lateCharge(input("2026-03-31", { payments: [{ date: "2026-01-31", amountCents: 100_000 }] }), WA_FIX, { mode: "STATUTORY" }, { order: LEVY_FIRST })).toMatchObject({ interestCents: 0, reason: "NOTHING_OWING" });
    // 59 days unpaid: 1000 x 0.11 x 59 / 365 = $17.78.
    expect(lateCharge(input("2026-03-31"), WA_FIX, { mode: "STATUTORY" }, { order: LEVY_FIRST })).toMatchObject({ interestCents: 1_778, daysAccrued: 59 });
  });

  it("a lower rate cannot be recorded while who decides is not confirmed; with it, a rate below 11% is charged", () => {
    expect(interestSettingProblem({ mode: "RESOLVED_ANNUAL_RATE", annualRatePercent: 5, ...resolution }, rule, T(WA))).toBe(
      "Who may set a different interest rate is not confirmed for this building's rules yet, so no rate can be recorded.",
    );
    expect(lateCharge(input("2026-03-02"), WA_FIX, { mode: "RESOLVED_ANNUAL_RATE", annualRatePercent: 5 }, { order: LEVY_FIRST })).toMatchObject({ reason: "RULE_NOT_CONFIRMED", missing: ["resolvedRate.resolution"] });
    const decided = fixture(WA.LATE_CHARGE, { daysInYear: 365, whoDecides: true });
    // 30 days at 5%: $4.109..., so $4.11.
    expect(lateCharge(input("2026-03-02"), decided, { mode: "RESOLVED_ANNUAL_RATE", annualRatePercent: 5 }, { order: LEVY_FIRST })).toMatchObject({ interestCents: 411, reason: "ACCRUED" });
    // "A lesser rate": 11% itself is not one, 10.99% is.
    expect(annualRateProblem(decided.annual, 11, T(WA))).toBe("The yearly interest rate must be at least 0% and less than 11% a year.");
    expect(annualRateProblem(decided.annual, 10.99, T(WA))).toBeNull();
    expect(annualRateProblem(decided.annual, 0, T(WA))).toBeNull();
  });
});

describe("VIC: only by resolution, capped at the Penalty Interest Rates Act maximum (OCA s 29)", () => {
  const rule = VIC.LATE_CHARGE;

  it("starts with no interest and fixes no rate", () => {
    expect(rule.defaultMode).toBe("NONE");
    expect(rule.modes).toEqual(["NONE", "RESOLVED_ANNUAL_RATE"]);
    expect(rule.annual!.statutoryRatePercent).toBeNull();
    expect(rule.annual!.resolvedRate!.resolution).toMatchObject({ value: { kind: "GENERAL_MEETING" }, status: "CONFIRMED" });
  });

  it("is refused as a cap until the rate is confirmed: 10% is guidance only, never used", () => {
    expect(rule.annual!.resolvedRate!.maxPercent).toMatchObject({ value: null, status: "GUIDANCE", guidance: 10 });
    expect(interestSettingProblem({ mode: "RESOLVED_ANNUAL_RATE", annualRatePercent: 8, ...resolution }, rule, T(VIC))).toBe(
      "The highest interest rate a resolution may set is not confirmed yet, so no rate can be recorded.",
    );
    expect(missingFor(rule, { mode: "RESOLVED_ANNUAL_RATE", annualRatePercent: 8 })).toEqual(["resolvedRate.maxPercent", "accrual.simple", "accrual.daysInYear"]);
    expect(lateCharge(input("2026-03-02"), rule, { mode: "RESOLVED_ANNUAL_RATE", annualRatePercent: 8 }, { order: VIC.PAYMENT_ALLOCATION_ORDER })).toMatchObject({ interestCents: 0, reason: "RULE_NOT_CONFIRMED" });
    expect(lateCharge(input("2026-03-02"), rule, { mode: "NONE" })).toMatchObject({ interestCents: 0, reason: "NO_INTEREST_RESOLUTION" });
  });

  it("fixture: with the cap and accrual recorded, a resolved rate up to and including the cap", () => {
    expect(annualRateProblem(VIC_FIX.annual, 10, T(VIC))).toBeNull();
    expect(annualRateProblem(VIC_FIX.annual, 10.01, T(VIC))).toBe("The yearly interest rate must be from 0% to 10% a year.");
    expect(lateCharge(input("2026-03-02"), VIC_FIX, { mode: "RESOLVED_ANNUAL_RATE", annualRatePercent: 10 }, { order: LEVY_FIRST })).toMatchObject({ interestCents: 822 });
  });
});

describe("the waiver in a particular case", () => {
  const setting = { mode: "RESOLVED_ANNUAL_RATE", annualRatePercent: 10 };
  const run = (waivers: LateChargeWaiver[], asAt = "2026-03-02") => lateCharge(input(asAt), VIC_FIX, setting, { order: LEVY_FIRST, waivers });

  it("waives one notice and leaves another notice charged", () => {
    expect(run([{ kind: "WHOLE" }])).toEqual({ interestCents: 0, daysAccrued: 0, graceEnds: "2026-01-31", reason: "WAIVED" });
    expect(run([])).toMatchObject({ interestCents: 822, reason: "ACCRUED" });
  });

  it("an amount comes off the total, never below 0", () => {
    expect(run([{ kind: "AMOUNT", amountCents: 300 }])).toMatchObject({ interestCents: 522, reason: "ACCRUED", waivedCents: 300, waivedDays: 0 });
    expect(run([{ kind: "AMOUNT", amountCents: 5_000 }])).toMatchObject({ interestCents: 0, reason: "WAIVED", waivedCents: 822 });
  });

  it("a period leaves its days out, first and last day included", () => {
    // 1 to 10 February waived: 20 of the 30 days are charged, 1000 x 0.10 x 20 / 365 = $5.479..., so $5.48.
    expect(run([{ kind: "PERIOD", fromDate: "2026-02-01", toDate: "2026-02-10" }])).toMatchObject({ interestCents: 548, daysAccrued: 20, waivedDays: 10 });
  });

  it("is ignored by NSW and Queensland, which have no waiver", () => {
    const nsw = lateCharge(input("2026-04-30"), NSW.LATE_CHARGE, { mode: "STATUTORY" });
    expect(lateCharge(input("2026-04-30"), NSW.LATE_CHARGE, { mode: "STATUTORY" }, { waivers: [{ kind: "WHOLE" }], order: ["INTEREST", "LEVY", "RECOVERY_COSTS"] })).toEqual(nsw);
    const qld = lateCharge(input("2026-04-30"), QLD.LATE_CHARGE, { mode: "RESOLVED_RATE", monthlyRatePercent: 2.5 });
    expect(lateCharge(input("2026-04-30"), QLD.LATE_CHARGE, { mode: "RESOLVED_RATE", monthlyRatePercent: 2.5 }, { waivers: [{ kind: "WHOLE" }] })).toEqual(qld);
  });

  it("Victoria: who decides is not confirmed, so none can be recorded yet, and only all of the interest is offered", () => {
    expect(VIC.LATE_CHARGE.annual!.waiver).toMatchObject({ kinds: ["WHOLE"], decidedBy: { value: null, status: "NOT_CONFIRMED" }, reportedToAgm: true });
    expect(lateChargeWaiverProblem({ kind: "WHOLE", reasons: "Hardship", ...resolution }, VIC.LATE_CHARGE, T(VIC))).toBe(
      "Who may waive interest is not confirmed for this building's rules yet, so no waiver can be recorded.",
    );
  });

  it("fixture: as proposed for Victoria (all, an amount or a period, with reasons); not in the ACT (none) or WA (who decides not confirmed)", () => {
    const V = VIC_WAIVER_FIX;
    const ok = { kind: "WHOLE", reasons: "Hardship", ...resolution };
    expect(lateChargeWaiverProblem(ok, V, T(VIC))).toBeNull();
    expect(lateChargeWaiverProblem({ ...ok, kind: "AMOUNT", amountCents: 1_250 }, V, T(VIC))).toBeNull();
    expect(lateChargeWaiverProblem({ ...ok, kind: "PERIOD", fromDate: "2026-02-01", toDate: "2026-02-01" }, V, T(VIC))).toBeNull();
    expect(lateChargeWaiverProblem({ ...ok, kind: "AMOUNT", amountCents: 1_250 }, VIC.LATE_CHARGE, T(VIC))).toMatch(/not confirmed/);
    expect(lateChargeWaiverProblem({ ...ok, kind: "AMOUNT", amountCents: 1_250 }, fixture(VIC.LATE_CHARGE, { whoDecides: true }), T(VIC))).toMatch(/^Choose what is waived/);
    expect(lateChargeWaiverProblem({ ...ok, reasons: " " }, V, T(VIC))).toBe("Enter the reasons for the decision. They are reported to the annual general meeting.");
    expect(lateChargeWaiverProblem({ ...ok, kind: "AMOUNT", amountCents: 0 }, V, T(VIC))).toMatch(/more than \$0/);
    expect(lateChargeWaiverProblem({ ...ok, kind: "AMOUNT", amountCents: Number.NaN }, V, T(VIC))).toMatch(/more than \$0/);
    expect(lateChargeWaiverProblem({ ...ok, kind: "PERIOD", fromDate: "2026-02-10", toDate: "2026-02-01" }, V, T(VIC))).toMatch(/first on or before the last/);
    expect(lateChargeWaiverProblem({ ...ok, kind: "PERIOD", fromDate: "2026-02-30", toDate: "2026-03-01" }, V, T(VIC))).toMatch(/first on or before the last/);
    expect(lateChargeWaiverProblem({ ...ok, kind: "HALF" }, V, T(VIC))).toMatch(/^Choose what is waived/);
    expect(lateChargeWaiverProblem({ kind: "WHOLE", reasons: "Hardship" }, V, T(VIC))).toBe(
      "A waiver needs the general meeting resolution that decided it. Choose the meeting and motion.",
    );
    expect(lateChargeWaiverProblem(ok, ACT.LATE_CHARGE, T(ACT))).toBe("This building's rules give no waiver of interest in a particular case.");
    expect(lateChargeWaiverProblem(ok, WA.LATE_CHARGE, T(WA))).toBe("Who may waive interest is not confirmed for this building's rules yet, so no waiver can be recorded.");
    expect(lateChargeWaiverProblem(ok, NSW.LATE_CHARGE, T(NSW))).toBe("This building's rules give no waiver of interest in a particular case.");
    expect(WA.LATE_CHARGE.annual!.waiver!.kinds).toEqual(["WHOLE"]);
  });
});

describe("day count boundaries", () => {
  const charge = (i: InterestInput, rule: LateChargeRule = ACT_FIX) => lateCharge(i, rule, { mode: "STATUTORY" }, { order: LEVY_FIRST });

  it("counts from the due date: none on the due date, one day the day after, the as-at day not counted", () => {
    expect(charge(input("2026-01-31"))).toMatchObject({ reason: "NOT_YET_DUE", interestCents: 0 });
    expect(charge(input("2026-02-01"))).toMatchObject({ reason: "ACCRUED", daysAccrued: 1 });
    expect(charge(input("2026-02-02"))).toMatchObject({ daysAccrued: 2 });
  });

  it("counts 29 February in a leap year, and 366 days over a leap year at the 365 day basis", () => {
    expect(charge({ levyCents: 100_000, dueDate: "2024-02-28", payments: [], asAt: "2024-03-01" })).toMatchObject({ daysAccrued: 2 });
    // 366 days: 1000 x 0.10 x 366 / 365 = $100.27.
    expect(charge({ levyCents: 100_000, dueDate: "2024-01-01", payments: [], asAt: "2025-01-01" })).toMatchObject({ daysAccrued: 366, interestCents: 10_027 });
  });

  it("stops at write-off, and on the day a payment clears the levy", () => {
    expect(charge(input("2026-12-31", { stopAt: "2026-02-10" }))).toMatchObject({ daysAccrued: 10 });
    expect(charge(input("2026-12-31", { payments: [{ date: "2026-02-10", amountCents: 100_000 }] }))).toMatchObject({ daysAccrued: 10 });
  });

  it("charges on what is unpaid each day, the levy first", () => {
    // $500 paid on 11 February: 10 days on $1,000, then 20 on $500, at 10%: (1000 x 10 + 500 x 20) x 0.10 / 365 = $5.479..., so $5.48.
    expect(charge(input("2026-03-02", { payments: [{ date: "2026-02-10", amountCents: 50_000 }] }))).toMatchObject({ interestCents: 548, daysAccrued: 30 });
  });

  it("with a grace period recorded (fixture): nothing if paid in full within it, then from the due date", () => {
    const grace = fixture(ACT.LATE_CHARGE, { from: true, graceMonths: 1, daysInYear: 365 });
    expect(charge(input("2026-03-31", { payments: [{ date: "2026-02-28", amountCents: 100_000 }] }), grace)).toMatchObject({ reason: "PAID_IN_GRACE", graceEnds: "2026-02-28" });
    expect(charge(input("2026-02-28"), grace)).toMatchObject({ reason: "IN_GRACE" });
    expect(charge(input("2026-03-01"), grace)).toMatchObject({ reason: "ACCRUED", daysAccrued: 29 });
  });
});

describe("rounding", () => {
  const at = (levyCents: number, days: number, rate: number) =>
    lateCharge(
      { levyCents, dueDate: "2026-01-01", payments: [], asAt: new Date(Date.UTC(2026, 0, 1 + days)).toISOString().slice(0, 10) },
      ACT_FIX,
      { mode: "RESOLVED_ANNUAL_RATE", annualRatePercent: rate },
      { order: LEVY_FIRST },
    ).interestCents;

  it("rounds once, half up, to the cent, on the sum of the days", () => {
    // $18.25 for 1 day at 10% is exactly half a cent: 1 cent. $18.24 is just under: 0.
    expect(at(1_825, 1, 10)).toBe(1);
    expect(at(1_824, 1, 10)).toBe(0);
    // $1 for 30 days at 10%: each day is under a tenth of a cent, but the 30 days are 0.82 of a cent: 1.
    expect(at(100, 30, 10)).toBe(1);
  });

  it("works in whole numbers, so a rate with cents is exact", () => {
    // $1,234.57 for 45 days at 7.35%: 123457 x 45 x 735 / (10000 x 365) = 1118.73..., so $11.19.
    expect(at(123_457, 45, 7.35)).toBe(1_119);
    // $999,999.99 for 3,650 days at 20% is twice the levy, $1,999,999.98, with no overflow.
    expect(at(99_999_999, 3_650, 20)).toBe(199_999_998);
  });
});

describe("words", () => {
  it("the interest page explains a rule not confirmed, and offers the resolved rate only where it can be recorded", () => {
    const act = lateChargeWords(ACT as never, { mode: "STATUTORY" });
    expect(act.description).toBe("No interest is charged yet, because this building's rules do not yet confirm how it is worked out.");
    expect(act.options.map((o) => o.mode)).toEqual(["STATUTORY", "RESOLVED_ANNUAL_RATE"]);
    expect(act.options[1].label).toBe("Interest at a yearly rate set by special resolution, from 0% to 20% a year");
    expect(act.annualRate).toEqual({ min: 0, max: 20, maxInclusive: true, canRecord: true });
    const vic = lateChargeWords(VIC as never, { mode: "NONE" });
    expect(vic.annualRate?.canRecord).toBe(false);
    expect(vic.rateHelp).toBe("No rate can be recorded yet.");
    expect(lateChargeWords(WA as never, { mode: "STATUTORY" }).annualRate?.canRecord).toBe(false);
  });

  it("the waiver form is offered where the pack gives a waiver, and recordable only where who decides is known", () => {
    expect(lateChargeWaiverWords(NSW as never)).toBeNull();
    expect(lateChargeWaiverWords(QLD as never)).toBeNull();
    expect(lateChargeWaiverWords(ACT as never)).toBeNull();
    expect(lateChargeWaiverWords(VIC as never)).toMatchObject({ canRecord: false, reasonsRequired: true, kinds: [{ value: "WHOLE" }], meetingLabel: "General meeting", motionLabel: "Motion carried" });
    expect(lateChargeWaiverWords({ ...VIC, LATE_CHARGE: VIC_WAIVER_FIX } as never)).toMatchObject({ canRecord: true, kinds: [{ value: "WHOLE" }, { value: "AMOUNT" }, { value: "PERIOD" }] });
    expect(lateChargeWaiverWords(WA as never)).toMatchObject({ canRecord: false, kinds: [{ value: "WHOLE" }] });
  });

  it("a notice cannot state an annual-rate late charge yet (notice wording is stage 2, PR 6)", () => {
    expect(() => noticeLateCharge(ACT.LATE_CHARGE, { mode: "STATUTORY" })).toThrow(/cannot state/);
  });
});

function missingFor(rule: LateChargeRule, setting: { mode: string; annualRatePercent?: number }) {
  return annualLateChargeMissing(rule, setting, LEVY_FIRST);
}
