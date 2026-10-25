import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** CAPTCHA on sign-in, sign-up and password reset (SEC-020). */

const calls = vi.hoisted(() => ({ signIn: [] as unknown[], reset: [] as unknown[], error: null as null | { code?: string; message: string } }));
const limits = vi.hoisted(() => ({ hits: 0 }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error("redirect"), { to });
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signInWithPassword: async (c: unknown) => {
        calls.signIn.push(c);
        return { data: {}, error: calls.error };
      },
      resetPasswordForEmail: async (email: string, o: unknown) => {
        calls.reset.push([email, o]);
        return { error: calls.error };
      },
    },
  }),
}));
vi.mock("@/lib/auth/rate-limit-db", () => ({
  anyRateLimitReached: async () => false,
  clientIp: () => "203.0.113.9",
  recordRateLimitHits: async () => {
    limits.hits++;
  },
}));
vi.mock("@/lib/audit/security-audit", () => ({ auditHash: () => "h", recordSecurityEventLater: vi.fn(async () => {}) }));
vi.mock("@/prisma/db", () => ({ db: {} }));
vi.mock("@/lib/queries/profiles", () => ({ getAvailablePortals: async () => [] }));

const { captchaSiteKey, captchaTokenFrom, isCaptchaFailure } = await import("./captcha");
const { login } = await import("@/app/login/actions");
const { resetPassword } = await import("@/app/forgot-password/actions");

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
const redirectOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return (e as { to?: string }).to;
  }
  return null;
};

beforeEach(() => {
  calls.signIn = [];
  calls.reset = [];
  calls.error = null;
  limits.hits = 0;
});
afterEach(() => vi.unstubAllEnvs());

describe("the CAPTCHA settings", () => {
  it("shows the check only with a plausible site key", () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    expect(captchaSiteKey()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "0x4AAAAAAABkMYinukE8nzY");
    expect(captchaSiteKey()).toBe("0x4AAAAAAABkMYinukE8nzY");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "<script>");
    expect(captchaSiteKey()).toBeNull();
  });

  it("reads the token from the form, and recognises Supabase's refusal", () => {
    expect(captchaTokenFrom(form({ "cf-turnstile-response": " tok " }))).toBe("tok");
    expect(captchaTokenFrom(form({}))).toBeUndefined();
    expect(captchaTokenFrom(form({ "cf-turnstile-response": "x".repeat(3000) }))).toBeUndefined();
    expect(isCaptchaFailure({ code: "captcha_failed" })).toBe(true);
    expect(isCaptchaFailure({ message: "captcha protection: request disallowed (no-captcha-token)" })).toBe(true);
    expect(isCaptchaFailure({ code: "invalid_credentials", message: "Invalid login credentials" })).toBe(false);
  });
});

describe("signing in", () => {
  it("passes the token to Supabase, and sends nothing extra without one", async () => {
    await redirectOf(login(form({ email: "a@x.test", password: "secret123", "cf-turnstile-response": "tok" })));
    await redirectOf(login(form({ email: "a@x.test", password: "secret123" })));
    expect(calls.signIn).toEqual([
      { email: "a@x.test", password: "secret123", options: { captchaToken: "tok" } },
      { email: "a@x.test", password: "secret123" },
    ]);
  });

  it("a failed check is not counted as a wrong password", async () => {
    calls.error = { code: "captcha_failed", message: "captcha protection: request disallowed" };
    const to = await redirectOf(login(form({ email: "a@x.test", password: "secret123" })));
    expect(to).toContain("security%20check");
    expect(limits.hits).toBe(0);
  });
});

describe("resetting a password", () => {
  it("passes the token, and a failed check sends nothing and counts nothing", async () => {
    await redirectOf(resetPassword(form({ email: "a@x.test", "cf-turnstile-response": "tok" })));
    expect(calls.reset[0]).toEqual(["a@x.test", expect.objectContaining({ captchaToken: "tok" })]);
    expect(limits.hits).toBe(1);
    calls.error = { code: "captcha_failed", message: "captcha" };
    const to = await redirectOf(resetPassword(form({ email: "a@x.test" })));
    expect(to).toContain("/forgot-password?error=");
    expect(limits.hits).toBe(1);
  });
});
