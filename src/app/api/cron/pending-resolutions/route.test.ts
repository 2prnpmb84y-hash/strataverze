/**
 * The daily pending resolutions run (VIC, ACT and WA stage 2, PR 8b-i,
 * decision D11): only with the cron secret, it decides what is due, and a
 * failure is caught and reported, never thrown. It lists the switched off
 * schemes it left alone.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const settle = vi.fn();
const logError = vi.fn();
vi.mock("@/lib/meetings/pending-repo", () => ({ settleDuePendingResolutions: (...a: unknown[]) => settle(...a) }));
vi.mock("@/lib/log", () => ({ logError: (...a: unknown[]) => logError(...a) }));
const inactive = vi.hoisted(() => ({ ids: [] as string[] }));
vi.mock("@/lib/schemes/inactive", () => ({ inactiveSchemeIds: async () => inactive.ids }));

const { GET } = await import("./route");

const request = (authorization?: string) =>
  ({ headers: new Headers(authorization ? { authorization } : {}) }) as unknown as Parameters<typeof GET>[0];

beforeEach(() => {
  vi.clearAllMocks();
  inactive.ids = [];
  vi.stubEnv("CRON_SECRET", "s3cret");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-30T16:30:00.000Z"));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("/api/cron/pending-resolutions", () => {
  it("refuses a call without the cron secret, deciding nothing", async () => {
    for (const auth of [undefined, "Bearer wrong", "s3cret"]) {
      const res = await GET(request(auth));
      expect(res.status, String(auth)).toBe(401);
    }
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(request("Bearer "))).status).toBe(401);
    expect(settle).not.toHaveBeenCalled();
  });

  it("decides every pending resolution that is due, and reports the counts", async () => {
    settle.mockResolvedValue({ settled: 2, waiting: 3, blocked: [{ id: "p1", blocker: "x" }], failed: 0 });
    const res = await GET(request("Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
    expect(await res.json()).toEqual({ today: "2026-12-01", settled: 2, waiting: 3, blocked: 1, failed: 0, skippedSchemes: [] });
    expect(settle).toHaveBeenCalledWith({}, new Date("2026-11-30T16:30:00.000Z"));
  });

  it("lists the switched off schemes it left alone", async () => {
    inactive.ids = ["sp-90001"];
    settle.mockResolvedValue({ settled: 0, waiting: 0, blocked: [], failed: 0 });
    const res = await GET(request("Bearer s3cret"));
    expect(await res.json()).toMatchObject({ settled: 0, skippedSchemes: ["sp-90001"] });
  });

  it("catches a failure and reports it", async () => {
    settle.mockRejectedValue(new Error("database down"));
    const res = await GET(request("Bearer s3cret"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ today: "2026-12-01", error: "failed" });
    expect(logError).toHaveBeenCalledWith("[cron] pending resolutions failed:", expect.any(Error));
  });
});
