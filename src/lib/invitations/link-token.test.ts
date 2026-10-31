import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashLinkToken, invitationExpiry, maskEmail, newLinkToken, INVITATION_TTL_DAYS } from "./link-token";

describe("invitation link tokens (S2a)", () => {
  it("are 256-bit base64url tokens, stored only as their SHA-256", () => {
    const { token, hash } = newLinkToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(hash).not.toContain(token);
    expect(hashLinkToken(token)).toBe(hash);
  });

  it("are different every time", () => {
    const seen = new Set(Array.from({ length: 200 }, () => newLinkToken().token));
    expect(seen.size).toBe(200);
  });

  it("accept a token with the fragment's # still on it", () => {
    const { token, hash } = newLinkToken();
    expect(hashLinkToken(`#${token}`)).toBe(hash);
  });

  it("refuse anything that is not a token, so it is never looked up", () => {
    for (const bad of ["", "abc", "x".repeat(44), "a".repeat(42) + "!", "' OR 1=1 --", null, undefined, 42, {}]) {
      expect(hashLinkToken(bad)).toBeNull();
    }
    // A stored hash is not a token: reading the table gives no working link.
    const { hash } = newLinkToken();
    expect(hashLinkToken(hash)).toBeNull();
  });

  it("expire after 14 days", () => {
    const now = new Date("2026-11-02T00:00:00Z");
    expect(INVITATION_TTL_DAYS).toBe(14);
    expect(invitationExpiry(now).toISOString()).toBe("2026-11-16T00:00:00.000Z");
  });

  it("show the address masked", () => {
    expect(maskEmail("jane.citizen@example.com")).toBe("ja***@ex***.com");
    expect(maskEmail("a@b.co")).toBe("a***@b***.co");
  });
});
