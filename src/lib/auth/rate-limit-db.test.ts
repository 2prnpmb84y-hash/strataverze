import { beforeEach, describe, expect, it, vi } from "vitest";

/** Database-backed rate limits (S7, SEC-020). */
vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("@/lib/audit/security-audit", () => ({ auditHash: (v: string) => `h${v.length}x${Buffer.from(v).toString("hex")}`.slice(0, 120) }));
// Each test sees a fresh in-memory limiter, so only the database counts.
vi.mock("./rate-limit", () => ({ rateLimit: () => ({ success: true, remaining: 1, resetMs: 0 }) }));

const { sharedFake } = await import("@/test/fake-orm");
const { hitRateLimit, hitRateLimits, RATE_LIMITS } = await import("./rate-limit-db");
const rows = () => (sharedFake as unknown as { tables: Record<string, Record<string, unknown>[]> }).tables.RateLimitHit ?? [];

beforeEach(() => sharedFake.reset({ RateLimitHit: [] }));

describe("hitRateLimit", () => {
  it("allows up to the limit in the window, then refuses, across instances", async () => {
    const now = Date.parse("2026-10-23T10:00:00Z");
    const results = [];
    for (let i = 0; i < RATE_LIMITS.mfaVerify.limit + 2; i++) results.push(await hitRateLimit("mfaVerify", "user-1", now + i));
    expect(results).toEqual([true, true, true, true, true, false, false]);
    // Another person is unaffected.
    expect(await hitRateLimit("mfaVerify", "user-2", now)).toBe(true);
  });

  it("forgets attempts older than the window", async () => {
    const now = Date.parse("2026-10-23T10:00:00Z");
    for (let i = 0; i < 5; i++) await hitRateLimit("mfaVerify", "user-1", now - RATE_LIMITS.mfaVerify.windowMs - 1000);
    expect(await hitRateLimit("mfaVerify", "user-1", now)).toBe(true);
  });

  it("never stores the subject in the clear", async () => {
    await hitRateLimit("signIn", "1.2.3.4|owner@example.com");
    expect(JSON.stringify(rows())).not.toContain("owner@example.com");
  });

  it("lets the request through when the database cannot be reached", async () => {
    const spy = vi.spyOn(sharedFake.db.orm.public.RateLimitHit, "create").mockRejectedValueOnce(new Error("down"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await hitRateLimit("search", "p1")).toBe(true);
    spy.mockRestore();
    log.mockRestore();
  });
});

describe("hitRateLimits", () => {
  it("refuses when any limit is reached, and counts every limit", async () => {
    for (let i = 0; i < RATE_LIMITS.signIn.limit; i++) {
      expect(await hitRateLimits([["signIn", "ip|a@example.com"], ["signInAddress", "ip"]])).toBe(true);
    }
    expect(await hitRateLimits([["signIn", "ip|a@example.com"], ["signInAddress", "ip"]])).toBe(false);
    // A different account from the same address is still allowed.
    expect(await hitRateLimits([["signIn", "ip|b@example.com"], ["signInAddress", "ip"]])).toBe(true);
    expect(rows()).toHaveLength(14);
  });
});

describe("rateLimitReached and recordRateLimitHits (count failures only)", () => {
  it("does not count a check, only a recorded failure", async () => {
    const { rateLimitReached, recordRateLimitHits, anyRateLimitReached } = await import("./rate-limit-db");
    const now = Date.parse("2026-10-23T10:00:00Z");
    for (let i = 0; i < 10; i++) expect(await rateLimitReached("signIn", "ip|a@example.com", now)).toBe(false);
    expect(rows()).toHaveLength(0);
    for (let i = 0; i < RATE_LIMITS.signIn.limit; i++) await recordRateLimitHits([["signIn", "ip|a@example.com"]], now);
    expect(await rateLimitReached("signIn", "ip|a@example.com", now)).toBe(true);
    expect(await anyRateLimitReached([["signIn", "ip|b@example.com"], ["signInAddress", "ip"]])).toBe(false);
  });

  it("skips a limit with no subject (no IP address) rather than sharing one bucket", async () => {
    const { rateLimitReached, recordRateLimitHits } = await import("./rate-limit-db");
    await recordRateLimitHits([["signInAddress", null]]);
    expect(rows()).toHaveLength(0);
    expect(await rateLimitReached("signInAddress", null)).toBe(false);
  });
});
