/**
 * Victoria's two schedules (VIC, ACT and WA stage 2, PR 4): lot liability on
 * each lot (lots.entitlement) and lot entitlement held separately
 * (lots.lot_entitlement). Each use resolves to the schedule the notes give,
 * a lot without a lot entitlement fails closed (never read from lot
 * liability), and a use the pack does not list is refused.
 */
import { describe, expect, it } from "vitest";
import { PENDING_RULE_PACKS, QLD_RULE_PACK, statutoryRulesFor, type StatutoryRules } from "@/config/statutory";
import {
  SEPARATE_ENTITLEMENT_FIELDS,
  buildingDataProblems,
  entitlementField,
  entitlementFor,
  EntitlementRuleError,
  lotEntitlementFor,
  lotEntitlementProblem,
  lotsMissingEntitlement,
  MissingEntitlementError,
  onLotEntitlementWords,
  onLotSchedule,
  scheduleFor,
  separateEntitlement,
  type EntitlementUse,
} from "./building-data";

const VIC = PENDING_RULE_PACKS.VIC.rules as unknown as StatutoryRules;
const QLD = QLD_RULE_PACK.rules as unknown as StatutoryRules;
const NSW = statutoryRulesFor("NSW");

const LIABILITY: EntitlementUse[] = ["CONTRIBUTIONS"];
const ENTITLEMENT: EntitlementUse[] = ["POLL_VOTE", "SPECIAL_RESOLUTION", "UNANIMOUS_RESOLUTION", "QUORUM_FALLBACK", "COMMON_PROPERTY_SHARE", "INSURANCE_PREMIUM_FEE"];
const NOT_LISTED: EntitlementUse[] = ["INSURANCE_COMMON_PROPERTY", "INSURANCE_BUILDINGS", "TERMINATION_INTEREST", "VALUE_BASED_RATES"];

describe("which Victorian schedule decides each use", () => {
  it("gives fees to lot liability", () => {
    for (const use of LIABILITY) expect(scheduleFor(VIC, use).key, use).toBe("LOT_LIABILITY");
  });

  it("gives polls, special and unanimous resolutions, the quorum, common property and the s 23A fee to lot entitlement", () => {
    for (const use of ENTITLEMENT) expect(scheduleFor(VIC, use).key, use).toBe("LOT_ENTITLEMENT");
  });

  it("refuses a use the notes do not give either schedule", () => {
    for (const use of NOT_LISTED) expect(() => scheduleFor(VIC, use), use).toThrow(EntitlementRuleError);
  });

  it("lists each use under one schedule only, with the provisions in its source", () => {
    const listed = VIC.ENTITLEMENT_SCHEDULES.flatMap((s) => (s.decides ?? []).map((d) => (typeof d === "string" ? d : d.use)));
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual([...LIABILITY, ...ENTITLEMENT].sort());
    const entitlement = VIC.ENTITLEMENT_SCHEDULES.find((s) => s.key === "LOT_ENTITLEMENT")!;
    for (const s of ["23A", "77", "89(3)", "95", "96", "s 30"]) expect(entitlement.source).toContain(s);
  });

  it("does not depend on a plan format, which Victoria does not have", () => {
    for (const planFormat of [undefined, null, "BUILDING", "X"]) expect(scheduleFor(VIC, "INSURANCE_PREMIUM_FEE", { planFormat }).key).toBe("LOT_ENTITLEMENT");
  });

  it("leaves the new uses unlisted for NSW's one schedule and refuses them for Queensland", () => {
    for (const use of ["UNANIMOUS_RESOLUTION", "QUORUM_FALLBACK", "INSURANCE_PREMIUM_FEE"] as const) {
      expect(scheduleFor(NSW, use).key).toBe(NSW.ENTITLEMENT_SCHEDULES[0].key);
      expect(() => scheduleFor(QLD, use)).toThrow(EntitlementRuleError);
    }
  });
});

describe("a Victorian lot's entitlements", () => {
  const liability = VIC.ENTITLEMENT_SCHEDULES.find((s) => s.key === "LOT_LIABILITY")!;
  const entitlement = VIC.ENTITLEMENT_SCHEDULES.find((s) => s.key === "LOT_ENTITLEMENT")!;

  it("reads lot liability from entitlement and lot entitlement from its own field", () => {
    expect(entitlementField(liability)).toBe("entitlement");
    expect(entitlementField(entitlement)).toBe("lotEntitlement");
    expect(SEPARATE_ENTITLEMENT_FIELDS).toEqual(["interestScheduleEntitlement", "lotEntitlement"]);
    const lot = { lotNumber: "4", entitlement: 12, lotEntitlement: 30 };
    expect(lotEntitlementFor(VIC, lot, "CONTRIBUTIONS")).toBe(12);
    for (const use of ENTITLEMENT) expect(lotEntitlementFor(VIC, lot, use)).toBe(30);
  });

  it("fails closed for a lot with no lot entitlement, never falling back to lot liability", () => {
    for (const lot of [
      { lotNumber: "4", entitlement: 12 },
      { lotNumber: "4", entitlement: 12, lotEntitlement: null },
      { lotNumber: "4", entitlement: 12, lotEntitlement: 0 },
      { lotNumber: "4", entitlement: 12, lotEntitlement: 2.5 },
    ]) {
      expect(() => entitlementFor(lot, entitlement)).toThrow(MissingEntitlementError);
      for (const use of ENTITLEMENT) expect(() => lotEntitlementFor(VIC, lot, use)).toThrow("Lot 4 has no lot entitlement recorded.");
    }
  });

  it("never reads a Queensland interest schedule value as a Victorian lot entitlement, or the other way", () => {
    expect(() => lotEntitlementFor(VIC, { lotNumber: "1", entitlement: 5, interestScheduleEntitlement: 7 }, "POLL_VOTE")).toThrow(MissingEntitlementError);
    expect(() => lotEntitlementFor(QLD, { lotNumber: "1", entitlement: 5, lotEntitlement: 7 }, "COMMON_PROPERTY_SHARE")).toThrow(MissingEntitlementError);
  });
});

describe("the Victorian lot screens and Building data missing", () => {
  it("name both schedules from the pack and hold lot entitlement separately", () => {
    expect(onLotSchedule(VIC).key).toBe("LOT_LIABILITY");
    expect(onLotEntitlementWords(VIC)).toEqual({ label: "Lot Liability", help: "From the owners corporation register. Enter a whole number of at least 1." });
    expect(separateEntitlement(VIC)).toEqual({
      key: "LOT_ENTITLEMENT",
      name: "lot entitlement",
      label: "Lot Entitlement",
      help: "From the owners corporation register. Enter a whole number of at least 1.",
      field: "lotEntitlement",
    });
  });

  it("flags each lot without a lot entitlement", () => {
    const lots = [
      { lotNumber: "1", entitlement: 10, lotEntitlement: 20 },
      { lotNumber: "2", entitlement: 10, lotEntitlement: null },
      { lotNumber: "3", entitlement: 10, interestScheduleEntitlement: 9 },
    ];
    expect(lotsMissingEntitlement(VIC, lots).map((l) => l.lotNumber)).toEqual(["2", "3"]);
    expect(lotEntitlementProblem(VIC, lots[0])).toBeNull();
    expect(lotEntitlementProblem(VIC, lots[1])).toBe("This lot has no lot entitlement recorded. StrataVerze can enter it from the building's records.");
    const problems = buildingDataProblems(VIC, { totalLots: 3, servicesOnly: false, replacementCost: null }, lots.map((l) => ({ ...l, lotType: "RESIDENTIAL", occupiable: true })));
    expect(problems).toContain("2 lots have no lot entitlement recorded (lots 2 and 3). StrataVerze can enter them from the building's records.");
    expect(problems.join(" ")).not.toContain("does not hold");
    const complete = buildingDataProblems(VIC, { totalLots: 1, servicesOnly: false, replacementCost: null }, [{ ...lots[0], lotType: "RESIDENTIAL", occupiable: true }]);
    expect(complete.join(" ")).not.toContain("lot entitlement");
  });
});
