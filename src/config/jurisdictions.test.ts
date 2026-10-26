import { describe, expect, it } from "vitest";
import { DEFAULT_SCHEME_STATE, SCHEME_STATE_OPTIONS, SUPPORTED_SCHEME_STATES, schemeStateProblem } from "./jurisdictions";

describe("building state", () => {
  it("allows only NSW buildings until other jurisdictions' rules are added", () => {
    expect(SUPPORTED_SCHEME_STATES).toEqual(["NSW"]);
    expect(DEFAULT_SCHEME_STATE).toBe("NSW");
    expect(SCHEME_STATE_OPTIONS).toEqual([{ value: "NSW", label: "New South Wales" }]);
    expect(schemeStateProblem("NSW")).toBeNull();
    expect(schemeStateProblem(" nsw ")).toBeNull();
  });

  it("explains why another state cannot be set up yet", () => {
    for (const s of ["VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"]) {
      expect(schemeStateProblem(s)).toMatch(/supports New South Wales buildings only for now/);
    }
    expect(schemeStateProblem("VIC")).toContain("Victoria");
  });

  it("asks for a state when none or an unknown one is given", () => {
    expect(schemeStateProblem(null)).toBe("Select the state.");
    expect(schemeStateProblem("")).toBe("Select the state.");
    expect(schemeStateProblem("Auckland")).toBe("Select a valid state.");
  });
});
