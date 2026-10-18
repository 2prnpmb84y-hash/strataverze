import { describe, it, expect } from "vitest";
import { validatePasswordStrength } from "./password-strength";

describe("validatePasswordStrength", () => {
  it("returns all requirements unmet for empty string", () => {
    const result = validatePasswordStrength("");
    expect(result.score).toBe(0);
    expect(result.allMet).toBe(false);
    expect(result.label).toBe("Too weak");
    expect(result.requirements.every((r) => !r.met)).toBe(true);
  });

  it("detects minimum length requirement", () => {
    const short = validatePasswordStrength("Aa1!");
    expect(short.requirements[0].met).toBe(false); // < 8 chars

    const long = validatePasswordStrength("Aa1!xxxx");
    expect(long.requirements[0].met).toBe(true); // >= 8 chars
  });

  it("detects uppercase letter requirement", () => {
    const noUpper = validatePasswordStrength("abcdefgh");
    expect(noUpper.requirements[1].met).toBe(false);

    const hasUpper = validatePasswordStrength("Abcdefgh");
    expect(hasUpper.requirements[1].met).toBe(true);
  });

  it("detects lowercase letter requirement", () => {
    const noLower = validatePasswordStrength("ABCDEFGH");
    expect(noLower.requirements[2].met).toBe(false);

    const hasLower = validatePasswordStrength("ABCDEFGh");
    expect(hasLower.requirements[2].met).toBe(true);
  });

  it("detects number requirement", () => {
    const noNum = validatePasswordStrength("Abcdefgh");
    expect(noNum.requirements[3].met).toBe(false);

    const hasNum = validatePasswordStrength("Abcdefg1");
    expect(hasNum.requirements[3].met).toBe(true);
  });

  it("detects special character requirement", () => {
    const noSpecial = validatePasswordStrength("Abcdefg1");
    expect(noSpecial.requirements[4].met).toBe(false);

    const hasSpecial = validatePasswordStrength("Abcdefg!");
    expect(hasSpecial.requirements[4].met).toBe(true);
  });

  it("returns score 5 and allMet for a strong password", () => {
    const result = validatePasswordStrength("MyP@ss1!");
    expect(result.score).toBe(5);
    expect(result.allMet).toBe(true);
    expect(result.label).toBe("Strong");
  });

  it("returns correct labels for each score level", () => {
    // Score 0: Too weak
    expect(validatePasswordStrength("").label).toBe("Too weak");

    // Score 1: Weak (meets length requirement only)
    expect(validatePasswordStrength("aaaaaaaa").label).toBe("Weak");

    // Score 2: Weak (meets length + uppercase)
    expect(validatePasswordStrength("aaaaaaaA").label).toBe("Weak");

    // Score 3: Fair
    expect(validatePasswordStrength("aaaaaaA1").label).toBe("Fair");

    // Score 4: Good
    expect(validatePasswordStrength("aaaaaA1!").label).toBe("Good");

    // Score 5: Strong
    expect(validatePasswordStrength("aaaaAA1!").label).toBe("Strong");
  });

  it("has exactly 5 requirements", () => {
    const result = validatePasswordStrength("test");
    expect(result.requirements).toHaveLength(5);
  });

  it("handles unicode and special characters", () => {
    const result = validatePasswordStrength("Pässwörd1!");
    expect(result.allMet).toBe(true);
  });

  it("treats spaces as meeting the special character requirement", () => {
    const result = validatePasswordStrength("Pass 1234");
    expect(result.requirements[4].met).toBe(true); // space is non-alphanumeric
  });
});
