/**
 * Open redirect protection (F-02, and the S4 security review).
 *
 * The auth callback, the proxy and the MFA pages all use safeNextPath, so
 * these cases test the one real function rather than copies of it.
 */

import { describe, it, expect } from "vitest";
import { safeNextPath } from "./mfa-policy";

describe("safeNextPath, the shared return-to rule", () => {
  it("allows internal paths and keeps the query", () => {
    expect(safeNextPath("/dashboard")).toBe("/dashboard");
    expect(safeNextPath("/adviser/schemes/123")).toBe("/adviser/schemes/123");
    expect(safeNextPath("/owner?tab=finance")).toBe("/owner?tab=finance");
  });

  it("refuses anything that could leave the site", () => {
    const attacks = [
      "//evil.com",
      "///evil.com",
      "https://evil.com",
      "http:evil.com",
      "javascript:alert(1)",
      "/\\evil.com",
      "\\\\evil.com",
      "/\t/evil.com",
      "/\n/evil.com",
      "/\r\n/evil.com",
      " /evil",
      "evil.com",
      "",
    ];
    for (const raw of attacks) expect(safeNextPath(raw), JSON.stringify(raw)).toBeNull();
  });

  it("handles null", () => {
    expect(safeNextPath(null)).toBeNull();
  });

  it("does not keep a fragment", () => {
    expect(safeNextPath("/settings#security")).toBe("/settings");
  });
});
