import { describe, expect, it } from "vitest";
import { getAgendaTemplate, getMotionLibrary, QLD_AGM_TEMPLATE } from "@/lib/meetings/templates";
import { QLD_RULE_PACK, RULE_PACKS, UnsupportedJurisdictionError, rulePackFor, statutoryRulesFor, STATUTORY_INTEREST } from "./statutory";
import { SUPPORTED_SCHEME_STATES } from "./jurisdictions";

describe("rule packs", () => {
  it("has the NSW and Queensland packs, and buildings can only be in a state with a pack", () => {
    expect(Object.keys(RULE_PACKS)).toEqual(["NSW", "QLD"]);
    expect(RULE_PACKS.NSW.code).toBe("AU-NSW");
    expect(RULE_PACKS.QLD.code).toBe("AU-QLD");
    expect([...SUPPORTED_SCHEME_STATES].sort()).toEqual(Object.keys(RULE_PACKS).sort());
  });

  it("gives an NSW building the NSW rules", () => {
    expect(statutoryRulesFor("NSW").STATUTORY_INTEREST).toBe(STATUTORY_INTEREST);
    expect(statutoryRulesFor("nsw")).toBe(statutoryRulesFor("NSW"));
    expect(rulePackFor(" nsw ")?.code).toBe("AU-NSW");
  });

  it("gives a Queensland building the Queensland rules, never the NSW ones (switched on 28 Oct 2026)", () => {
    expect(rulePackFor("QLD")).toBe(QLD_RULE_PACK);
    expect(rulePackFor(" qld ")?.code).toBe("AU-QLD");
    expect(statutoryRulesFor("QLD")).toBe(QLD_RULE_PACK.rules);
    expect(statutoryRulesFor("QLD").STATUTORY_INTEREST).toBeUndefined();
    expect(statutoryRulesFor("QLD").TERMINOLOGY.ownersCorporation).not.toBe(statutoryRulesFor("NSW").TERMINOLOGY.ownersCorporation);
  });

  it("names the supported jurisdictions in its refusal", () => {
    expect(() => statutoryRulesFor(" vic ")).toThrow("StrataVerze has no strata rules for VIC yet, so this building cannot be managed here. Buildings can be in: New South Wales, Queensland.");
  });

  it("refuses a jurisdiction without a pack rather than falling back to NSW", () => {
    for (const s of ["VIC", "WA", "SA", "TAS", "ACT", "NT", "NZ", "", null, undefined, "constructor", "__proto__"]) {
      expect(rulePackFor(s)).toBeNull();
      expect(() => statutoryRulesFor(s)).toThrow(UnsupportedJurisdictionError);
    }
  });

  it("gives each state with a pack its own agenda template and motions, and none to another state", () => {
    expect(getAgendaTemplate("NSW", "AGM").length).toBeGreaterThan(0);
    expect(getAgendaTemplate("nsw", "AGM")).toEqual(getAgendaTemplate("NSW", "AGM"));
    expect(getAgendaTemplate("QLD", "AGM")).toBe(QLD_AGM_TEMPLATE);
    expect(getAgendaTemplate("QLD", "AGM")).not.toEqual(getAgendaTemplate("NSW", "AGM"));
    for (const s of ["VIC", "WA", ""]) {
      expect(() => getAgendaTemplate(s, "AGM")).toThrow(UnsupportedJurisdictionError);
      expect(() => getMotionLibrary(s)).toThrow(UnsupportedJurisdictionError);
    }
  });
});
