import { describe, expect, it } from "vitest";
import { PASSWORD_MIN_LENGTH, validatePassword } from "./password-policy";

describe("validatePassword", () => {
  it("requires at least 8 characters", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(validatePassword("Ab1!xyz")).toMatch(/at least 8/);
    expect(validatePassword("Ab1!xyzw")).toBeNull();
  });

  it("requires upper and lower case, a number and a symbol", () => {
    expect(validatePassword("ab1!xyzw")).toMatch(/uppercase/);
    expect(validatePassword("AB1!XYZW")).toMatch(/lowercase/);
    expect(validatePassword("Abc!xyzw")).toMatch(/number/);
    expect(validatePassword("Abc1xyzw")).toMatch(/special/);
  });
});
