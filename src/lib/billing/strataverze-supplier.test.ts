import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/prisma/db", () => ({ db: {} }));

const { STRATAVERZE_SUPPLIER, formatAbn, strataVerzeGstRegistered } = await import("./strataverze-supplier");
const { billingCaptureEnabled } = await import("./capture");

afterEach(() => {
  delete process.env.PLATFORM_BILLING_CAPTURE;
  delete process.env.STRATAVERZE_GST_REGISTERED;
});

describe("StrataVerze supplier details", () => {
  it("uses the ABN Lookup details", () => {
    expect(STRATAVERZE_SUPPLIER.companyName).toBe("StrataVerze Pty Ltd");
    expect(formatAbn(STRATAVERZE_SUPPLIER.abn!)).toBe("25 680 401 450");
  });

  it("is not GST registered until the setting is on", () => {
    expect(strataVerzeGstRegistered({})).toBe(false);
    expect(strataVerzeGstRegistered({ STRATAVERZE_GST_REGISTERED: "on" })).toBe(true);
  });
});

describe("billing capture guard", () => {
  it("records no charges until StrataVerze is registered for GST", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.PLATFORM_BILLING_CAPTURE = "on";
    expect(billingCaptureEnabled()).toBe(false);
    process.env.STRATAVERZE_GST_REGISTERED = "on";
    expect(billingCaptureEnabled()).toBe(true);
  });

  it("stays off when capture is off, whatever the GST setting", () => {
    process.env.STRATAVERZE_GST_REGISTERED = "on";
    expect(billingCaptureEnabled()).toBe(false);
  });
});
