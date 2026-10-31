/**
 * The daily platform invoices run lists the switched off schemes it left
 * alone (31 Oct 2026), whether or not invoicing is on.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const inactive = vi.hoisted(() => ({ ids: [] as string[] }));
vi.mock("@/lib/schemes/inactive", () => ({ inactiveSchemeIds: async () => inactive.ids }));
vi.mock("@/lib/storage/uploads", () => ({ removeExpiredUploads: async () => 0 }));
vi.mock("@/lib/billing/contractor-fees", () => ({ accrueComplianceRenewals: async () => ({ charged: 0 }) }));
vi.mock("@/lib/billing/strataverze-supplier", () => ({ strataVerzeGstRegistered: () => true }));
vi.mock("@/lib/billing/invoice-run", () => ({
  runMonthlyInvoices: async () => [{ schemeId: "sp-90001", outcome: "SKIPPED", reason: "Scheme switched off" }],
  notifyIssuedInvoices: async () => {},
}));

const { GET } = await import("./route");

const request = (authorization: string) =>
  ({ headers: new Headers({ authorization }), nextUrl: new URL("https://example.test/api/cron/platform-invoices") }) as unknown as Parameters<typeof GET>[0];

beforeEach(() => {
  inactive.ids = ["sp-90001"];
  vi.stubEnv("CRON_SECRET", "s3cret");
});
afterEach(() => vi.unstubAllEnvs());

describe("/api/cron/platform-invoices", () => {
  it("lists the switched off schemes while invoicing is off", async () => {
    vi.stubEnv("PLATFORM_INVOICING", "");
    expect(await (await GET(request("Bearer s3cret"))).json()).toEqual({ complianceRenewals: 0, invoicing: "PLATFORM_INVOICING is not on", skippedSchemes: ["sp-90001"] });
  });

  it("lists them, and reports them as skipped, when invoicing", async () => {
    vi.stubEnv("PLATFORM_INVOICING", "on");
    expect(await (await GET(request("Bearer s3cret"))).json()).toMatchObject({
      issued: 0,
      skipped: [{ schemeId: "sp-90001", outcome: "SKIPPED", reason: "Scheme switched off" }],
      skippedSchemes: ["sp-90001"],
    });
  });
});
