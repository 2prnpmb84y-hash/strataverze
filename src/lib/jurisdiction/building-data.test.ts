/**
 * The data a building's pack asks it to hold (QLD stage 2, step 10): the
 * regulation module, the plan format (QLD go-live gap, insurance in
 * contributions) and each lot's entitlement in every schedule. NSW has one
 * schedule, no module and no plan format, so nothing changes for it.
 */
import { describe, expect, it } from "vitest";
import { QLD_RULE_PACK, statutoryRulesFor, type StatutoryRules } from "@/config/statutory";
import {
  buildingDataProblems,
  entitlementFor,
  entitlementInputProblem,
  EntitlementRuleError,
  lotEntitlementFor,
  lotEntitlementProblem,
  lotsMissingEntitlement,
  MissingEntitlementError,
  onLotEntitlementWords,
  parseEntitlement,
  planFormatChoiceProblem,
  planFormatChoices,
  planFormatLabel,
  planFormatProblem,
  regulationModuleChoiceProblem,
  regulationModuleChoices,
  regulationModuleLabel,
  regulationModuleProblem,
  scheduleFor,
  separateEntitlement,
  type EntitlementUse,
} from "./building-data";

const NSW = statutoryRulesFor("NSW");
const QLD = QLD_RULE_PACK.rules as unknown as StatutoryRules;
const ALL_USES: EntitlementUse[] = [
  "CONTRIBUTIONS",
  "POLL_VOTE",
  "SPECIAL_RESOLUTION",
  "COMMON_PROPERTY_SHARE",
  "INSURANCE_COMMON_PROPERTY",
  "INSURANCE_BUILDINGS",
  "TERMINATION_INTEREST",
  "VALUE_BASED_RATES",
];
const NO_DASH_OR_SEMICOLON = /[;–—]| - /;

describe("which schedule decides each use", () => {
  it("is NSW's one schedule, unit entitlement on the lot, for everything", () => {
    for (const use of ALL_USES) expect(scheduleFor(NSW, use).key).toBe("UNIT_ENTITLEMENT");
    expect(lotEntitlementFor(NSW, { entitlement: 12 }, "CONTRIBUTIONS")).toBe(12);
  });

  it("is Queensland's contribution schedule for contributions, polls and the special resolution test (Act ss 47(2), 106(3), 110(3); SM s 162(5))", () => {
    for (const use of ["CONTRIBUTIONS", "POLL_VOTE", "SPECIAL_RESOLUTION"] as const) {
      const s = scheduleFor(QLD, use);
      expect(s.key).toBe("CONTRIBUTION");
      // The engines that read lots.entitlement (levies, penalty, polls, the special resolution) read this schedule.
      expect(s.onLot).toBe(true);
    }
  });

  it("is Queensland's interest schedule for common property, the common property insurance, termination and rates (Act s 47(3); SM s 197(4))", () => {
    for (const use of ["COMMON_PROPERTY_SHARE", "INSURANCE_COMMON_PROPERTY", "TERMINATION_INTEREST", "VALUE_BASED_RATES"] as const) {
      expect(scheduleFor(QLD, use).key).toBe("INTEREST");
    }
  });

  it("is Queensland's interest schedule for the buildings insurance share of a building or volumetric format plan (SM s 201(1))", () => {
    for (const planFormat of ["BUILDING", "VOLUMETRIC"]) {
      expect(scheduleFor(QLD, "INSURANCE_BUILDINGS", { planFormat }).key).toBe("INTEREST");
      expect(lotEntitlementFor(QLD, { entitlement: 50, interestScheduleEntitlement: 45 }, "INSURANCE_BUILDINGS", { planFormat })).toBe(45);
    }
  });

  it("is no Queensland schedule for the buildings insurance share of a standard format plan, or with no plan format recorded", () => {
    expect(() => scheduleFor(QLD, "INSURANCE_BUILDINGS", { planFormat: "STANDARD" })).toThrow(
      "This building is recorded as a standard format plan. Its buildings insurance is shared by the cost of reinstating the buildings on each lot",
    );
    expect(() => scheduleFor(QLD, "INSURANCE_BUILDINGS")).toThrow("No plan format is recorded for this building.");
    expect(() => scheduleFor(QLD, "INSURANCE_BUILDINGS", { planFormat: " " })).toThrow(EntitlementRuleError);
    expect(() => scheduleFor(QLD, "INSURANCE_BUILDINGS", { planFormat: "LAYERED" })).toThrow("not one StrataVerze knows");
    expect(() => lotEntitlementFor(QLD, { entitlement: 50, interestScheduleEntitlement: 45 }, "INSURANCE_BUILDINGS", { planFormat: "STANDARD" })).toThrow(EntitlementRuleError);
    // The plan format changes nothing else: the other uses are decided as before.
    for (const use of ALL_USES.filter((u) => u !== "INSURANCE_BUILDINGS")) {
      expect(scheduleFor(QLD, use, { planFormat: "STANDARD" }).key).toBe(scheduleFor(QLD, use).key);
    }
  });

  it("lists every use under exactly one Queensland schedule, the buildings insurance share for building and volumetric format plans only", () => {
    const listed = QLD.ENTITLEMENT_SCHEDULES.flatMap((s) => s.decides ?? []);
    expect(listed.map((d) => (typeof d === "string" ? d : d.use)).sort()).toEqual([...ALL_USES].sort());
    expect(listed.filter((d) => typeof d !== "string")).toEqual([{ use: "INSURANCE_BUILDINGS", planFormats: ["BUILDING", "VOLUMETRIC"] }]);
  });

  it("is NSW's one schedule whatever plan format is passed", () => {
    for (const planFormat of [null, "BUILDING", "STANDARD"]) expect(scheduleFor(NSW, "INSURANCE_BUILDINGS", { planFormat }).key).toBe("UNIT_ENTITLEMENT");
  });

  it("refuses a pack with two schedules that does not say which decides a use", () => {
    const vague = { ENTITLEMENT_SCHEDULES: QLD.ENTITLEMENT_SCHEDULES.map((s) => ({ ...s, decides: undefined })) };
    expect(() => scheduleFor(vague, "CONTRIBUTIONS")).toThrow(EntitlementRuleError);
  });
});

describe("a lot's entitlement in a schedule", () => {
  const contribution = QLD.ENTITLEMENT_SCHEDULES.find((s) => s.key === "CONTRIBUTION")!;
  const interest = QLD.ENTITLEMENT_SCHEDULES.find((s) => s.key === "INTEREST")!;

  it("reads the contribution schedule from entitlement and the interest schedule from its own field", () => {
    const lot = { lotNumber: "3", entitlement: 50, interestScheduleEntitlement: 45 };
    expect(entitlementFor(lot, contribution)).toBe(50);
    expect(entitlementFor(lot, interest)).toBe(45);
    expect(lotEntitlementFor(QLD, lot, "INSURANCE_COMMON_PROPERTY")).toBe(45);
    expect(lotEntitlementFor(QLD, lot, "CONTRIBUTIONS")).toBe(50);
  });

  it("fails closed for a lot with no interest schedule entitlement, never falling back to the contribution schedule", () => {
    const lot = { lotNumber: "3", entitlement: 50, interestScheduleEntitlement: null };
    expect(() => entitlementFor(lot, interest)).toThrow(MissingEntitlementError);
    expect(() => lotEntitlementFor(QLD, lot, "VALUE_BASED_RATES")).toThrow("Lot 3 has no interest schedule lot entitlement recorded.");
  });

  it("refuses a schedule StrataVerze does not hold", () => {
    expect(() => entitlementFor({ entitlement: 5 }, { key: "UNHELD", onLot: false, name: "unheld schedule" })).toThrow(EntitlementRuleError);
    expect(() => entitlementFor({ entitlement: 5 }, { key: "toString", onLot: false, name: "unheld schedule" })).toThrow(EntitlementRuleError);
  });
});

describe("the lot screens' words", () => {
  it("keep NSW's own words: no second schedule, no label from the pack", () => {
    expect(separateEntitlement(NSW)).toBeNull();
    expect(onLotEntitlementWords(NSW)).toEqual({ label: null, help: null });
    expect(lotEntitlementProblem(NSW, { entitlement: 1 })).toBeNull();
    expect(lotsMissingEntitlement(NSW, [{ entitlement: 1 }])).toEqual([]);
  });

  it("name both Queensland schedules from the pack", () => {
    expect(onLotEntitlementWords(QLD).label).toBe("Contribution Schedule Lot Entitlement");
    expect(separateEntitlement(QLD)).toEqual({
      key: "INTEREST",
      name: "interest schedule lot entitlement",
      label: "Interest Schedule Lot Entitlement",
      help: "From the interest schedule in the community management statement. A whole number, not 0.",
      field: "interestScheduleEntitlement",
    });
  });
});

describe("an entitlement typed in", () => {
  it("is a positive whole number (Act s 46: a whole number, not 0)", () => {
    expect(parseEntitlement("45")).toEqual({ ok: true, value: 45 });
    expect(parseEntitlement(" 1,200 ")).toEqual({ ok: true, value: 1200 });
    expect(parseEntitlement("")).toEqual({ ok: true, value: null });
    for (const bad of ["0", "-3", "4.5", "1e3", "abc", "9999999999"]) expect(parseEntitlement(bad), bad).toEqual({ ok: false });
  });

  it("is required where asked, in plain words", () => {
    expect(entitlementInputProblem("Interest Schedule Lot Entitlement", "", true)).toBe("Enter the interest schedule lot entitlement.");
    expect(entitlementInputProblem("Interest Schedule Lot Entitlement", "", false)).toBeNull();
    expect(entitlementInputProblem("Interest Schedule Lot Entitlement", "0", false)).toBe("Interest Schedule Lot Entitlement must be a whole number of at least 1.");
  });
});

describe("the regulation module", () => {
  it("has no setting for NSW", () => {
    expect(regulationModuleChoices(NSW)).toBeNull();
    expect(regulationModuleProblem(NSW, null)).toBeNull();
    expect(regulationModuleChoiceProblem(NSW, "STANDARD")).toBe("This building has no such setting.");
  });

  it("offers Queensland's modules with the pack's label and help, the Standard Module only supported", () => {
    const c = regulationModuleChoices(QLD)!;
    expect(c.label).toBe("Regulation module");
    expect(c.help).toBe(QLD.REGULATION_MODULE!.help);
    expect(c.options.filter((o) => o.supported).map((o) => o.value)).toEqual(["STANDARD"]);
    expect(c.options.map((o) => o.value)).toEqual(["STANDARD", "ACCOMMODATION", "COMMERCIAL", "SMALL_SCHEMES", "SPECIFIED_TWO_LOT"]);
  });

  it("saves the Standard Module only", () => {
    expect(regulationModuleChoiceProblem(QLD, "STANDARD")).toBeNull();
    expect(regulationModuleChoiceProblem(QLD, "")).toBe("Choose the regulation module.");
    expect(regulationModuleChoiceProblem(QLD, "NSW")).toBe("Choose a valid regulation module.");
    expect(regulationModuleChoiceProblem(QLD, "COMMERCIAL")).toBe("StrataVerze applies the Standard Module only for now, so a building under the Commercial Module cannot be managed yet.");
  });

  it("flags a Queensland building with no module or an unsupported one", () => {
    expect(regulationModuleProblem(QLD, "STANDARD")).toBeNull();
    expect(regulationModuleProblem(QLD, null)).toMatch(/^No regulation module is recorded for this building/);
    expect(regulationModuleProblem(QLD, "SMALL_SCHEMES")).toMatch(/Small Schemes Module, which StrataVerze does not apply yet/);
    expect(regulationModuleLabel(QLD, "STANDARD")).toBe("Standard Module");
    expect(regulationModuleLabel(QLD, null)).toBeNull();
  });
});

describe("the plan format", () => {
  it("has no setting for NSW", () => {
    expect(planFormatChoices(NSW)).toBeNull();
    expect(planFormatProblem(NSW, null)).toBeNull();
    expect(planFormatChoiceProblem(NSW, "BUILDING")).toBe("This building has no such setting.");
  });

  it("offers Queensland's three plan formats from the pack, building and volumetric supported", () => {
    const c = planFormatChoices(QLD)!;
    expect(c.label).toBe("Plan format");
    expect(c.help).toBe(QLD.PLAN_FORMAT!.help);
    expect(c.options.map((o) => o.value)).toEqual(["BUILDING", "VOLUMETRIC", "STANDARD"]);
    expect(c.options.filter((o) => o.supported).map((o) => o.value)).toEqual(["BUILDING", "VOLUMETRIC"]);
  });

  it("records any listed plan format, the standard format too, since it is a fact about the building", () => {
    for (const v of ["BUILDING", "VOLUMETRIC", "STANDARD"]) expect(planFormatChoiceProblem(QLD, v)).toBeNull();
    expect(planFormatChoiceProblem(QLD, "")).toBe("Choose the plan format.");
    expect(planFormatChoiceProblem(QLD, "LAYERED")).toBe("Choose a valid plan format.");
  });

  it("flags a Queensland building with no plan format, or a standard format plan", () => {
    expect(planFormatProblem(QLD, "BUILDING")).toBeNull();
    expect(planFormatProblem(QLD, "VOLUMETRIC")).toBeNull();
    expect(planFormatProblem(QLD, null)).toBe("No plan format is recorded for this building. Choose it in the building settings before contributions that include insurance are raised.");
    expect(planFormatProblem(QLD, "STANDARD")).toBe(
      "This building is recorded as a standard format plan. Its buildings insurance is shared by the cost of reinstating the buildings on each lot, which StrataVerze does not work out yet. Contributions that include insurance cannot be raised for it until then.",
    );
    expect(planFormatLabel(QLD, "VOLUMETRIC")).toBe("Volumetric format plan");
    expect(planFormatLabel(QLD, null)).toBeNull();
  });
});

describe("what a building is missing", () => {
  const lots = [
    { lotNumber: "1", entitlement: 10, interestScheduleEntitlement: 12 },
    { lotNumber: "2", entitlement: 10, interestScheduleEntitlement: null },
    { lotNumber: "3", entitlement: 10, interestScheduleEntitlement: null },
  ];

  it("is nothing for an NSW building", () => {
    expect(buildingDataProblems(NSW, { regulationModule: null }, lots)).toEqual([]);
  });

  it("is the module, the plan format and the lots without an interest schedule entitlement, for a Queensland building", () => {
    const problems = buildingDataProblems(QLD, { regulationModule: null }, lots);
    expect(problems).toEqual([
      "No regulation module is recorded for this building. Choose it in the building settings before relying on its rules.",
      "No plan format is recorded for this building. Choose it in the building settings before contributions that include insurance are raised.",
      "2 lots have no interest schedule lot entitlement recorded (lots 2 and 3). StrataVerze can enter them from the building's records.",
    ]);
    expect(buildingDataProblems(QLD, { regulationModule: "STANDARD", planFormat: "BUILDING" }, lots.slice(0, 2))).toEqual([
      "Lot 2 has no interest schedule lot entitlement recorded. StrataVerze can enter it from the building's records.",
    ]);
    expect(buildingDataProblems(QLD, { regulationModule: "STANDARD", planFormat: "VOLUMETRIC" }, lots.slice(0, 1))).toEqual([]);
    expect(buildingDataProblems(QLD, { regulationModule: "STANDARD", planFormat: "STANDARD" }, lots.slice(0, 1))).toEqual([planFormatProblem(QLD, "STANDARD")]);
    expect(lotEntitlementProblem(QLD, lots[1])).toBe("This lot has no interest schedule lot entitlement recorded. StrataVerze can enter it from the building's records.");
  });

  it("lists at most ten lots by number", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ lotNumber: String(i + 1), entitlement: 1, interestScheduleEntitlement: null }));
    expect(buildingDataProblems(QLD, { regulationModule: "STANDARD", planFormat: "BUILDING" }, many)[0]).toBe(
      "12 lots have no interest schedule lot entitlement recorded (lots 1, 2, 3, 4, 5, 6, 7, 8, 9 and 10, and 2 more). StrataVerze can enter them from the building's records.",
    );
  });

  it("says it plainly, with no dash or semicolon", () => {
    const texts = [
      ...buildingDataProblems(QLD, { regulationModule: "COMMERCIAL" }, lots),
      regulationModuleChoiceProblem(QLD, "COMMERCIAL")!,
      regulationModuleProblem(QLD, "UNKNOWN")!,
      entitlementInputProblem("Interest Schedule Lot Entitlement", "x", true)!,
      QLD.REGULATION_MODULE!.help,
      ...QLD.ENTITLEMENT_SCHEDULES.map((s) => s.help ?? ""),
      planFormatProblem(QLD, null)!,
      planFormatProblem(QLD, "STANDARD")!,
      planFormatProblem(QLD, "LAYERED")!,
      planFormatChoiceProblem(QLD, "LAYERED")!,
      QLD.PLAN_FORMAT!.help,
      ...QLD.PLAN_FORMAT!.options.flatMap((o) => [o.label, o.note ?? ""]),
    ];
    for (const t of texts) expect(t).not.toMatch(NO_DASH_OR_SEMICOLON);
  });
});
