/**
 * The amounts a Victorian final fee notice states (stage 2, PR 9c): fees,
 * interest to date and the daily amount, with the VIC pack's LATE_CHARGE and
 * fixtures. No interest (NONE) gives 0 and 0; a value not confirmed, a
 * takeover notice or no rounding refuses; the daily amount is rounded once,
 * half up, to the cent. StrataVerze does not produce the notice yet (D3).
 */
import { describe, expect, it } from "vitest";
import { PENDING_RULE_PACKS, type StatutoryRules } from "@/config/statutory";
import { finalNoticeAmounts, type FinalNoticeAmountsInput, type FinalNoticeNotice } from "./final-notice-amounts";

const VIC = PENDING_RULE_PACKS.VIC;
const VIC_LATE_CHARGE = VIC.rules.LATE_CHARGE as StatutoryRules["LATE_CHARGE"];
const ROUNDING = VIC.rules.DEBT_RECOVERY.finalNotice.dailyInterestRounding;
const LABEL = `AU-VIC ${VIC.version}`;

/** VIC's late charge with every value checked (a fixture: the pack holds the cap, accrual and days in a year as not confirmed). */
const annual = VIC_LATE_CHARGE.annual!;
const CHECKED: StatutoryRules["LATE_CHARGE"] = {
  ...VIC_LATE_CHARGE,
  annual: {
    ...annual,
    resolvedRate: { ...annual.resolvedRate!, maxPercent: { value: 10, status: "CONFIRMED", source: "fixture" } },
    accrual: {
      ...annual.accrual,
      simple: { value: true, status: "CONFIRMED", source: "fixture" },
      daysInYear: { value: 365, status: "CONFIRMED", source: "fixture" },
    },
  },
};

const notice = (over: Partial<FinalNoticeNotice> = {}): FinalNoticeNotice => ({
  number: "F-1",
  levyCents: 100_000,
  dueDate: "2026-10-01",
  payments: [],
  rulePack: LABEL,
  takeover: false,
  ...over,
});
const input = (over: Partial<FinalNoticeAmountsInput> = {}): FinalNoticeAmountsInput => ({
  notices: [notice()],
  lateCharge: CHECKED,
  setting: { mode: "RESOLVED_ANNUAL_RATE", annualRatePercent: 10 },
  order: ["LEVY", "INTEREST", "RECOVERY_COSTS"],
  packCode: "AU-VIC",
  asAt: "2026-10-11",
  rounding: ROUNDING,
  ...over,
});

describe("finalNoticeAmounts", () => {
  it("with no interest (NONE, the VIC default) gives the fees and 0 to date and 0 a day", () => {
    const none = finalNoticeAmounts(input({ lateCharge: VIC_LATE_CHARGE, setting: { mode: "NONE" }, notices: [notice(), notice({ number: "F-2", levyCents: 50_000, payments: [{ date: "2026-10-05", amountCents: 20_000 }] })] }));
    expect(none).toEqual({ ok: true, feesCents: 130_000, interestToDateCents: 0, dailyCents: 0 });
    expect(VIC_LATE_CHARGE.defaultMode).toBe("NONE");
  });

  it("refuses a resolved rate while the VIC pack's accrual and cap are not confirmed, naming each", () => {
    const r = finalNoticeAmounts(input({ lateCharge: VIC_LATE_CHARGE, setting: { mode: "RESOLVED_ANNUAL_RATE", annualRatePercent: 5 } }));
    expect(r.ok).toBe(false);
    const problems = (r as { problems: string[] }).problems;
    for (const m of ["resolvedRate.maxPercent", "accrual.simple", "accrual.daysInYear"]) {
      expect(problems).toContain(`The late charge value ${m} is not confirmed, so the interest a final notice states cannot be worked out.`);
    }
  });

  it("refuses a missing accrual value even where the rest is checked", () => {
    const noDays = { ...CHECKED, annual: { ...CHECKED.annual!, accrual: { ...CHECKED.annual!.accrual, daysInYear: { value: null, status: "NOT_CONFIRMED" as const, source: "x", note: "not read" } } } };
    expect(finalNoticeAmounts(input({ lateCharge: noDays }))).toEqual({
      ok: false,
      problems: ["The late charge value accrual.daysInYear is not confirmed, so the interest a final notice states cannot be worked out."],
    });
  });

  it("refuses takeover notices and notices not issued under the building's pack", () => {
    const r = finalNoticeAmounts(
      input({
        notices: [notice(), notice({ number: "T-1", takeover: true, rulePack: null }), notice({ number: "N-1", rulePack: "AU-NSW 2026.10.16" }), notice({ number: "N-2", rulePack: null })],
      }),
    );
    expect(r).toEqual({
      ok: false,
      problems: [
        "Notice T-1 was brought across at takeover, so it does not count towards a final notice.",
        "Notice N-1 was not issued under this building's rules in StrataVerze, so it does not count towards a final notice.",
        "Notice N-2 was not issued under this building's rules in StrataVerze, so it does not count towards a final notice.",
      ],
    });
  });

  it("refuses with no notices, no rounding, or a day or amount that cannot be read", () => {
    expect(finalNoticeAmounts(input({ notices: [] }))).toEqual({ ok: false, problems: ["No notice of this lot is overdue."] });
    expect(finalNoticeAmounts(input({ rounding: { value: null, status: "NOT_CONFIRMED", source: "x", note: "Not read." } }))).toEqual({
      ok: false,
      problems: ["How the daily interest is rounded is not confirmed. Not read."],
    });
    expect(finalNoticeAmounts(input({ asAt: "2026-13-01" })).ok).toBe(false);
    expect(finalNoticeAmounts(input({ notices: [notice({ levyCents: 10.5 })] }))).toEqual({ ok: false, problems: ["Notice F-1 has an amount or payment that cannot be read."] });
  });

  it("works out the fees, the interest to date and the daily amount at a checked rate", () => {
    // $1,000 at 10% a year over 365 days: 10 days to 11 Oct is $2.74 (273.97 cents), and 27.397 cents a day, 27 cents.
    expect(finalNoticeAmounts(input())).toEqual({ ok: true, feesCents: 100_000, interestToDateCents: 274, dailyCents: 27 });
    // Interest at 0%: none.
    expect(finalNoticeAmounts(input({ setting: { mode: "RESOLVED_ANNUAL_RATE", annualRatePercent: 0 } }))).toEqual({ ok: true, feesCents: 100_000, interestToDateCents: 0, dailyCents: 0 });
  });

  it("rounds the daily amount once, half up, to the cent, over all the notices", () => {
    // 10% over 365 days is a cent a day for each 3,650 cents unpaid: 1,825 cents is half a cent, rounded up; 1,824 rounds down.
    expect(finalNoticeAmounts(input({ notices: [notice({ levyCents: 1_825 })] }))).toMatchObject({ ok: true, dailyCents: 1 });
    expect(finalNoticeAmounts(input({ notices: [notice({ levyCents: 1_824 })] }))).toMatchObject({ ok: true, dailyCents: 0 });
    // Rounded once over the total, not notice by notice (each alone would round to 0).
    expect(finalNoticeAmounts(input({ notices: [notice({ levyCents: 1_000 }), notice({ number: "F-2", levyCents: 1_000 })] }))).toMatchObject({ ok: true, dailyCents: 1 });
  });

  it("keeps the rate's full precision, rounding only the final cents (review L6)", () => {
    // A statutory rate of 7.125% (a fixture): $365,000 unpaid accrues exactly $71.25 a day. Rounding the rate to
    // hundredths of a percent first (7.13%) would give $71.30.
    const statutory: StatutoryRules["LATE_CHARGE"] = {
      ...CHECKED,
      modes: ["NONE", "STATUTORY"],
      annual: { ...CHECKED.annual!, statutoryRatePercent: { value: 7.125, status: "CONFIRMED", source: "fixture" } },
    };
    const r = finalNoticeAmounts(input({ lateCharge: statutory, setting: { mode: "STATUTORY" }, notices: [notice({ levyCents: 36_500_000 })] }));
    expect(r).toMatchObject({ ok: true, dailyCents: 7_125 });
    // A third of a percent, exactly: 3,650,000 cents at 1/3% a year is 33.33 cents a day, 33.
    const third = { ...statutory, annual: { ...statutory.annual!, statutoryRatePercent: { value: 1 / 3, status: "CONFIRMED" as const, source: "fixture" } } };
    expect(finalNoticeAmounts(input({ lateCharge: third, setting: { mode: "STATUTORY" }, notices: [notice({ levyCents: 3_650_000 })] }))).toMatchObject({ ok: true, dailyCents: 33 });
  });

  it("a period waiver covering the as-at day takes the notice out of the daily amount, one ending before does not, and one that cannot be read refuses (review L6)", () => {
    const period = (fromDate: string | null, toDate: string | null) => notice({ waivers: [{ kind: "PERIOD", fromDate, toDate }] });
    expect(finalNoticeAmounts(input({ notices: [period("2026-10-05", "2026-10-11")] }))).toMatchObject({ ok: true, dailyCents: 0 });
    expect(finalNoticeAmounts(input({ notices: [period("2026-10-11", "2026-10-20")] }))).toMatchObject({ ok: true, dailyCents: 0 });
    expect(finalNoticeAmounts(input({ notices: [period("2026-10-02", "2026-10-10")] }))).toMatchObject({ ok: true, dailyCents: 27 });
    for (const [from, to] of [[null, "2026-10-20"], ["2026-10-05", null], ["2026-10-20", "2026-10-05"]]) {
      expect(finalNoticeAmounts(input({ notices: [period(from, to)] }))).toEqual({ ok: false, problems: ["Notice F-1 has a waived period that cannot be read."] });
    }
  });

  it("applies payments to the fees first, and a notice whose interest is waived in whole adds no daily amount", () => {
    const paid = finalNoticeAmounts(input({ notices: [notice({ payments: [{ date: "2026-10-06", amountCents: 50_000 }] })] }));
    expect(paid).toMatchObject({ ok: true, feesCents: 50_000, dailyCents: 14 });
    const waived = finalNoticeAmounts(input({ notices: [notice({ waivers: [{ kind: "WHOLE" }] })] }));
    expect(waived).toEqual({ ok: true, feesCents: 100_000, interestToDateCents: 0, dailyCents: 0 });
  });
});
