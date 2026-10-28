import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCHEME_STATE,
  isNswPostcode,
  isPostcodeInState,
  isQldPostcode,
  SCHEME_STATE_HELP,
  SCHEME_STATE_OPTIONS,
  SUPPORTED_SCHEME_STATES,
  schemeLocationProblems,
  schemeStateProblem,
} from "./jurisdictions";

describe("building state", () => {
  it("allows NSW and Queensland buildings (Queensland switched on 28 Oct 2026), with NSW first", () => {
    expect(SUPPORTED_SCHEME_STATES).toEqual(["NSW", "QLD"]);
    expect(DEFAULT_SCHEME_STATE).toBe("NSW");
    expect(SCHEME_STATE_OPTIONS).toEqual([
      { value: "NSW", label: "New South Wales" },
      { value: "QLD", label: "Queensland" },
    ]);
    expect(SCHEME_STATE_HELP).toBe("Only New South Wales and Queensland buildings can be set up for now.");
    for (const s of ["NSW", " nsw ", "QLD", " qld "]) expect(schemeStateProblem(s)).toBeNull();
  });

  it("explains why another state cannot be set up yet", () => {
    for (const s of ["VIC", "SA", "WA", "TAS", "NT", "ACT"]) {
      expect(schemeStateProblem(s)).toMatch(/^StrataVerze supports New South Wales and Queensland buildings only for now, so a building in .+ cannot be set up yet\./);
    }
    expect(schemeStateProblem("VIC")).toContain("Victoria");
  });

  it("asks for a state when none or an unknown one is given", () => {
    expect(schemeStateProblem(null)).toBe("Select the state.");
    expect(schemeStateProblem("")).toBe("Select the state.");
    expect(schemeStateProblem("Auckland")).toBe("Select a valid state.");
  });
});

describe("building postcode (ranges decided 27 Oct 2026, from Wikipedia, not yet checked with Australia Post)", () => {
  it("accepts New South Wales postcodes at each end of each range, and refuses the ACT and other states", () => {
    for (const p of ["1000", "2000", "2599", "2619", "2620", "2899", "2921", "2999"]) expect(isNswPostcode(p), p).toBe(true);
    for (const p of ["0999", "0800", "2600", "2618", "2900", "2920", "3000", "4000", "4999", "5000", "6000", "7000", "9000", "200", "20000", "abcd", ""]) expect(isNswPostcode(p), p).toBe(false);
  });

  it("accepts the NSW border postcodes: 2406 (Mungindi, shared) and 4377, 4380, 4383 and 4385, but not their neighbours", () => {
    for (const p of ["2406", "4377", "4380", "4383", "4385"]) expect(isNswPostcode(p), p).toBe(true);
    for (const p of ["4376", "4378", "4379", "4381", "4382", "4384", "4386"]) expect(isNswPostcode(p), p).toBe(false);
  });

  it("accepts Queensland postcodes at each end of each range, and 2406 (Mungindi, shared)", () => {
    for (const p of ["4000", "4377", "4380", "4383", "4385", "4999", "9000", "9999", "2406"]) expect(isQldPostcode(p), p).toBe(true);
    for (const p of ["3999", "5000", "8999", "2405", "2407", "2000", "2599", "0800", "10000", "400", "abcd", ""]) expect(isQldPostcode(p), p).toBe(false);
  });

  it("has no ranges for a state without a pack, so none is checked there", () => {
    expect(isPostcodeInState("VIC", "3000")).toBe(false);
  });

  it("checks a new building's state and postcode", () => {
    expect(schemeLocationProblems({ state: "NSW", postcode: "2000" })).toEqual({});
    expect(schemeLocationProblems({ state: "NSW", postcode: "3000" }).postcode).toBe(
      "3000 is not a New South Wales postcode. Only New South Wales and Queensland buildings can be set up for now. If this building is in New South Wales, check the postcode with StrataVerze.",
    );
    expect(schemeLocationProblems({ state: "NSW", postcode: "4000" }).postcode).toMatch(/^4000 is not a New South Wales postcode\./);
    expect(schemeLocationProblems({ state: "QLD", postcode: "4000" })).toEqual({});
    expect(schemeLocationProblems({ state: "qld", postcode: "9999" })).toEqual({});
    expect(schemeLocationProblems({ state: "QLD", postcode: "2000" }).postcode).toBe(
      "2000 is not a Queensland postcode. Only New South Wales and Queensland buildings can be set up for now. If this building is in Queensland, check the postcode with StrataVerze.",
    );
    expect(schemeLocationProblems({ state: "VIC", postcode: "3000" })).toEqual({ state: expect.stringContaining("Victoria") });
  });

  it("lets a border postcode be saved in either state that uses it", () => {
    expect(schemeLocationProblems({ state: "NSW", postcode: "2406" })).toEqual({});
    expect(schemeLocationProblems({ state: "QLD", postcode: "2406" })).toEqual({});
    for (const p of ["4377", "4380", "4383", "4385"]) {
      expect(schemeLocationProblems({ state: "NSW", postcode: p }), p).toEqual({});
      expect(schemeLocationProblems({ state: "QLD", postcode: p }), p).toEqual({});
    }
  });

  it("leaves a postcode that is not four digits to the form's own check", () => {
    expect(schemeLocationProblems({ state: "QLD", postcode: "400" })).toEqual({});
    expect(schemeLocationProblems({ state: "NSW", postcode: "" })).toEqual({});
  });

  it("does not check an unchanged state or postcode again when editing", () => {
    expect(schemeLocationProblems({ state: "NSW", postcode: "3000" }, { state: "NSW", postcode: "3000" })).toEqual({});
    expect(schemeLocationProblems({ state: "VIC", postcode: "3000" }, { state: "VIC", postcode: "3000" })).toEqual({});
    expect(schemeLocationProblems({ state: "nsw", postcode: "3000" }, { state: "NSW", postcode: "3000" })).toEqual({});
    expect(schemeLocationProblems({ state: "NSW", postcode: "3001" }, { state: "NSW", postcode: "3000" }).postcode).toBeDefined();
    // A move to Queensland is checked as a new location.
    expect(schemeLocationProblems({ state: "QLD", postcode: "4000" }, { state: "NSW", postcode: "2000" })).toEqual({});
    expect(schemeLocationProblems({ state: "QLD", postcode: "2000" }, { state: "NSW", postcode: "2000" }).postcode).toMatch(/not a Queensland postcode/);
    expect(schemeLocationProblems({ state: "VIC", postcode: "3000" }, { state: "NSW", postcode: "2000" }).state).toBeDefined();
  });
});
