import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * The app root (AR-008, 31 Oct 2026): the old landing page is gone. A
 * signed-out visitor is sent to the public site, a signed-in one to the
 * dashboard. Both are temporary redirects (307, never a cached 308) and are
 * not stored by caches, because the target depends on the session.
 */

const getUser = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: () => getUser(),
      getSession: async () => ({ data: { session: { access_token: "t" } } }),
      signOut: async () => ({}),
    },
  }),
}));
const loadSessionState = vi.fn();
vi.mock("@/lib/auth/session-state", () => ({ loadSessionState: (...a: unknown[]) => loadSessionState(...a) }));
vi.mock("@/lib/audit/security-audit", () => ({ contextFromHeaders: () => ({}) }));
vi.mock("@/lib/audit/page-views", () => ({ recordPageView: vi.fn() }));
vi.mock("@/lib/audit/view-audit", () => ({
  canonicalUuid: () => null,
  isPrefetch: () => false,
  viewTargetFor: () => null,
}));

const { proxy, config } = await import("./proxy");

const request = (path: string) => new NextRequest(new URL(path, "https://app.strataverze.com"));

beforeEach(() => {
  getUser.mockReset();
  loadSessionState.mockReset();
});

describe("the app root", () => {
  it("sends a signed-out visitor to the public site with a temporary redirect", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await proxy(request("/"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://www.strataverze.com/");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("sends a signed-in person to the dashboard with a temporary redirect", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "a1" } } });
    loadSessionState.mockResolvedValue({ kind: "active", session: { profile: {} } });
    const res = await proxy(request("/?utm_source=x"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app.strataverze.com/dashboard");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("treats a session that has ended as signed out", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "a1" } } });
    loadSessionState.mockResolvedValue({ kind: "ended", reason: "idle" });
    const res = await proxy(request("/"));
    expect(res.headers.get("location")).toBe("https://www.strataverze.com/");
  });

  it("leaves the sign-in and public pages to load as before", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    for (const path of ["/login", "/auth/callback", "/forgot-password", "/reset-password", "/contractors", "/privacy", "/terms"]) {
      const res = await proxy(request(path));
      expect(res.headers.get("location"), path).toBeNull();
    }
    // Portal pages, including /mfa and /invitations, still go to sign-in.
    for (const path of ["/mfa", "/invitations", "/dashboard"]) {
      const res = await proxy(request(path));
      expect(new URL(res.headers.get("location")!).pathname, path).toBe("/login");
    }
  });
});

describe("the proxy matcher", () => {
  const matcher = new RegExp(`^${config.matcher[0]}$`);
  it("lets robots.txt through untouched, and matches the root", () => {
    expect(matcher.test("/robots.txt")).toBe(false);
    expect(matcher.test("/")).toBe(true);
    expect(matcher.test("/login")).toBe(true);
  });
});
