/**
 * Fund conditions (VIC, ACT and WA stage 2, PR 3): which funds a building
 * must have, worked out from its pack's `requiredWhen` and its building
 * selectors, failing closed where a fact is missing. Each condition is tested
 * at its boundaries with the draft packs' own values.
 */
import { describe, expect, it } from "vitest";
import { PENDING_RULE_PACKS, QLD_RULE_PACK, statutoryRulesFor } from "@/config/statutory";
import type { SelectorBuilding } from "./building-selectors";
import { buildingSelectorProblems } from "./building-selectors";
import { buildingDataProblems } from "./building-data";
import { defaultFunds, fundProblems, fundRequirement, fundRequirementsView, hasFundConditions, noLedgerProblem, requiredFunds, type FundNeed } from "./funds";

const NSW = statutoryRulesFor("NSW");
const QLD = QLD_RULE_PACK.rules as unknown as typeof NSW;
const ACT = PENDING_RULE_PACKS.ACT.rules as unknown as typeof NSW;
const VIC = PENDING_RULE_PACKS.VIC.rules as unknown as typeof NSW;
const WA = PENDING_RULE_PACKS.WA.rules as unknown as typeof NSW;

const lots = (n: number, occupiable: boolean | null = true) =>
  Array.from({ length: n }, (_, i) => ({ id: `l${i + 1}`, lotNumber: String(i + 1), lotType: "RESIDENTIAL", occupiable, entitlement: 10 }));
const building = (n: number, scheme: Partial<SelectorBuilding["scheme"]> = {}, recorded: Record<string, string> = {}, occupiable: boolean | null = true): SelectorBuilding => ({
  scheme: { totalLots: n, ...scheme },
  lots: lots(n, occupiable),
  recorded,
});
const need = (rules: typeof NSW, key: string, b: SelectorBuilding): FundNeed | null => {
  const fund = rules.FUND_CATALOGUE.find((f) => f.key === key);
  if (!fund) throw new Error(`no ${key}`);
  return fundRequirement(rules, fund, b).need;
};
const names = (rules: typeof NSW, b: SelectorBuilding) => defaultFunds(rules, b).map((f) => f.name);

describe("ACT sinking fund: required from 4 units", () => {
  it("is not required with 3 units and required with 4", () => {
    expect(need(ACT, "SINKING", building(3))).toBe("OPTIONAL");
    expect(need(ACT, "SINKING", building(4))).toBe("REQUIRED");
    expect(names(ACT, building(3))).toEqual(["Administrative Fund"]);
    expect(names(ACT, building(4))).toEqual(["Administrative Fund", "Sinking Fund"]);
  });

  it("gives the pack's words and provision for why", () => {
    const r = fundRequirement(ACT, ACT.FUND_CATALOGUE[1], building(4));
    expect(r.reason).toBe("Required with 4 or more units, with a sinking fund plan.");
    expect(r.provision).toBe("Unit Titles (Management) Act 2011 (ACT) ss 81(1), 82(1)");
    expect(fundRequirement(ACT, ACT.FUND_CATALOGUE[1], building(3)).reason).toBe("Not required with fewer than 4 units.");
  });

  it("fails closed when the number of units is not known, and never gives the fund", () => {
    const noLots: SelectorBuilding = { scheme: { totalLots: 4 }, lots: [], recorded: {} };
    const r = fundRequirement(ACT, ACT.FUND_CATALOGUE[1], noLots);
    expect(r.need).toBeNull();
    expect(r.missing).toEqual(["LOT_COUNT"]);
    expect(r.problem).toBe("Whether this building must have a sinking fund cannot be worked out because no units are recorded. Record what is missing in the building rules.");
    const mismatch = { ...building(4), scheme: { totalLots: 5 } };
    expect(fundRequirement(ACT, ACT.FUND_CATALOGUE[1], mismatch).problem).toContain("because 4 units are recorded but the building's total is 5.");
    expect(requiredFunds(ACT, noLots).undecided.map((u) => u.fund.key)).toEqual(["SINKING"]);
    expect(names(ACT, noLots)).toEqual(["Administrative Fund"]);
    // Without a building every fact is missing.
    expect(names(ACT, undefined as unknown as SelectorBuilding)).toEqual(["Administrative Fund"]);
    expect(defaultFunds(ACT).map((f) => f.name)).toEqual(["Administrative Fund"]);
  });
});

describe("VIC maintenance fund: tiers 1 and 2, or an approved plan", () => {
  const vic = (occupiableLots: number, recorded: Record<string, string> = {}, servicesOnly: boolean | null = false) =>
    building(occupiableLots, { servicesOnly }, { severalOwnersCorporations: "NO", ...recorded });

  it("is required at tier 2 (51 occupiable lots) whatever the plan answer, and not worked out at tier 3 (50) without one", () => {
    expect(need(VIC, "MAINTENANCE", vic(51))).toBe("REQUIRED");
    expect(need(VIC, "MAINTENANCE", vic(101))).toBe("REQUIRED");
    expect(fundRequirement(VIC, VIC.FUND_CATALOGUE[1], vic(51)).status).toBe("STRATAVERZE");
    const tier3 = fundRequirement(VIC, VIC.FUND_CATALOGUE[1], vic(50));
    expect(tier3.need).toBeNull();
    expect(tier3.missing).toEqual(["selector:maintenancePlanApproved"]);
    expect(tier3.problem).toBe("Whether this building must have a maintenance fund cannot be worked out because no answer is recorded for maintenance plan approved. Record what is missing in the building rules.");
    expect(names(VIC, vic(51))).toEqual(["Administrative Fund", "Maintenance Fund"]);
    expect(names(VIC, vic(50))).toEqual(["Administrative Fund"]);
  });

  it("at tiers 3 and 4 is required with an approved plan and not otherwise", () => {
    expect(need(VIC, "MAINTENANCE", vic(50, { maintenancePlanApproved: "YES" }))).toBe("REQUIRED");
    expect(need(VIC, "MAINTENANCE", vic(50, { maintenancePlanApproved: "NO" }))).toBe("OPTIONAL");
    expect(need(VIC, "MAINTENANCE", vic(9, { maintenancePlanApproved: "YES" }))).toBe("REQUIRED");
    expect(need(VIC, "MAINTENANCE", vic(3, { maintenancePlanApproved: "NO" }))).toBe("OPTIONAL");
    expect(names(VIC, vic(9, { maintenancePlanApproved: "YES" }))).toEqual(["Administrative Fund", "Maintenance Fund"]);
    expect(fundRequirement(VIC, VIC.FUND_CATALOGUE[1], vic(9, { maintenancePlanApproved: "YES" })).reason).toBe("Required because the owners corporation has approved a maintenance plan.");
  });

  it("is not required at tier 5, even with an approved plan", () => {
    expect(need(VIC, "MAINTENANCE", vic(2, { maintenancePlanApproved: "YES" }))).toBe("OPTIONAL");
    expect(need(VIC, "MAINTENANCE", vic(40, { maintenancePlanApproved: "YES" }, true))).toBe("OPTIONAL");
  });

  it("fails closed while the tier cannot be worked out, naming the facts to record", () => {
    const noServices = fundRequirement(VIC, VIC.FUND_CATALOGUE[1], vic(60, { maintenancePlanApproved: "YES" }, null));
    expect(noServices.need).toBeNull();
    expect(noServices.missing).toEqual(["SERVICES_ONLY"]);
    expect(noServices.problem).toContain("because no answer is recorded for services only owners corporation.");
    const unanswered = fundRequirement(VIC, VIC.FUND_CATALOGUE[1], building(60, { servicesOnly: false }, { severalOwnersCorporations: "NO" }, null));
    expect(unanswered.need).toBeNull();
    expect(unanswered.problem).toContain("60 lots have no answer for occupiable lot");
    const notRecorded = fundRequirement(VIC, VIC.FUND_CATALOGUE[1], building(60, { servicesOnly: false }));
    expect(notRecorded.missing).toEqual(["selector:severalOwnersCorporations"]);
    // Refused (one of several owners corporations): the tier cannot be worked out.
    const several = fundRequirement(VIC, VIC.FUND_CATALOGUE[1], vic(60, { severalOwnersCorporations: "YES" }));
    expect(several.need).toBeNull();
    expect(several.problem).toContain("because the tier cannot be worked out.");
  });

  it("requires the administrative fund as a StrataVerze ledger choice, for every building", () => {
    expect(need(VIC, "ADMINISTRATIVE", vic(60))).toBe("REQUIRED");
    expect(need(VIC, "ADMINISTRATIVE", { scheme: {}, lots: [], recorded: {} })).toBe("REQUIRED");
    expect(fundRequirement(VIC, VIC.FUND_CATALOGUE[0], vic(60))).toMatchObject({ conditional: false, status: "STRATAVERZE" });
  });

  it("says in the notice when a required fund rests on a StrataVerze reading, so it never reads as law", () => {
    expect(fundProblems(VIC, vic(51), [{ fundType: "ADMINISTRATIVE" }])).toEqual([
      "This building must have a maintenance fund but none is set up. Required for a tier 1 or tier 2 owners corporation, which must prepare and approve a maintenance plan. A StrataVerze choice. Add it under Manage Funds.",
    ]);
    expect(fundProblems(VIC, vic(51), [{ fundType: "CAPITAL_WORKS" }])).toEqual([
      "This building must have an administrative fund but none is set up. A StrataVerze choice. Add it under Manage Funds.",
    ]);
  });

  it("flags the plan answer only where the fund depends on it", () => {
    expect(buildingSelectorProblems(VIC, vic(50)).join(" ")).not.toContain("aintenance plan");
    expect(fundProblems(VIC, vic(50))).toEqual([expect.stringContaining("no answer is recorded for maintenance plan approved")]);
    expect(fundProblems(VIC, vic(51))).toEqual([]);
  });
});

describe("WA administrative fund: by size class, with the by-laws (s 140)", () => {
  const wa = (n: number, byLaws?: string) => building(n, {}, byLaws ? { administrativeFundByLaws: byLaws } : {});
  const ANSWERS = ["NEITHER", "REQUIRE", "EXEMPT", "SAT_REQUIRED"] as const;

  it("is required for 6 or more lots, whatever the by-laws say or if nothing is recorded", () => {
    expect(need(WA, "ADMINISTRATIVE", wa(6))).toBe("REQUIRED");
    expect(ANSWERS.map((a) => need(WA, "ADMINISTRATIVE", wa(6, a)))).toEqual(["REQUIRED", "REQUIRED", "REQUIRED", "REQUIRED"]);
  });

  it("for 3 to 5 lots is required unless the by-laws exempt the company", () => {
    for (const n of [3, 5]) expect(ANSWERS.map((a) => need(WA, "ADMINISTRATIVE", wa(n, a)))).toEqual(["REQUIRED", "REQUIRED", "OPTIONAL", "REQUIRED"]);
  });

  it("for 2 lots is not allowed unless the by-laws require it or SAT has (an SAT order there not confirmed)", () => {
    expect(ANSWERS.map((a) => need(WA, "ADMINISTRATIVE", wa(2, a)))).toEqual(["NOT_ALLOWED", "REQUIRED", "NOT_ALLOWED", "REQUIRED"]);
    expect(fundRequirement(WA, WA.FUND_CATALOGUE[0], wa(2, "SAT_REQUIRED")).status).toBe("NOT_CONFIRMED");
    expect(fundRequirement(WA, WA.FUND_CATALOGUE[0], wa(3, "SAT_REQUIRED")).status).toBe("CONFIRMED");
    expect(fundRequirementsView(WA, wa(2, "SAT_REQUIRED"))?.[0]).toMatchObject({ needLabel: "Required", statusNote: "Not confirmed" });
    expect(requiredFunds(WA, wa(2, "NEITHER")).notAllowed.map((f) => f.key)).toEqual(["ADMINISTRATIVE"]);
  });

  it("fails closed for 2 to 5 lots with no by-laws answer, and when the size is not known", () => {
    for (const n of [2, 3, 5]) {
      const r = fundRequirement(WA, WA.FUND_CATALOGUE[0], wa(n));
      expect(r.need).toBeNull();
      expect(r.missing).toEqual(["selector:administrativeFundByLaws"]);
      expect(r.problem).toBe("Whether this building must have an administrative fund cannot be worked out because no answer is recorded for administrative fund by-laws. Record what is missing in the building rules.");
    }
    const one = fundRequirement(WA, WA.FUND_CATALOGUE[0], wa(1, "NEITHER"));
    expect(one.need).toBeNull();
    expect(one.problem).toContain("because the scheme size cannot be worked out.");
    expect(fundRequirement(WA, WA.FUND_CATALOGUE[0], { scheme: { totalLots: 3 }, lots: [], recorded: {} }).missing).toEqual(["LOT_COUNT"]);
  });

  it("does not flag the by-laws answer for 6 or more lots", () => {
    const problems = buildingSelectorProblems(WA, building(12, { replacementCost: "100.00" }, { schemeType: "STRATA", tenure: "FREEHOLD" }));
    expect(problems).toEqual([]);
    expect(fundProblems(WA, building(12, {}, { schemeType: "STRATA", tenure: "FREEHOLD" }))).toEqual([]);
  });
});

describe("WA reserve fund: when designated", () => {
  const wa = (n: number, replacementCost: string | null, schemeType: string | null = "STRATA") => building(n, { replacementCost }, schemeType ? { schemeType } : {});

  it("is required at 10 or more lots, and below 10 only with a replacement cost of more than $5,000,000", () => {
    expect(need(WA, "RESERVE", wa(10, null, null))).toBe("REQUIRED");
    expect(need(WA, "RESERVE", wa(9, "5000000.00"))).toBe("OPTIONAL");
    expect(need(WA, "RESERVE", wa(9, "5000000.01"))).toBe("REQUIRED");
    expect(fundRequirement(WA, WA.FUND_CATALOGUE[1], wa(10, null)).reason).toBe("Required for a designated strata company: 10 or more lots, or a replacement cost of more than $5,000,000.");
  });

  it("fails closed below 10 lots without the replacement cost or the scheme type", () => {
    const noCost = fundRequirement(WA, WA.FUND_CATALOGUE[1], wa(9, null));
    expect(noCost.need).toBeNull();
    expect(noCost.missing).toEqual(["REPLACEMENT_COST_CENTS"]);
    expect(noCost.problem).toContain("because no replacement cost is recorded.");
    const noType = fundRequirement(WA, WA.FUND_CATALOGUE[1], wa(9, "100.00", null));
    expect(noType.missing).toEqual(["selector:schemeType"]);
    expect(noType.problem).toContain("because no answer is recorded for scheme type.");
  });

  it("gives a building every fund the law requires and none it may not have", () => {
    expect(names(WA, building(12, {}, {}))).toEqual(["Administrative Fund", "Reserve Fund"]);
    expect(names(WA, wa(6, "100.00"))).toEqual(["Administrative Fund"]);
    expect(names(WA, building(2, { replacementCost: "100.00" }, { schemeType: "STRATA", administrativeFundByLaws: "NEITHER" }))).toEqual([]);
    expect(names(WA, wa(2, null))).toEqual([]);
  });
});

describe("fund problems for Building data missing", () => {
  it("flag a required fund the building lacks, by ledger fund, legacy types included", () => {
    expect(fundProblems(ACT, building(4), [{ fundType: "ADMINISTRATIVE" }])).toEqual([
      "This building must have a sinking fund but none is set up. Required with 4 or more units, with a sinking fund plan. Add it under Manage Funds.",
    ]);
    expect(fundProblems(ACT, building(4), [{ fundType: "ADMIN" }, { fundType: "SINKING" }])).toEqual([]);
    expect(fundProblems(ACT, building(3), [{ fundType: "ADMINISTRATIVE" }])).toEqual([]);
  });

  it("flag a fund the building may not have", () => {
    const twoLot = building(2, { replacementCost: "100.00" }, { schemeType: "STRATA", administrativeFundByLaws: "NEITHER" });
    expect(fundProblems(WA, twoLot, [{ fundType: "ADMINISTRATIVE" }])).toEqual([
      "This building has an administrative fund, which it may not have. A 2-lot scheme cannot have an administrative fund unless its by-laws require one.",
    ]);
  });

  it("are in the notice, after the selector problems, only for a pack with fund conditions", () => {
    const b = { totalLots: 4, regulationModule: null, planFormat: null };
    const problems = buildingDataProblems(ACT, b, lots(4), { schemeType: "UNITS_PLAN", retirementVillagePlan: "NO", mixedUsePlan: "NO", classBOnlyPlan: "NO" }, []);
    expect(problems).toEqual([
      "This building must have an administrative fund but none is set up. Add it under Manage Funds.",
      "This building must have a sinking fund but none is set up. Required with 4 or more units, with a sinking fund plan. Add it under Manage Funds.",
      "This building has no administrative fund and no sinking fund, so StrataVerze cannot keep its ledger.",
    ]);
  });

  it("refuse at onboarding a building that would be given no fund, in plain words", () => {
    expect(noLedgerProblem(WA, building(3))).toBe("StrataVerze cannot set up this building yet. None of its funds can be worked out from the lots entered, so it would have no ledger.");
    expect(noLedgerProblem(WA, building(2, { replacementCost: "100.00" }, { schemeType: "STRATA", administrativeFundByLaws: "NEITHER" }))).toBe(
      "StrataVerze cannot set up this building yet. Its rules require none of its funds, so it would have no ledger.",
    );
    expect(noLedgerProblem(WA, building(6))).toBeNull();
    expect(noLedgerProblem(ACT, building(3))).toBeNull();
    expect(noLedgerProblem(VIC, building(0))).toBeNull();
    expect([NSW, QLD].map((r) => noLedgerProblem(r, building(0)))).toEqual([null, null]);
  });
});

describe("NSW and Queensland have no fund conditions", () => {
  it.each([
    ["NSW", NSW],
    ["QLD", QLD],
  ] as const)("%s: required only, no view, no problems", (_code, rules) => {
    expect(hasFundConditions(rules)).toBe(false);
    expect(fundRequirementsView(rules, building(4))).toBeNull();
    expect(fundProblems(rules, building(4), [])).toEqual([]);
    expect(requiredFunds(rules, building(0)).each.map((r) => [r.need, r.conditional, r.problem])).toEqual([
      ["REQUIRED", false, null],
      ["REQUIRED", false, null],
    ]);
  });

  it("while every draft pack with a condition has one", () => {
    expect([ACT, VIC, WA].map(hasFundConditions)).toEqual([true, true, true]);
  });
});

describe("the fund screens' view", () => {
  it("names each fund, what the law says and why, and what to record", () => {
    expect(fundRequirementsView(WA, building(3, {}, { schemeType: "STRATA" }))).toEqual([
      {
        key: "ADMINISTRATIVE",
        label: "Administrative Fund",
        need: "UNDECIDED",
        needLabel: "Not worked out yet",
        reason: null,
        provision: "Strata Titles Act 1985 (WA) ss 100(1)(a), 140",
        statusNote: null,
        problem: "Whether this building must have an administrative fund cannot be worked out because no answer is recorded for administrative fund by-laws. Record what is missing in the building rules.",
      },
      {
        key: "RESERVE",
        label: "Reserve Fund",
        need: "UNDECIDED",
        needLabel: "Not worked out yet",
        reason: null,
        provision: "Strata Titles Act 1985 (WA) s 100(2), (7); Strata Titles (General) Regulations 2019 (WA) reg 79",
        statusNote: null,
        problem: "Whether this building must have a reserve fund cannot be worked out because no replacement cost is recorded. Record what is missing in the building rules.",
      },
    ]);
    const vic = fundRequirementsView(VIC, building(60, { servicesOnly: false }, { severalOwnersCorporations: "NO" }));
    expect(vic?.map((r) => [r.label, r.needLabel, r.statusNote])).toEqual([
      ["Administrative Fund", "Required", "A StrataVerze choice"],
      ["Maintenance Fund", "Required", "A StrataVerze choice"],
    ]);
  });
});
