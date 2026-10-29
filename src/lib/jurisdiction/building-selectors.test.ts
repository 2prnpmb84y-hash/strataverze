/**
 * Building selectors in one shape (VIC, ACT and WA stage 2, PR 2): each
 * derived selector at its boundaries, from the pack's own rules; missing
 * facts failing closed; recorded values checked against the pack; and NSW
 * and Queensland, which have no building selectors, unchanged.
 */
import { describe, expect, it } from "vitest";
import { PENDING_RULE_PACKS, QLD_RULE_PACK, statutoryRulesFor, type StatutoryRules } from "@/config/statutory";
import type { DerivedBuildingSelector } from "@/config/statutory";
import {
  buildingFacts,
  buildingRulesView,
  buildingSelectorProblems,
  conditionHolds,
  deriveSelector,
  dollarsToCents,
  factsRead,
  knownRecorded,
  missingWords,
  parseDollars,
  readBuildingRulesForm,
  selectorValue,
  selectorValueProblem,
  type BuildingFactRecords,
  type RecordedValues,
} from "./building-selectors";
import { buildingDataProblems } from "./building-data";

const VIC = PENDING_RULE_PACKS.VIC.rules as unknown as StatutoryRules;
const WA = PENDING_RULE_PACKS.WA.rules as unknown as StatutoryRules;
const ACT = PENDING_RULE_PACKS.ACT.rules as unknown as StatutoryRules;
const QLD = QLD_RULE_PACK.rules as unknown as StatutoryRules;
const NSW = statutoryRulesFor("NSW");

const derived = (rules: StatutoryRules, key: string) => rules.BUILDING_SELECTORS!.find((s) => s.key === key) as DerivedBuildingSelector;

/** A building with `occupiable` occupiable lots and `non` lots that are not. */
function vicBuilding(occupiable: number, non: number, servicesOnly: boolean | null, extra: Partial<BuildingFactRecords["scheme"]> = {}): BuildingFactRecords {
  const lots = [
    ...Array.from({ length: occupiable }, (_, i) => ({ lotNumber: String(i + 1), lotType: "RESIDENTIAL", occupiable: true })),
    ...Array.from({ length: non }, (_, i) => ({ lotNumber: String(occupiable + i + 1), lotType: "PARKING", occupiable: false })),
  ];
  return { scheme: { totalLots: lots.length, servicesOnly, ...extra }, lots };
}
const ONLY_OC: RecordedValues = { severalOwnersCorporations: "NO" };
const tier = (b: BuildingFactRecords, recorded: RecordedValues = ONLY_OC) => deriveSelector(derived(VIC, "tier"), buildingFacts(b, VIC).values, recorded);
const tierValue = (b: BuildingFactRecords) => {
  const r = tier(b);
  return r.ok ? r.value : r.kind;
};

describe("VIC tier (OCA s 7), from occupiable lots and services only", () => {
  it.each([
    [101, "TIER_1"],
    [100, "TIER_2"],
    [51, "TIER_2"],
    [50, "TIER_3"],
    [10, "TIER_3"],
    [9, "TIER_4"],
    [3, "TIER_4"],
    [2, "TIER_5"],
  ])("%i occupiable lots, not services only: %s", (n, expected) => {
    expect(tierValue(vicBuilding(n, 0, false))).toBe(expected);
  });

  it("is tier 5 for a services only owners corporation whatever its lots, s 7(7) and (8) included", () => {
    expect(tierValue(vicBuilding(101, 0, true))).toBe("TIER_5");
    expect(tierValue(vicBuilding(10, 4, true))).toBe("TIER_5");
    // s 7(7): fewer than 10 occupiable lots and more than 50 that are not.
    expect(tierValue(vicBuilding(5, 60, true))).toBe("TIER_5");
    // s 7(8): only lots that are not occupiable.
    expect(tierValue(vicBuilding(0, 5, true))).toBe("TIER_5");
  });

  it("is tier 5 for a 2-lot subdivision of 2 occupiable lots and no other, and refuses 2 occupiable lots with other lots until decided", () => {
    expect(tierValue(vicBuilding(2, 0, false))).toBe("TIER_5");
    expect(tier(vicBuilding(2, 5, false))).toMatchObject({ ok: false, kind: "REFUSED", message: expect.stringContaining("Whether it is then a 2-lot subdivision is for StrataVerze to decide") });
    // 2 shops and 51 car parks: s 7(7) applies, refused, never tier 5.
    expect(tier(vicBuilding(2, 51, false))).toMatchObject({ ok: false, kind: "REFUSED", provision: expect.stringContaining("s 7(7)") });
    expect(tier(vicBuilding(2, 40, false))).toMatchObject({ ok: false, kind: "REFUSED" });
  });

  it("refuses an owners corporation that is one of several on its plan, and fails closed until that is answered", () => {
    expect(tier(vicBuilding(50, 0, false), { severalOwnersCorporations: "YES" })).toMatchObject({ ok: false, kind: "REFUSED", message: expect.stringContaining("one of several on its plan") });
    expect(tier(vicBuilding(50, 0, true), { severalOwnersCorporations: "YES" })).toMatchObject({ ok: false, kind: "REFUSED" });
    expect(tier(vicBuilding(50, 0, false), {})).toEqual({ ok: false, kind: "MISSING", missing: ["selector:severalOwnersCorporations"] });
  });

  it("flags a parking or storage lot answered occupiable, and works nothing out from it", () => {
    const b = vicBuilding(10, 0, false);
    b.lots = [...b.lots, { lotNumber: "11", lotType: "PARKING", occupiable: true }];
    b.scheme.totalLots = 11;
    expect(tier(b)).toEqual({ ok: false, kind: "MISSING", missing: ["OCCUPIABLE_LOT_COUNT", "NON_OCCUPIABLE_LOT_COUNT"] });
    expect(buildingSelectorProblems(VIC, { ...b, recorded: { ownersCorporationType: "UNLIMITED", ...ONLY_OC } })).toEqual([
      "The tier cannot be worked out because lot 11 is a parking lot but is answered yes for occupiable lot. Record what is missing in the building rules.",
    ]);
    // Answered not occupiable, it counts as not occupiable.
    b.lots[10].occupiable = false;
    expect(tierValue(b)).toBe("TIER_3");
  });

  it("counts lots that are not occupiable out of tiers 1 to 4", () => {
    expect(tierValue(vicBuilding(9, 40, false))).toBe("TIER_4");
    expect(tierValue(vicBuilding(50, 60, false))).toBe("TIER_3");
  });

  it("refuses where s 7(7) or s 7(8) applies, with the pack's reason", () => {
    // s 7(7): fewer than 10 occupiable lots and more than 50 that are not.
    const mostly = tier(vicBuilding(9, 51, false));
    expect(mostly).toMatchObject({ ok: false, kind: "REFUSED", provision: expect.stringContaining("s 7(7)") });
    // 50 lots not occupiable is not more than 50: tier 4.
    expect(tierValue(vicBuilding(9, 50, false))).toBe("TIER_4");
    // 10 occupiable lots is not fewer than 10: tier 3.
    expect(tierValue(vicBuilding(10, 60, false))).toBe("TIER_3");
    // s 7(8): only lots that are not occupiable.
    expect(tier(vicBuilding(0, 5, false))).toMatchObject({ ok: false, kind: "REFUSED", provision: expect.stringContaining("s 7(8)") });
  });

  it("gives no tier for 1 occupiable lot, as the notes give none", () => {
    expect(tier(vicBuilding(1, 0, false))).toMatchObject({ ok: false, kind: "NO_RULE" });
  });

  it("fails closed when the services only answer is needed and missing", () => {
    expect(tier(vicBuilding(50, 0, null))).toEqual({ ok: false, kind: "MISSING", missing: ["SERVICES_ONLY"] });
    expect(tier(vicBuilding(101, 0, null))).toEqual({ ok: false, kind: "MISSING", missing: ["SERVICES_ONLY"] });
    expect(tier(vicBuilding(2, 0, null))).toEqual({ ok: false, kind: "MISSING", missing: ["SERVICES_ONLY"] });
  });

  it("fails closed when a lot has no occupiable answer, never counting it either way", () => {
    const b = vicBuilding(50, 0, false);
    b.lots = [...b.lots, { lotNumber: "51", lotType: "RESIDENTIAL", occupiable: null }];
    b.scheme.totalLots = 51;
    expect(tier(b)).toEqual({ ok: false, kind: "MISSING", missing: ["OCCUPIABLE_LOT_COUNT", "NON_OCCUPIABLE_LOT_COUNT"] });
  });

  it("fails closed when the lots recorded do not match the building's total, or there are none", () => {
    expect(tier(vicBuilding(50, 0, false, { totalLots: 51 }))).toMatchObject({ ok: false, kind: "MISSING" });
    expect(tier({ scheme: { totalLots: 0, servicesOnly: false }, lots: [] })).toMatchObject({ ok: false, kind: "MISSING" });
  });

  it("does not count common property rows as lots", () => {
    const b = vicBuilding(10, 0, false);
    b.lots = [...b.lots, { lotNumber: "CP", lotType: "COMMON", occupiable: null }];
    expect(tierValue(b)).toBe("TIER_3");
  });

  it("says what to record in the Building data missing notice", () => {
    const b = vicBuilding(50, 0, false);
    b.lots = [...b.lots, { lotNumber: "51", lotType: "RESIDENTIAL", occupiable: null }, { lotNumber: "52", lotType: "RESIDENTIAL", occupiable: null }];
    b.scheme.totalLots = 52;
    expect(buildingSelectorProblems(VIC, { ...b, recorded: { ownersCorporationType: "UNLIMITED", ...ONLY_OC } })).toEqual([
      "The tier cannot be worked out because 2 lots have no answer for occupiable lot (lots 51 and 52). Record what is missing in the building rules.",
    ]);
    expect(buildingSelectorProblems(VIC, { ...vicBuilding(50, 0, null), recorded: ONLY_OC })).toEqual([
      "No owners corporation type is recorded for this building. Choose it in the building rules.",
      "The tier cannot be worked out because no answer is recorded for services only owners corporation. Record what is missing in the building rules.",
    ]);
    expect(buildingSelectorProblems(VIC, { ...vicBuilding(50, 0, false), recorded: { ownersCorporationType: "UNLIMITED" } })).toEqual([
      "No owners corporations on the plan is recorded for this building. Choose it in the building rules.",
      "The tier cannot be worked out because no owners corporations on the plan is recorded. Record what is missing in the building rules.",
    ]);
    expect(buildingSelectorProblems(VIC, { ...vicBuilding(9, 51, false), recorded: { ownersCorporationType: "LIMITED", ...ONLY_OC } })).toEqual([
      expect.stringMatching(/^The building's owners corporation type is recorded as limited owners corporation, which StrataVerze does not support yet\./),
      expect.stringMatching(/^The tier cannot be worked out\. Fewer than 10 lots are occupiable and more than 50 are not\./),
    ]);
  });
});

/** A Western Australian building with `n` lots. */
function waBuilding(n: number, replacementCost: string | null = null): BuildingFactRecords {
  return { scheme: { totalLots: n, replacementCost }, lots: Array.from({ length: n }, (_, i) => ({ lotNumber: String(i + 1), lotType: "RESIDENTIAL" })) };
}
const wa = (key: string, b: BuildingFactRecords, recorded: RecordedValues = {}) => {
  const r = deriveSelector(derived(WA, key), buildingFacts(b).values, recorded);
  return r.ok ? r.value : r;
};

describe("WA scheme size (STA s 3(1)), from the number of lots", () => {
  it.each([
    [2, "TWO_LOT"],
    [3, "THREE_TO_FIVE_LOT"],
    [5, "THREE_TO_FIVE_LOT"],
    [6, "SIX_OR_MORE_LOT"],
    [40, "SIX_OR_MORE_LOT"],
  ])("%i lots: %s", (n, expected) => {
    expect(wa("schemeSize", waBuilding(n))).toBe(expected);
  });

  it("gives no class below 2 lots, and fails closed with no lots", () => {
    expect(wa("schemeSize", waBuilding(1))).toMatchObject({ ok: false, kind: "NO_RULE" });
    expect(wa("schemeSize", waBuilding(0))).toEqual({ ok: false, kind: "MISSING", missing: ["LOT_COUNT"] });
  });
});

describe("WA designated strata company (STA s 100(7); STGR reg 79)", () => {
  it("is designated at 10 lots or more, with no other fact needed", () => {
    expect(wa("designatedStrataCompany", waBuilding(10))).toBe("DESIGNATED");
    expect(wa("designatedStrataCompany", waBuilding(25))).toBe("DESIGNATED");
  });

  it("below 10 lots, reads the replacement cost as strictly more than $5,000,000 for the scheme type", () => {
    const strata = { schemeType: "STRATA" };
    expect(wa("designatedStrataCompany", waBuilding(9, "5000000.00"), strata)).toBe("NOT_DESIGNATED");
    expect(wa("designatedStrataCompany", waBuilding(9, "5000000.01"), strata)).toBe("DESIGNATED");
    expect(wa("designatedStrataCompany", waBuilding(9, "0"), strata)).toBe("NOT_DESIGNATED");
    expect(wa("designatedStrataCompany", waBuilding(2, "6000000"), { schemeType: "SURVEY_STRATA" })).toBe("DESIGNATED");
    expect(wa("designatedStrataCompany", waBuilding(2, "5000000"), { schemeType: "SURVEY_STRATA" })).toBe("NOT_DESIGNATED");
  });

  it("fails closed below 10 lots without the replacement cost or the scheme type", () => {
    expect(wa("designatedStrataCompany", waBuilding(9), { schemeType: "STRATA" })).toEqual({ ok: false, kind: "MISSING", missing: ["REPLACEMENT_COST_CENTS"] });
    expect(wa("designatedStrataCompany", waBuilding(9, "6000000"))).toEqual({ ok: false, kind: "MISSING", missing: ["selector:schemeType"] });
    // The lots recorded do not match the building's total: the count is not read.
    const mismatch = { ...waBuilding(9), scheme: { totalLots: 12, replacementCost: "1000000" } };
    expect(wa("designatedStrataCompany", mismatch, { schemeType: "STRATA" })).toEqual({ ok: false, kind: "MISSING", missing: ["LOT_COUNT"] });
    // A cost over $5,000,000 decides it without the count.
    expect(wa("designatedStrataCompany", { ...mismatch, scheme: { totalLots: 12, replacementCost: "6000000" } }, { schemeType: "STRATA" })).toBe("DESIGNATED");
    expect(buildingSelectorProblems(WA, { ...mismatch, recorded: { schemeType: "STRATA", tenure: "FREEHOLD" } })).toEqual([
      "The scheme size cannot be worked out because 9 lots are recorded but the building's total is 12. Record what is missing in the building rules.",
      "The designated strata company cannot be worked out because 9 lots are recorded but the building's total is 12. Record what is missing in the building rules.",
    ]);
  });

  it("shows the facts it came from, and says what is missing", () => {
    expect(factsRead(derived(WA, "designatedStrataCompany"))).toEqual(["LOT_COUNT", "selector:schemeType", "REPLACEMENT_COST_CENTS"]);
    const view = buildingRulesView(WA, { ...waBuilding(9, "5000000.01"), recorded: { schemeType: "STRATA", tenure: "FREEHOLD" } })!;
    expect(view.derived.find((d) => d.key === "designatedStrataCompany")).toMatchObject({
      value: "Designated strata company",
      problem: null,
      facts: [
        { label: "Lots", value: "9" },
        { label: "Scheme type", value: "Strata scheme" },
        { label: "Replacement cost", value: "$5,000,000.01" },
      ],
    });
    expect(buildingSelectorProblems(WA, { ...waBuilding(9), recorded: { tenure: "FREEHOLD" } })).toEqual([
      "No scheme type is recorded for this building. Choose it in the building rules.",
      "The designated strata company cannot be worked out because no scheme type is recorded and no replacement cost is recorded. Record what is missing in the building rules.",
    ]);
  });
});

describe("ACT unit thresholds, from the number of units", () => {
  const act = (key: string, n: number) => {
    const r = deriveSelector(derived(ACT, key), buildingFacts(waBuilding(n)).values);
    return r.ok ? r.value : r.kind;
  };

  it.each([
    [1, "MAY_NOT_EXEMPT", "NOT_REQUIRED", "MAY_NOT_APPOINT", "ONE_PROXY", "BUDGET_DECIDES"],
    [2, "MAY_EXEMPT", "NOT_REQUIRED", "MAY_NOT_APPOINT", "ONE_PROXY", "BUDGET_DECIDES"],
    [3, "MAY_EXEMPT", "NOT_REQUIRED", "MAY_NOT_APPOINT", "ONE_PROXY", "BUDGET_DECIDES"],
    [4, "MAY_NOT_EXEMPT", "REQUIRED", "MAY_NOT_APPOINT", "ONE_PROXY", "BUDGET_DECIDES"],
    [6, "MAY_NOT_EXEMPT", "REQUIRED", "MAY_NOT_APPOINT", "ONE_PROXY", "BUDGET_DECIDES"],
    [7, "MAY_NOT_EXEMPT", "REQUIRED", "MAY_APPOINT", "ONE_PROXY", "BUDGET_DECIDES"],
    [20, "MAY_NOT_EXEMPT", "REQUIRED", "MAY_APPOINT", "ONE_PROXY", "BUDGET_DECIDES"],
    [21, "MAY_NOT_EXEMPT", "REQUIRED", "MAY_APPOINT", "FIVE_PERCENT_OF_UNITS", "BUDGET_DECIDES"],
    [100, "MAY_NOT_EXEMPT", "REQUIRED", "MAY_APPOINT", "FIVE_PERCENT_OF_UNITS", "BUDGET_DECIDES"],
    [101, "MAY_NOT_EXEMPT", "REQUIRED", "MAY_APPOINT", "FIVE_PERCENT_OF_UNITS", "REQUIRED"],
  ])("%i units", (n, bank, sinking, officer, proxy, audit) => {
    expect([act("bankAccountExemption", n), act("sinkingFundRequired", n), act("communicationsOfficer", n), act("proxyLimit", n), act("auditByUnits", n)]).toEqual([
      bank,
      sinking,
      officer,
      proxy,
      audit,
    ]);
  });

  it("fails closed with no units recorded, and says units, as the pack does", () => {
    expect(act("sinkingFundRequired", 0)).toBe("MISSING");
    const recorded = { schemeType: "UNITS_PLAN", retirementVillagePlan: "NO", mixedUsePlan: "NO", classBOnlyPlan: "NO" };
    const problems = buildingSelectorProblems(ACT, { ...waBuilding(0), recorded });
    expect(problems[0]).toBe("The bank account exemption cannot be worked out because no units are recorded. Record what is missing in the building rules.");
    expect(problems.join(" ")).not.toMatch(/\blots?\b/);
    expect(buildingSelectorProblems(ACT, { scheme: { totalLots: 5 }, lots: waBuilding(4).lots, recorded })[0]).toContain("because 4 units are recorded but the building's total is 5.");
    const view = buildingRulesView(ACT, { ...waBuilding(21), recorded })!;
    expect([view.lotWord, view.lotsWord]).toEqual(["Unit", "units"]);
    expect(view.derived.find((d) => d.key === "proxyLimit")?.facts).toEqual([{ label: "Units", value: "21" }]);
    // Western Australia keeps "lots".
    expect(buildingRulesView(WA, { ...waBuilding(3), recorded: {} })!.lotWord).toBe("Lot");
  });
});

describe("recorded selector values, checked against the pack", () => {
  it("allows only a listed option of a recorded selector the pack lists", () => {
    expect(selectorValueProblem(WA, "schemeType", "STRATA")).toBeNull();
    // A fact about the building: an option not supported yet may be recorded, and is flagged.
    expect(selectorValueProblem(WA, "tenure", "LEASEHOLD")).toBeNull();
    expect(selectorValueProblem(WA, "schemeType", "LEASEHOLD")).toBe("Choose a valid scheme type.");
    expect(selectorValueProblem(WA, "schemeType", "")).toBe("Choose the scheme type.");
    expect(selectorValueProblem(WA, "schemeSize", "TWO_LOT")).toBe("The scheme size is worked out from the building's facts, so it cannot be chosen.");
    expect(selectorValueProblem(WA, "retirementVillagePlan", "YES")).toBe("This building has no such setting.");
    expect(selectorValueProblem(ACT, "retirementVillagePlan", "YES")).toBeNull();
    expect(selectorValueProblem(NSW, "schemeType", "STRATA")).toBe("This building has no such setting.");
    expect(selectorValueProblem(QLD, "regulationModule", "STANDARD")).toBe("This building has no such setting.");
  });

  const form = (fields: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  };

  it("reads the form only for what the pack asks, refusing anything else", () => {
    expect(readBuildingRulesForm(WA, form({ "selector:schemeType": "STRATA", "selector:tenure": "", replacementCost: "$6,000,000.5" }))).toEqual({
      ok: true,
      input: { selectors: { schemeType: "STRATA", tenure: null }, replacementCost: "6000000.50" },
    });
    // Services only is not a Western Australian fact: the field is not read.
    expect(readBuildingRulesForm(WA, form({ servicesOnly: "YES" }))).toEqual({ ok: true, input: { selectors: {} } });
    expect(readBuildingRulesForm(WA, form({ "selector:schemeType": "UNITS_PLAN" }))).toEqual({ ok: false, error: "Choose a valid scheme type." });
    expect(readBuildingRulesForm(WA, form({ "selector:designatedStrataCompany": "DESIGNATED" }))).toEqual({
      ok: false,
      error: "The designated strata company is worked out from the building's facts, so it cannot be chosen.",
    });
    expect(readBuildingRulesForm(WA, form({ "selector:designatedStrataCompany": "" }))).toMatchObject({ ok: false });
    expect(readBuildingRulesForm(WA, form({ replacementCost: "-5" }))).toEqual({ ok: false, error: "The replacement cost must be an amount in dollars, such as 5,000,000." });
    expect(readBuildingRulesForm(VIC, form({ servicesOnly: "NO", "occupiable:lot-1": "YES", "occupiable:lot-2": "" }))).toEqual({
      ok: true,
      input: { selectors: {}, servicesOnly: false, occupiable: { "lot-1": true, "lot-2": null } },
    });
    expect(readBuildingRulesForm(VIC, form({ servicesOnly: "MAYBE" }))).toEqual({ ok: false, error: "Choose an answer for services only owners corporation." });
  });

  it("reads dollars exactly, to the cent", () => {
    expect(dollarsToCents("5000000.01")).toBe(500_000_001);
    expect(dollarsToCents("5000000.1")).toBe(500_000_010);
    expect(dollarsToCents(5000000)).toBe(500_000_000);
    expect(dollarsToCents("1e7")).toBeNull();
    expect(parseDollars("5,000,000")).toEqual({ ok: true, cents: 500_000_000 });
    expect(parseDollars("1000000000000")).toEqual({ ok: false });
  });
});

describe("every pack's building selectors", () => {
  const packs = Object.entries(PENDING_RULE_PACKS).map(([k, p]) => [k, p.rules as unknown as StatutoryRules] as const);

  it.each(packs)("%s: unique keys, and each derived rule's value is one of its options", (_k, rules) => {
    const selectors = rules.BUILDING_SELECTORS ?? [];
    expect(new Set(selectors.map((s) => s.key)).size).toBe(selectors.length);
    for (const s of selectors) {
      expect(s.label.length).toBeGreaterThan(0);
      if (s.held !== "DERIVED") continue;
      for (const r of s.rules) {
        if (r.value == null) expect(r.refusal, s.key).toBeTruthy();
        else expect(s.options.map((o) => o.value), s.key).toContain(r.value);
      }
      // Every recorded selector a rule reads is one the pack lists as recorded.
      for (const ref of factsRead(s).filter((f) => f.startsWith("selector:"))) {
        expect(selectors.find((x) => x.key === ref.slice(9))?.held, ref).toBe("RECORDED");
      }
    }
  });
});

describe("NSW and Queensland are unchanged", () => {
  const records = { scheme: { totalLots: 1, regulationModule: "STANDARD", planFormat: "BUILDING" }, lots: [{ lotNumber: "1", lotType: "RESIDENTIAL", entitlement: 1, interestScheduleEntitlement: null }], recorded: {} };

  it("have no building selectors, no Building rules section and no new problems", () => {
    for (const rules of [NSW, QLD]) {
      expect(rules.BUILDING_SELECTORS).toBeUndefined();
      expect(rules.BUILDING_FACTS).toBeUndefined();
      expect(buildingRulesView(rules, records)).toBeNull();
      expect(buildingSelectorProblems(rules, records)).toEqual([]);
    }
    expect(buildingDataProblems(NSW, records.scheme, records.lots, { anything: "X" })).toEqual([]);
    expect(buildingDataProblems(QLD, records.scheme, records.lots, { anything: "X" })).toEqual(buildingDataProblems(QLD, records.scheme, records.lots));
  });

  it("reads Queensland's regulation module and plan format from their own columns through the general reader", () => {
    expect(selectorValue(QLD, "regulationModule", records)).toEqual({ holding: "COLUMN", value: "STANDARD" });
    expect(selectorValue(QLD, "planFormat", records)).toEqual({ holding: "COLUMN", value: "BUILDING" });
    expect(selectorValue(QLD, "planFormat", { ...records, scheme: { ...records.scheme, planFormat: null } })).toEqual({ holding: "COLUMN", value: null });
    expect(selectorValue(NSW, "regulationModule", records)).toBeNull();
    expect(selectorValue(WA, "schemeType", { ...waBuilding(3), recorded: { schemeType: "STRATA" } })).toEqual({ holding: "RECORDED", value: "STRATA" });
    expect(selectorValue(WA, "schemeSize", { ...waBuilding(3), recorded: {} })).toMatchObject({ holding: "DERIVED", value: "THREE_TO_FIVE_LOT" });
  });
});

describe("a recorded value that is not one of the selector's options (PR 8a-ii review, 29 Oct 2026)", () => {
  const lots8 = Array.from({ length: 8 }, (_, i) => ({ id: `l${i + 1}`, lotNumber: String(i + 1), lotType: "RESIDENTIAL", occupiable: true }));
  const vicBuilding = (recorded: RecordedValues) => ({ scheme: { totalLots: 8, servicesOnly: false }, lots: lots8, recorded });
  const actBuilding = (recorded: RecordedValues) => ({ scheme: { totalLots: 8 }, lots: lots8, recorded });

  it("is read as not recorded, so a test on it cannot be decided", () => {
    expect(knownRecorded(ACT, { memberBand: "TWELVE", other: "kept" })).toEqual({ memberBand: null, other: "kept" });
    expect(knownRecorded(ACT, { memberBand: " THREE " })).toEqual({ memberBand: " THREE " });
    expect(selectorValue(ACT, "memberBand", actBuilding({ memberBand: "TWELVE" }))).toEqual({ holding: "RECORDED", value: null });
    expect(conditionHolds(ACT, { selector: "memberBand", in: ["THREE", "FOUR_OR_MORE"] }, actBuilding({ memberBand: "TWELVE" }))).toEqual({ holds: null, missing: ["selector:memberBand"] });
    expect(conditionHolds(ACT, { selector: "memberBand", in: ["THREE", "FOUR_OR_MORE"] }, actBuilding({ memberBand: "ONE_OR_TWO" })).holds).toBe(false);
  });

  it("never lets a derived selector be worked out past it (the tier with an owners corporation answer not known)", () => {
    expect(selectorValue(VIC, "tier", vicBuilding({ severalOwnersCorporations: "NO" }))?.value).toBe("TIER_4");
    const unknown = selectorValue(VIC, "tier", vicBuilding({ severalOwnersCorporations: "MAYBE" }));
    expect(unknown?.value).toBeNull();
    expect(unknown?.derived).toEqual({ ok: false, kind: "MISSING", missing: ["selector:severalOwnersCorporations"] });
    expect(missingWords(VIC, "selector:severalOwnersCorporations", vicBuilding({ severalOwnersCorporations: "MAYBE" }))).toBe(
      "the owners corporations on the plan recorded is not one StrataVerze knows",
    );
    expect(missingWords(VIC, "selector:severalOwnersCorporations", vicBuilding({}))).toBe("no answer is recorded for owners corporations on the plan");
  });
});
