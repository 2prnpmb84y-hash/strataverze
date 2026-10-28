/**
 * Dated rules (VIC, ACT and WA stage 2, PR 1, 28 Oct 2026). The reader is
 * tested with fixtures, not pack values; the pack tests at the end check the
 * VIC and ACT dated rules as recorded.
 */
import { describe, expect, it } from "vitest";
import { PENDING_RULE_PACKS, RULE_PACKS, type DatedRule, type DatedValue, type StatutoryRules } from "@/config/statutory";
import { datedRuleProblems, NoRuleInForceError, pendingLawCheck, pendingLawWarning, ruleInForceAt, ruleInForceOn, ruleOnDay } from "./dated-rules";

const inForce = (from: string, value: string): DatedValue<string> => ({ legalStatus: "IN_FORCE", from, value, source: "Fixture Act s 1", status: "CONFIRMED" });
const enacted = (value: string, dates: { commencedOn?: string | null; fixedStartDate?: string | null; latestStartDate?: string | null }): DatedValue<string> => ({
  legalStatus: "ENACTED_NOT_COMMENCED",
  value,
  commencedOn: dates.commencedOn ?? null,
  fixedStartDate: dates.fixedStartDate ?? null,
  latestStartDate: dates.latestStartDate ?? null,
  commencement: "on proclamation, or the latest start date",
  source: "Fixture Amendment Act s 2",
  status: "CONFIRMED",
});
const made = (value: string, fixedStartDate: string): DatedValue<string> => ({
  legalStatus: "MADE_NOT_COMMENCED",
  value,
  commencedOn: null,
  fixedStartDate,
  latestStartDate: fixedStartDate,
  commencement: "on the day it fixes",
  source: "Fixture Regulations reg 3",
  status: "CONFIRMED",
});
const bill = (value: string): DatedValue<string> => ({
  legalStatus: "NOT_LAW",
  value,
  presentedOn: "2026-09-17",
  commencement: "3 months after notification, if passed",
  source: "Fixture Bill cl 2",
  textStatus: "READ_IN_BILL_TEXT",
});
const rule = (...versions: DatedValue<string>[]): DatedRule<string> => ({ title: "Fixture rule", versions });

describe("ruleInForceOn", () => {
  const changing = rule(inForce("2026-01-01", "old"), inForce("2026-11-25", "new"));

  it("gives the old value before the change date, and the new one on and after it", () => {
    expect(ruleInForceOn(changing, "2026-11-24").value).toBe("old");
    expect(ruleInForceOn(changing, "2026-11-25").value).toBe("new");
    expect(ruleInForceOn(changing, "2026-11-26").value).toBe("new");
    expect(ruleInForceOn(changing, "2026-11-25")).toMatchObject({ appliesFrom: "2026-11-25", unconfirmed: [] });
    expect(ruleInForceOn(changing, "2026-01-01").value).toBe("old");
  });

  it("fails closed when no value covers the day", () => {
    expect(() => ruleInForceOn(changing, "2025-12-31")).toThrow(NoRuleInForceError);
    expect(ruleOnDay(changing, "2025-12-31")).toBeNull();
    expect(() => ruleInForceOn(rule(), "2026-11-25")).toThrow(NoRuleInForceError);
  });

  it("refuses a day that is not a calendar day", () => {
    expect(() => ruleInForceOn(changing, "2026-02-30")).toThrow(RangeError);
    expect(() => ruleInForceOn(changing, "25/11/2026")).toThrow(RangeError);
  });

  it("refuses two values that start on the same day", () => {
    expect(ruleOnDay(rule(inForce("2026-01-01", "a"), inForce("2026-01-01", "b")), "2026-06-01")).toBeNull();
  });

  describe("an enacted value with no commencement recorded", () => {
    const pending = rule(inForce("2026-01-01", "old"), enacted("new", { latestStartDate: "2027-12-01" }));

    it("never applies before its latest start date", () => {
      expect(ruleInForceOn(pending, "2027-11-30")).toMatchObject({ value: "old", unconfirmed: [] });
    });

    it("still never applies on or after its latest start date, and is listed as unconfirmed", () => {
      for (const day of ["2027-12-01", "2027-12-02", "2030-01-01"]) {
        const found = ruleInForceOn(pending, day);
        expect(found.value).toBe("old");
        expect(found.unconfirmed.map((v) => v.value)).toEqual(["new"]);
      }
    });

    it("gives nothing where there is no in-force value, even after its latest start date", () => {
      const only = rule(enacted("new", { latestStartDate: "2027-12-01" }));
      expect(() => ruleInForceOn(only, "2027-12-01")).toThrow(NoRuleInForceError);
      expect(() => ruleInForceOn(only, "2030-01-01")).toThrow(NoRuleInForceError);
    });

    it("applies from the day a pack version records it commenced, and not before", () => {
      const commenced = rule(inForce("2026-01-01", "old"), enacted("new", { commencedOn: "2027-03-01", latestStartDate: "2027-12-01" }));
      expect(ruleInForceOn(commenced, "2027-02-28").value).toBe("old");
      expect(ruleInForceOn(commenced, "2027-03-01")).toMatchObject({ value: "new", appliesFrom: "2027-03-01", unconfirmed: [] });
    });
  });

  it("does not apply a made value whose fixed start date has passed but is not recorded as commenced", () => {
    const fixed = rule(inForce("2021-12-01", "old fees"), made("new fees", "2026-11-25"));
    expect(ruleInForceOn(fixed, "2026-11-24")).toMatchObject({ value: "old fees", unconfirmed: [] });
    const after = ruleInForceOn(fixed, "2026-11-25");
    expect(after.value).toBe("old fees");
    expect(after.unconfirmed).toHaveLength(1);
    expect(ruleInForceOn(fixed, "2027-06-01").value).toBe("old fees");
  });

  it("never applies a Bill, even with a start day forced onto it", () => {
    const withBill = rule(inForce("2026-06-26", "1/2"), bill("1/4"));
    expect(ruleInForceOn(withBill, "2026-10-28").value).toBe("1/2");
    expect(ruleInForceOn(withBill, "2040-01-01")).toMatchObject({ value: "1/2", unconfirmed: [] });
    const forced = rule(inForce("2026-06-26", "1/2"), { ...bill("1/4"), commencedOn: "2026-11-01", from: "2026-11-01" } as unknown as DatedValue<string>);
    expect(ruleInForceOn(forced, "2027-01-01").value).toBe("1/2");
    expect(() => ruleInForceOn(rule(bill("1/4")), "2040-01-01")).toThrow(NoRuleInForceError);
  });

  it("never applies an announcement", () => {
    const announced: DatedValue<string> = { legalStatus: "ANNOUNCED_NO_LEGISLATION", value: "licensing", commencement: "no Bill yet", source: "Media release", status: "GUIDANCE" };
    expect(() => ruleInForceOn(rule(announced), "2040-01-01")).toThrow(NoRuleInForceError);
  });
});

describe("ruleInForceAt (the building's time zone)", () => {
  const changing = rule(inForce("2026-01-01", "old"), inForce("2026-11-25", "new"));
  // 12.30 am on 25 Nov 2026 in Melbourne and Sydney (UTC+11), 9.30 pm on 24 Nov in Perth (UTC+8), still 24 Nov in UTC.
  const instant = "2026-11-24T13:30:00Z";

  it("reads the day the instant falls on in the building's time zone, not in UTC", () => {
    expect(ruleInForceAt(changing, "Australia/Melbourne", instant).value).toBe("new");
    expect(ruleInForceAt(changing, "Australia/Sydney", instant).value).toBe("new");
    expect(ruleInForceAt(changing, "Australia/Perth", instant).value).toBe("old");
    expect(ruleInForceAt(changing, "UTC", instant).value).toBe("old");
  });

  it("switches at local midnight", () => {
    expect(ruleInForceAt(changing, "Australia/Melbourne", "2026-11-24T12:59:00Z").value).toBe("old");
    expect(ruleInForceAt(changing, "Australia/Melbourne", "2026-11-24T13:00:00Z").value).toBe("new");
  });
});

describe("pending law check", () => {
  const vic = PENDING_RULE_PACKS.VIC.rules;

  it("lists nothing for any pack today (28 Oct 2026)", () => {
    for (const p of [...Object.values(RULE_PACKS), ...Object.values(PENDING_RULE_PACKS)]) expect(pendingLawCheck(p.rules, "2026-10-28"), p.code).toEqual([]);
  });

  it("lists the VIC SR 53/2026 manager fees from 25 Nov 2026, while the fees in force stay the OCR ones", () => {
    expect(pendingLawCheck(vic, "2026-11-24")).toEqual([]);
    const due = pendingLawCheck(vic, "2026-11-25");
    expect(due).toEqual([
      {
        ruleKey: "MANAGER_REGISTRATION_FEE_UNITS",
        title: vic.DATED_RULES.MANAGER_REGISTRATION_FEE_UNITS.title,
        legalStatus: "MADE_NOT_COMMENCED",
        dueOn: "2026-11-25",
        dueBy: "FIXED_START_DATE",
        commencement: "25 Nov 2026 (SR 53/2026 reg 3); new reg 20(2) applies from 30 Jun 2027",
        source: expect.stringContaining("SR 53/2026"),
        pendingChange: "SR_53_2026_MANAGER_FEES",
      },
    ]);
    const warning = pendingLawWarning(due[0], "Victoria");
    expect(warning).toContain("25 Nov 2026");
    expect(warning).toContain("Government Gazette");
    expect(warning).toContain("still applies the earlier rule");

    const fees = ruleInForceOn(vic.DATED_RULES.MANAGER_REGISTRATION_FEE_UNITS, "2026-11-25");
    expect(fees.value).toEqual({ application: 14.26, annual: 10.01, lateLodgement: 1 });
    expect(fees.unconfirmed.map((v) => v.value)).toEqual([{ application: 29.12, annual: 22.05, lateLodgement: 1.35 }]);
  });

  it("lists each VIC change by its latest start date once that has passed", () => {
    expect(pendingLawCheck(vic, "2027-06-30").map((d) => [d.ruleKey, d.dueOn, d.dueBy])).toEqual([
      ["MANAGER_REGISTRATION_FEE_UNITS", "2026-11-25", "FIXED_START_DATE"],
      ["SALE_OF_LAND", "2027-06-01", "LATEST_START_DATE"],
      ["MANAGER_EDUCATION", "2027-06-30", "LATEST_START_DATE"],
    ]);
    const claa = pendingLawCheck(vic, "2027-12-01").filter((d) => d.dueOn === "2027-12-01");
    expect(claa.map((d) => d.ruleKey).sort()).toEqual(["ARREARS_CARVE_OUTS", "INTEREST_PAUSE", "OTHER_DIV2", "PAYMENT_ALLOCATION_ORDER", "PAYMENT_PLANS", "PRIVACY", "PROXY_LIMIT"]);
    expect(claa.every((d) => d.legalStatus === "ENACTED_NOT_COMMENCED" && d.dueBy === "LATEST_START_DATE")).toBe(true);
  });

  it("never lists a Bill or an announcement", () => {
    expect(pendingLawCheck(PENDING_RULE_PACKS.ACT.rules, "2040-01-01")).toEqual([]);
    expect(pendingLawCheck(vic, "2040-01-01").map((d) => d.ruleKey)).not.toContain("MANAGER_LICENSING");
  });

  it("lists nothing for a pack without dated rules", () => {
    expect(pendingLawCheck({}, "2040-01-01")).toEqual([]);
  });
});

describe("dated rules in the packs", () => {
  const vic = PENDING_RULE_PACKS.VIC.rules;
  const act = PENDING_RULE_PACKS.ACT.rules;

  it("are recorded without problems in every pack that has them", () => {
    for (const p of [...Object.values(RULE_PACKS), ...Object.values(PENDING_RULE_PACKS)]) {
      const rules = p.rules as { DATED_RULES?: Record<string, DatedRule<unknown>> };
      for (const [key, r] of Object.entries(rules.DATED_RULES ?? {})) expect(datedRuleProblems(key, r), `${p.code} ${key}`).toEqual([]);
    }
  });

  it("are not given to NSW or Queensland", () => {
    expect((RULE_PACKS.NSW.rules as StatutoryRules).DATED_RULES).toBeUndefined();
    expect((PENDING_RULE_PACKS.QLD.rules as unknown as StatutoryRules).DATED_RULES).toBeUndefined();
  });

  it("restate every VIC pending change unchanged, none recorded as commenced", () => {
    const versions = Object.values(vic.DATED_RULES).flatMap((r) => r.versions as readonly DatedValue<unknown>[]);
    for (const change of vic.PENDING_CHANGES) {
      const restated = versions.filter((v) => v.pendingChange === change.key);
      expect(restated.length, change.key).toBeGreaterThan(0);
      for (const v of restated) {
        expect(v.legalStatus).toBe(change.legalStatus);
        expect(v).toMatchObject({ commencement: change.commencement, status: change.status });
        if (v.legalStatus !== "ANNOUNCED_NO_LEGISLATION" && v.legalStatus !== "IN_FORCE" && v.legalStatus !== "NOT_LAW") {
          expect(v.commencedOn).toBeNull();
          expect(v.fixedStartDate).toBe(change.fixedStartDate);
          expect(v.latestStartDate).toBe(change.latestStartDate);
        }
      }
    }
  });

  it("keep the VIC in-force values on until a commencement is recorded", () => {
    expect(ruleInForceOn(vic.DATED_RULES.PROXY_LIMIT, "2026-10-28").value).toBe(vic.PROXIES.limit);
    expect(ruleInForceOn(vic.DATED_RULES.PROXY_LIMIT, "2028-01-01").value).toBe(vic.PROXIES.limit);
    expect(() => ruleInForceOn(vic.DATED_RULES.PROXY_LIMIT, "2026-09-08")).toThrow(NoRuleInForceError);
    // No order in force is recorded, so none is given, before or after s 32I's latest start date.
    expect(() => ruleInForceOn(vic.DATED_RULES.PAYMENT_ALLOCATION_ORDER, "2026-10-28")).toThrow(NoRuleInForceError);
    expect(() => ruleInForceOn(vic.DATED_RULES.PAYMENT_ALLOCATION_ORDER, "2028-01-01")).toThrow(NoRuleInForceError);
    expect(vic.DATED_RULES.PAYMENT_ALLOCATION_ORDER.versions[0].value).toEqual(["LEVY", "INTEREST", "RECOVERY_COSTS"]);
  });

  it("keep the ACT quorum at the in-force values, the Bill never applied", () => {
    expect(act.PENDING_REFORMS[0].legalStatus).toBe("NOT_LAW");
    for (const day of ["2026-10-28", "2040-01-01"]) {
      expect(ruleInForceOn(act.DATED_RULES.QUORUM_FRACTION_OF_UNITS, day).value).toEqual({ fractionOfUnits: 1 / 2, retirementVillageFractionOfUnits: 1 / 3 });
      expect(ruleInForceOn(act.DATED_RULES.ABSENTEE_VOTES_COUNT_TOWARDS_QUORUM, day).value).toBe(false);
    }
    expect(act.DATED_RULES.QUORUM_FRACTION_OF_UNITS.versions[1]).toMatchObject({ legalStatus: "NOT_LAW", textStatus: "READ_IN_BILL_TEXT", value: { fractionOfUnits: 1 / 4, retirementVillageFractionOfUnits: 1 / 4 } });
    expect(act.DATED_RULES.QUORUM_FRACTION_OF_UNITS.versions[1]).not.toHaveProperty("status");
    expect(() => ruleInForceOn(act.DATED_RULES.QUORUM_FRACTION_OF_UNITS, "2026-06-25")).toThrow(NoRuleInForceError);
  });
});
