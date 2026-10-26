import { describe, expect, it } from "vitest";
import { getAgendaTemplate, getMotionLibrary } from "@/lib/meetings/templates";
import { RULE_PACKS, UnsupportedJurisdictionError, rulePackFor, statutoryRulesFor, STATUTORY_INTEREST } from "./statutory";
import { SUPPORTED_SCHEME_STATES } from "./jurisdictions";

describe("rule packs", () => {
  it("has an NSW pack only, and buildings can only be in a state with a pack", () => {
    expect(Object.keys(RULE_PACKS)).toEqual(["NSW"]);
    expect(RULE_PACKS.NSW.code).toBe("AU-NSW");
    expect(SUPPORTED_SCHEME_STATES).toEqual(["NSW"]);
  });

  it("gives an NSW building the NSW rules", () => {
    expect(statutoryRulesFor("NSW").STATUTORY_INTEREST).toBe(STATUTORY_INTEREST);
    expect(statutoryRulesFor("nsw")).toBe(statutoryRulesFor("NSW"));
    expect(rulePackFor(" nsw ")?.code).toBe("AU-NSW");
  });

  it("refuses a jurisdiction without a pack rather than falling back to NSW", () => {
    for (const s of ["VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT", "NZ", "", null, undefined, "constructor", "__proto__"]) {
      expect(rulePackFor(s)).toBeNull();
      expect(() => statutoryRulesFor(s)).toThrow(UnsupportedJurisdictionError);
    }
  });

  it("has no NSW agenda template or motions for another state", () => {
    expect(getAgendaTemplate("NSW", "AGM").length).toBeGreaterThan(0);
    expect(getAgendaTemplate("nsw", "AGM")).toEqual(getAgendaTemplate("NSW", "AGM"));
    for (const s of ["VIC", "QLD", ""]) {
      expect(() => getAgendaTemplate(s, "AGM")).toThrow(UnsupportedJurisdictionError);
      expect(() => getMotionLibrary(s)).toThrow(UnsupportedJurisdictionError);
    }
  });
});
