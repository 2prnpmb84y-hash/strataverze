import { describe, expect, it } from "vitest";
import { CAPABILITIES, rolesAllow, rolesFor } from "@/config/permissions";
import { AuthorisationError } from "./require-membership";
import { assertBelongsTo, assertInScheme, assertOneOf, inScheme } from "./scheme-scope";

const A = "aaaaaaaa-0000-0000-0000-000000000001";
const B = "bbbbbbbb-0000-0000-0000-000000000002";

describe("scheme scope", () => {
  it("accepts a record from the authorised scheme", () => {
    expect(inScheme({ schemeId: A }, A)).toBe(true);
    expect(() => assertInScheme({ schemeId: A }, A, "Lot")).not.toThrow();
  });

  it("rejects a record from another scheme with the same message as a missing one", () => {
    expect(inScheme({ schemeId: B }, A)).toBe(false);
    expect(() => assertInScheme({ schemeId: B }, A, "Lot")).toThrow("Lot not found.");
    expect(() => assertInScheme(null, A, "Lot")).toThrow("Lot not found.");
    expect(() => assertInScheme({ schemeId: B }, A)).toThrow(AuthorisationError);
  });

  it("rejects an empty scheme id", () => {
    expect(inScheme({ schemeId: "" }, "")).toBe(false);
  });

  it("checks parent links and allowed values", () => {
    expect(() => assertBelongsTo("m1", "m1")).not.toThrow();
    expect(() => assertBelongsTo("m2", "m1", "Motion")).toThrow("Motion not found.");
    expect(() => assertBelongsTo(null, "m1")).toThrow();
    expect(() => assertOneOf("FOR", ["FOR", "AGAINST"] as const, "vote")).not.toThrow();
    expect(() => assertOneOf("MAYBE", ["FOR", "AGAINST"] as const, "vote")).toThrow("Invalid vote.");
  });
});

describe("permissions matrix", () => {
  it("keeps finance and member management with advisers", () => {
    expect(rolesFor("finance.write")).toEqual(["ADVISER"]);
    expect(rolesFor("members.manage")).toEqual(["ADVISER"]);
  });

  it("gives accountants read-only works and finance access", () => {
    expect(rolesAllow(["ACCOUNTANT"], "finance.read")).toBe(true);
    expect(rolesAllow(["ACCOUNTANT"], "works.read")).toBe(true);
    expect(rolesAllow(["ACCOUNTANT"], "finance.write")).toBe(false);
    expect(rolesAllow(["ACCOUNTANT"], "works.manage")).toBe(false);
    expect(rolesAllow(["ACCOUNTANT"], "works.payments")).toBe(false);
  });

  it("never gives suppliers scheme-wide capabilities", () => {
    for (const roles of Object.values(CAPABILITIES)) {
      expect(roles as readonly string[]).not.toContain("SUPPLIER");
    }
  });

  it("limits owner voting to owners, committee voting to committee", () => {
    expect(rolesFor("governance.vote.owner")).toEqual(["OWNER"]);
    expect(rolesFor("governance.vote.committee")).toEqual(["COMMITTEE"]);
  });
});
