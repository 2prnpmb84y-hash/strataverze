import { describe, expect, it } from "vitest";
import {
  assuranceFromClaims,
  decodeJwtPayload,
  mfaGate,
  mfaMandatory,
  recentlyVerified,
  safeNextPath,
  STEP_UP_SECONDS,
} from "./mfa-policy";

describe("mfaMandatory", () => {
  it("applies to platform admins and the privileged scheme roles", () => {
    expect(mfaMandatory(true, [])).toBe(true);
    for (const role of ["ADVISER", "ACCOUNTANT", "PAYMENT_AUTHORISER"]) {
      expect(mfaMandatory(false, [{ role, isActive: true }])).toBe(true);
    }
    expect(mfaMandatory(false, [{ role: "COMMITTEE", isActive: true, isTreasurer: true }])).toBe(true);
  });

  it("does not apply to owners, committee members or suppliers, or to ended memberships", () => {
    expect(mfaMandatory(false, [{ role: "OWNER", isActive: true }])).toBe(false);
    expect(mfaMandatory(false, [{ role: "COMMITTEE", isActive: true, isTreasurer: false }])).toBe(false);
    expect(mfaMandatory(false, [{ role: "SUPPLIER", isActive: true }])).toBe(false);
    expect(mfaMandatory(false, [{ role: "ADVISER", isActive: false }])).toBe(false);
  });
});

describe("mfaGate", () => {
  it("sends a mandatory user with no authenticator to enrol", () => {
    expect(mfaGate({ mandatory: true, verifiedFactorCount: 0, aal: "aal1" })).toBe("enrol");
  });

  it("asks anyone with an authenticator to verify an aal1 session, mandatory or not", () => {
    expect(mfaGate({ mandatory: true, verifiedFactorCount: 1, aal: "aal1" })).toBe("verify");
    expect(mfaGate({ mandatory: false, verifiedFactorCount: 1, aal: "aal1" })).toBe("verify");
    expect(mfaGate({ mandatory: true, verifiedFactorCount: 1, aal: null })).toBe("verify");
  });

  it("lets verified sessions and optional users without an authenticator through", () => {
    expect(mfaGate({ mandatory: true, verifiedFactorCount: 1, aal: "aal2" })).toBe("ok");
    expect(mfaGate({ mandatory: false, verifiedFactorCount: 0, aal: "aal1" })).toBe("ok");
  });
});

describe("assurance and step-up", () => {
  const now = 1_800_000_000;

  it("reads the level and the latest TOTP time from the claims", () => {
    const a = assuranceFromClaims({
      aal: "aal2",
      session_id: "s1",
      amr: [
        { method: "password", timestamp: now - 3000 },
        { method: "totp", timestamp: now - 100 },
        { method: "totp", timestamp: now - 2000 },
      ],
    });
    expect(a).toEqual({ aal: "aal2", lastTotpAt: now - 100, sessionId: "s1" });
  });

  it("accepts the mfa/totp method name too", () => {
    const a = assuranceFromClaims({ aal: "aal2", amr: [{ method: "mfa/totp", timestamp: now - 5 }] });
    expect(a.lastTotpAt).toBe(now - 5);
  });

  it("ignores string-form amr and missing claims", () => {
    expect(assuranceFromClaims({ aal: "aal1", amr: ["password"] }).lastTotpAt).toBeNull();
    expect(assuranceFromClaims(null)).toEqual({ aal: null, lastTotpAt: null, sessionId: null });
  });

  it("needs aal2 and a TOTP check within 15 minutes", () => {
    expect(STEP_UP_SECONDS).toBe(900);
    expect(recentlyVerified({ aal: "aal2", lastTotpAt: now - 899, sessionId: null }, now)).toBe(true);
    expect(recentlyVerified({ aal: "aal2", lastTotpAt: now - 901, sessionId: null }, now)).toBe(false);
    expect(recentlyVerified({ aal: "aal1", lastTotpAt: now - 10, sessionId: null }, now)).toBe(false);
    expect(recentlyVerified({ aal: "aal2", lastTotpAt: null, sessionId: null }, now)).toBe(false);
    // A timestamp in the future (clock games) does not count.
    expect(recentlyVerified({ aal: "aal2", lastTotpAt: now + 3600, sessionId: null }, now)).toBe(false);
  });
});

describe("decodeJwtPayload", () => {
  it("decodes a base64url payload", () => {
    const payload = Buffer.from(JSON.stringify({ sub: "u1", aal: "aal2" })).toString("base64url");
    expect(decodeJwtPayload(`x.${payload}.y`)).toEqual({ sub: "u1", aal: "aal2" });
  });

  it("returns null for anything malformed", () => {
    expect(decodeJwtPayload(null)).toBeNull();
    expect(decodeJwtPayload("not-a-jwt")).toBeNull();
    expect(decodeJwtPayload("a.%%%.b")).toBeNull();
  });
});

describe("safeNextPath", () => {
  it("keeps internal paths, including the audit export download", () => {
    expect(safeNextPath("/settings")).toBe("/settings");
    expect(safeNextPath("/api/finance/audit-export?schemeId=x&year=2026")).toBe("/api/finance/audit-export?schemeId=x&year=2026");
  });

  it("rejects external, protocol-relative and MFA loop targets", () => {
    for (const bad of [
      "https://evil.example",
      "//evil.example",
      "/\\evil",
      "javascript:alert(1)",
      "/mfa",
      "/mfa?next=/x",
      "/mfa/other",
      // Browsers drop tabs and newlines, so these would become //evil.example.
      "/\t/evil.example",
      "/\n/evil.example",
      "/\r//evil.example",
      "/%09/evil.example".replace("%09", "\t"),
      "/\u0000x",
    ]) {
      expect(safeNextPath(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it("allows returning to the setup page to add a second authenticator", () => {
    expect(safeNextPath("/mfa/setup")).toBe("/mfa/setup");
  });

  it("normalises dot segments without leaving the site", () => {
    expect(safeNextPath("/a/../settings")).toBe("/settings");
    expect(safeNextPath("/./settings")).toBe("/settings");
  });
});
