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

describe("building postcode", () => {
  it("accepts New South Wales postcodes and refuses others", async () => {
    const { isNswPostcode } = await import("./jurisdictions");
    for (const p of ["1000", "2000", "2599", "2619", "2620", "2899", "2921", "2999"]) expect(isNswPostcode(p)).toBe(true);
    for (const p of ["0800", "2600", "2618", "2900", "2920", "3000", "4000", "5000", "6000", "7000", "200", "abcd"]) expect(isNswPostcode(p)).toBe(false);
  });

  it("checks a new building's state and postcode", async () => {
    const { schemeLocationProblems } = await import("./jurisdictions");
    expect(schemeLocationProblems({ state: "NSW", postcode: "2000" })).toEqual({});
    expect(schemeLocationProblems({ state: "NSW", postcode: "3000" }).postcode).toMatch(/not a New South Wales postcode/);
    expect(schemeLocationProblems({ state: "VIC", postcode: "3000" })).toEqual({ state: expect.stringContaining("Victoria") });
  });

  it("does not check an unchanged state or postcode again when editing", async () => {
    const { schemeLocationProblems } = await import("./jurisdictions");
    expect(schemeLocationProblems({ state: "NSW", postcode: "3000" }, { state: "NSW", postcode: "3000" })).toEqual({});
    expect(schemeLocationProblems({ state: "VIC", postcode: "3000" }, { state: "VIC", postcode: "3000" })).toEqual({});
    expect(schemeLocationProblems({ state: "nsw", postcode: "3000" }, { state: "NSW", postcode: "3000" })).toEqual({});
    expect(schemeLocationProblems({ state: "NSW", postcode: "3001" }, { state: "NSW", postcode: "3000" }).postcode).toBeDefined();
    expect(schemeLocationProblems({ state: "QLD", postcode: "4000" }, { state: "NSW", postcode: "2000" }).state).toBeDefined();
  });
});
