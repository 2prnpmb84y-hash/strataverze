import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Server-side MFA enforcement: getCurrentProfile sends users who need MFA to
 * enrol or verify, and sensitive operations need a check within 15 minutes.
 */

const session = vi.fn();
vi.mock("./current-session", () => ({ getCurrentSession: () => session() }));
const memberships = vi.fn();
vi.mock("@/prisma/db", () => ({
  db: { orm: { public: { SchemeMembership: { where: () => ({ limit: () => ({ all: memberships }) }) } } } },
}));
vi.mock("@prisma/orm-postgres/orm-client", () => ({ and: (...c: unknown[]) => c }));
const redirect = vi.fn((to: string) => {
  throw new Error(`REDIRECT ${to}`);
});
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));
// React's cache() would memoise across tests; run the function each time.
vi.mock("react", async () => ({ ...(await vi.importActual<object>("react")), cache: (fn: unknown) => fn }));

const { enforceMfa, requireRecentMfa, StepUpRequiredError } = await import("./mfa-enforcement");

const now = Math.floor(Date.now() / 1000);
function makeSession(opts: { admin?: boolean; factors?: number; aal?: string; totpAgo?: number | null }) {
  return {
    user: { id: "auth-1" },
    profile: { id: "p1", isPlatformAdmin: !!opts.admin },
    assurance: {
      aal: opts.aal ?? "aal1",
      lastTotpAt: opts.totpAgo == null ? null : now - opts.totpAgo,
      sessionId: "s1",
    },
    verifiedFactors: Array.from({ length: opts.factors ?? 0 }, (_, i) => ({ id: `f${i}` })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  memberships.mockResolvedValue([]);
});

describe("enforceMfa", () => {
  it("sends a platform admin without an authenticator to set one up", async () => {
    session.mockResolvedValue(makeSession({ admin: true }));
    await expect(enforceMfa()).rejects.toThrow("REDIRECT /mfa/setup");
  });

  it("sends an adviser without an authenticator to set one up", async () => {
    session.mockResolvedValue(makeSession({}));
    memberships.mockResolvedValue([{ role: "ADVISER", isActive: true }]);
    await expect(enforceMfa()).rejects.toThrow("REDIRECT /mfa/setup");
  });

  it("asks an enrolled user with a password-only session to verify (a password reset does not bypass it)", async () => {
    session.mockResolvedValue(makeSession({ admin: true, factors: 1, aal: "aal1" }));
    await expect(enforceMfa()).rejects.toThrow("REDIRECT /mfa");
  });

  it("lets a verified session through", async () => {
    session.mockResolvedValue(makeSession({ admin: true, factors: 1, aal: "aal2", totpAgo: 30 }));
    await expect(enforceMfa()).resolves.toBeUndefined();
  });

  it("lets an owner without an authenticator through", async () => {
    session.mockResolvedValue(makeSession({}));
    memberships.mockResolvedValue([{ role: "OWNER", isActive: true }]);
    await expect(enforceMfa()).resolves.toBeUndefined();
  });

  it("does nothing when signed out", async () => {
    session.mockResolvedValue(null);
    await expect(enforceMfa()).resolves.toBeUndefined();
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("requireRecentMfa", () => {
  it("passes a check within the last 15 minutes", async () => {
    session.mockResolvedValue(makeSession({ admin: true, factors: 1, aal: "aal2", totpAgo: 600 }));
    await expect(requireRecentMfa()).resolves.toBeUndefined();
  });

  it("refuses an older check, even at aal2", async () => {
    session.mockResolvedValue(makeSession({ admin: true, factors: 1, aal: "aal2", totpAgo: 1000 }));
    await expect(requireRecentMfa()).rejects.toBeInstanceOf(StepUpRequiredError);
  });

  it("refuses a mandatory user with no authenticator", async () => {
    session.mockResolvedValue(makeSession({}));
    memberships.mockResolvedValue([{ role: "PAYMENT_AUTHORISER", isActive: true }]);
    await expect(requireRecentMfa()).rejects.toBeInstanceOf(StepUpRequiredError);
  });

  it("refuses when signed out", async () => {
    session.mockResolvedValue(null);
    await expect(requireRecentMfa()).rejects.toThrow(/signed in/);
  });
});

describe("getCurrentProfile fails closed", () => {
  it("enforces MFA on the session it returns, even if a later lookup comes back empty", async () => {
    // First lookup: an admin with a password-only session. Any later lookup: signed out.
    session.mockResolvedValueOnce(makeSession({ admin: true, factors: 1, aal: "aal1" })).mockResolvedValue(null);
    const { getCurrentProfile } = await import("@/lib/queries/profiles");
    await expect(getCurrentProfile()).rejects.toThrow("REDIRECT /mfa");
  });
});
