import { describe, expect, it } from "vitest";
import { errorSummary, redactText } from "./log";

describe("log hygiene (S7, SEC-026)", () => {
  it("masks email addresses and long numbers", () => {
    expect(redactText('Key (email)=(owner@example.com) already exists, BSB 062-000 acct 12345678, lot 12')).toBe(
      "Key (email)=([email]) already exists, BSB [number] acct [number], lot 12",
    );
  });

  it("summarises an error without the object", () => {
    const err = Object.assign(new Error("duplicate key owner@example.com"), { code: "23505", detail: "secret row" });
    const s = errorSummary(err);
    expect(s).toMatchObject({ name: "Error", code: "23505", message: "duplicate key [email]" });
    expect(JSON.stringify(s)).not.toContain("secret row");
    expect(errorSummary("text")).toEqual({ type: "string" });
  });
});
