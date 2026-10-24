import { describe, expect, it } from "vitest";
import { authPageError, authPageMessage, GENERIC_AUTH_ERROR } from "./page-messages";
import { validatePassword } from "./password-policy";

describe("auth page messages (S7)", () => {
  it("shows only fixed texts", () => {
    expect(authPageError("Invalid email or password")).toBe("Invalid email or password");
    expect(authPageError("Your account is locked. Call 1800 000 000 to unlock it.")).toBe(GENERIC_AUTH_ERROR);
    expect(authPageError(undefined)).toBeUndefined();
    expect(authPageMessage("Call us on 1800 000 000")).toBeUndefined();
    expect(authPageMessage("Check your email to confirm your account")).toBe("Check your email to confirm your account");
  });

  it("knows every password rule message", () => {
    for (const p of ["short", "alllowercase1!", "ALLUPPERCASE1!", "NoDigits!!", "NoSymbol123"]) {
      const message = validatePassword(p);
      expect(message).not.toBeNull();
      expect(authPageError(message)).toBe(message);
    }
  });
});
