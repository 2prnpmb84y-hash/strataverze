/**
 * The daily levy notices run lists the switched off schemes that it and the
 * works and compliance runs left alone (31 Oct 2026).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const inactive = vi.hoisted(() => ({ ids: [] as string[] }));
vi.mock("@/lib/schemes/inactive", () => ({ inactiveSchemeIds: async () => inactive.ids }));
vi.mock("@/lib/levies/issue-notices", () => ({ runLevyNoticeDay: async () => ({ recovered: 0, issued: [], resent: 0 }) }));
vi.mock("@/lib/works/daily", () => ({ runWorksDay: async () => ({ interestClosed: 0, quotesClosed: 0 }) }));
vi.mock("@/lib/compliance/daily", () => ({ runComplianceDay: async () => ({ paymentPlanReminders: 0, trainingReminders: 0, annualReportReminders: 0, proceedingsReminders: 0 }) }));
vi.mock("@/lib/log", () => ({ logError: vi.fn() }));

const { GET } = await import("./route");

const request = (authorization?: string) =>
  ({ headers: new Headers(authorization ? { authorization } : {}) }) as unknown as Parameters<typeof GET>[0];

beforeEach(() => {
  inactive.ids = [];
  vi.stubEnv("CRON_SECRET", "s3cret");
});
afterEach(() => vi.unstubAllEnvs());

describe("/api/cron/levy-notices", () => {
  it("lists the switched off schemes it left alone", async () => {
    inactive.ids = ["sp-90001"];
    const res = await GET(request("Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ issued: 0, emailsResent: 0, skippedSchemes: ["sp-90001"] });
  });

  it("lists none when every scheme is active", async () => {
    expect(await (await GET(request("Bearer s3cret"))).json()).toMatchObject({ skippedSchemes: [] });
  });
});
