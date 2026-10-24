import { describe, expect, it } from "vitest";
import { errorSummary, redactText } from "./log";

describe("log hygiene (S7, SEC-026)", () => {
  it("masks email addresses and long numbers", () => {
    expect(redactText("Key (email)=(owner@example.com) already exists, BSB 062-000 acct 12345678, lot 12")).toBe(
      "Key [value] already exists, BSB [number] acct [number], lot 12",
    );
    expect(redactText('invalid input syntax for type uuid: "Jane Citizen, 1 Smith St"')).toBe("invalid input syntax for type uuid: [value]");
    expect(redactText("contact jane@example.com")).toBe("contact [email]");
  });

  it("summarises an error without the object", () => {
    const err = Object.assign(new Error('duplicate key value violates unique constraint "profiles_email_key"'), {
      code: "23505",
      constraint: "profiles_email_key",
      detail: "secret row",
    });
    const s = errorSummary(err);
    expect(s).toMatchObject({ name: "Error", code: "23505", constraint: "profiles_email_key", message: "duplicate key value violates unique constraint [value]" });
    expect(JSON.stringify(s)).not.toContain("secret row");
    expect(errorSummary("text")).toEqual({ type: "string" });
  });
});
