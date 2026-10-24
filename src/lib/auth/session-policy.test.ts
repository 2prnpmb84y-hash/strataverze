import { describe, expect, it } from "vitest";
import {
  authenticatedAtFromClaims,
  LAST_SEEN_WRITE_INTERVAL_MS,
  SESSION_LIMITS,
  sessionEndMessage,
  sessionVerdict,
} from "./session-policy";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const now = Date.UTC(2026, 9, 23, 12, 0, 0);

function verdict(over: Partial<Parameters<typeof sessionVerdict>[0]>) {
  return sessionVerdict({
    nowMs: now,
    privileged: false,
    authenticatedAtMs: now - HOUR,
    lastSeenAtMs: now - 5 * MIN,
    revokedAtMs: null,
    revokedBeforeMs: null,
    ...over,
  });
}

describe("approved limits", () => {
  it("are 30 minutes and 12 hours for privileged users, 4 hours and 14 days for everyone else", () => {
    expect(SESSION_LIMITS.privileged).toEqual({ idleMs: 30 * MIN, absoluteMs: 12 * HOUR });
    expect(SESSION_LIMITS.standard).toEqual({ idleMs: 4 * HOUR, absoluteMs: 14 * DAY });
  });
});

describe("sessionVerdict", () => {
  it("lets an active session continue", () => {
    expect(verdict({})).toEqual({ ok: true, touch: true });
  });

  it("records activity at most once a minute", () => {
    expect(verdict({ lastSeenAtMs: now - LAST_SEEN_WRITE_INTERVAL_MS + 1 })).toEqual({ ok: true, touch: false });
  });

  it("ends a privileged session idle for more than 30 minutes, but not an owner's", () => {
    expect(verdict({ privileged: true, lastSeenAtMs: now - 31 * MIN })).toEqual({ ok: false, reason: "idle" });
    expect(verdict({ privileged: true, lastSeenAtMs: now - 29 * MIN }).ok).toBe(true);
    expect(verdict({ privileged: false, lastSeenAtMs: now - 31 * MIN }).ok).toBe(true);
  });

  it("ends an owner's session idle for more than 4 hours", () => {
    expect(verdict({ lastSeenAtMs: now - 4 * HOUR - 1 })).toEqual({ ok: false, reason: "idle" });
  });

  it("ends a privileged session 12 hours after sign-in, even if active", () => {
    expect(verdict({ privileged: true, authenticatedAtMs: now - 12 * HOUR - 1, lastSeenAtMs: now - MIN })).toEqual({
      ok: false,
      reason: "absolute",
    });
  });

  it("ends an owner's session 14 days after sign-in, even if active", () => {
    expect(verdict({ authenticatedAtMs: now - 14 * DAY - 1, lastSeenAtMs: now - MIN })).toEqual({
      ok: false,
      reason: "absolute",
    });
    expect(verdict({ authenticatedAtMs: now - 13 * DAY, lastSeenAtMs: now - MIN }).ok).toBe(true);
  });

  it("ends a revoked session", () => {
    expect(verdict({ revokedAtMs: now - 1 })).toEqual({ ok: false, reason: "revoked" });
  });

  it("ends a session that signed in before sign out everywhere, but not one after", () => {
    expect(verdict({ authenticatedAtMs: now - HOUR, revokedBeforeMs: now - MIN })).toEqual({
      ok: false,
      reason: "revoked",
    });
    expect(verdict({ authenticatedAtMs: now - MIN, revokedBeforeMs: now - HOUR }).ok).toBe(true);
  });

  it("compares sign-in and revocation in whole seconds (amr timestamps are seconds)", () => {
    const revoked = now - 10_000 + 700; // 0.7 s into a second
    const signedInSameSecond = Math.floor(revoked / 1000) * 1000; // amr rounds down
    expect(verdict({ authenticatedAtMs: signedInSameSecond, revokedBeforeMs: revoked }).ok).toBe(false);
    expect(verdict({ authenticatedAtMs: signedInSameSecond + 1000, revokedBeforeMs: revoked }).ok).toBe(true);
  });
});

describe("authenticatedAtFromClaims", () => {
  it("uses the earliest amr timestamp, in milliseconds", () => {
    expect(
      authenticatedAtFromClaims({
        amr: [
          { method: "totp", timestamp: 1_800_000_500 },
          { method: "password", timestamp: 1_800_000_000 },
        ],
      }),
    ).toBe(1_800_000_000_000);
  });

  it("returns null without usable amr entries", () => {
    expect(authenticatedAtFromClaims(null)).toBeNull();
    expect(authenticatedAtFromClaims({ amr: ["password"] })).toBeNull();
    expect(authenticatedAtFromClaims({ amr: [{ method: "password", timestamp: "x" }] })).toBeNull();
  });
});

describe("sessionEndMessage", () => {
  it("gives fixed text for known reasons only", () => {
    expect(sessionEndMessage("idle")).toMatch(/inactive/);
    expect(sessionEndMessage("everywhere")).toMatch(/every device/);
    expect(sessionEndMessage("<script>")).toBeNull();
  });
});
