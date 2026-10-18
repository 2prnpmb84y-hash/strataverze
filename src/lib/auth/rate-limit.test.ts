import { describe, it, expect, vi, beforeEach } from "vitest";
import { rateLimit, authRateLimit } from "./rate-limit";

describe("rateLimit", () => {
  beforeEach(() => {
    // Reset the module to clear the in-memory store between tests
    vi.resetModules();
  });

  it("allows requests within the limit", async () => {
    // Reimport to get a fresh store
    const { rateLimit: rl } = await import("./rate-limit");

    const result = rl("test-key-1", 5, 60_000);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("decrements remaining count on successive calls", async () => {
    const { rateLimit: rl } = await import("./rate-limit");

    rl("test-key-2", 5, 60_000);
    rl("test-key-2", 5, 60_000);
    const result = rl("test-key-2", 5, 60_000);

    expect(result.success).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it("blocks requests exceeding the limit", async () => {
    const { rateLimit: rl } = await import("./rate-limit");
    const key = "test-key-3";

    // Exhaust the limit
    for (let i = 0; i < 5; i++) {
      rl(key, 5, 60_000);
    }

    const result = rl(key, 5, 60_000);
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.resetMs).toBeGreaterThan(0);
  });

  it("uses separate counters per key", async () => {
    const { rateLimit: rl } = await import("./rate-limit");

    // Exhaust one key
    for (let i = 0; i < 3; i++) {
      rl("key-a", 3, 60_000);
    }

    // Different key should still be allowed
    const result = rl("key-b", 3, 60_000);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it("resets after the window expires", async () => {
    const { rateLimit: rl } = await import("./rate-limit");
    const key = "test-key-4";

    // Use a tiny window (1ms) and wait for it to pass
    for (let i = 0; i < 3; i++) {
      rl(key, 3, 1);
    }

    // After a small wait, the window should have expired
    await new Promise((resolve) => setTimeout(resolve, 5));

    const result = rl(key, 3, 1);
    expect(result.success).toBe(true);
  });
});

describe("authRateLimit", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("allows first request", async () => {
    const { authRateLimit: arl } = await import("./rate-limit");
    const result = arl("user@example.com");
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(4); // 5 max - 1 used
  });

  it("blocks after 5 attempts", async () => {
    const { authRateLimit: arl } = await import("./rate-limit");
    const email = "blocked@example.com";

    for (let i = 0; i < 5; i++) {
      arl(email);
    }

    const result = arl(email);
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });
});
