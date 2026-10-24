import { describe, expect, it } from "vitest";
import { bearerMatches, secretMatches } from "./secret-compare";

describe("secretMatches (S7, SEC-027)", () => {
  it("matches only the exact secret", () => {
    expect(secretMatches("abc", "abc")).toBe(true);
    expect(secretMatches("abd", "abc")).toBe(false);
    expect(secretMatches("abcd", "abc")).toBe(false);
    expect(secretMatches(null, "abc")).toBe(false);
    expect(secretMatches("", "")).toBe(false);
  });

  it("checks a bearer header", () => {
    expect(bearerMatches("Bearer s3cret", "s3cret")).toBe(true);
    expect(bearerMatches("bearer s3cret", "s3cret")).toBe(false);
    expect(bearerMatches("Bearer s3cret", undefined)).toBe(false);
    expect(bearerMatches(null, "s3cret")).toBe(false);
  });
});
