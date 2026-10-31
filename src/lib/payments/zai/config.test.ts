/** The switch and settings: off unless exactly "on" and complete, and only the documented base URLs. */
import { describe, expect, it } from "vitest";
import { requireZaiConfig, zaiConfig, zaiSwitchOn, ZaiDisabledError } from "./config";
import { TEST_ENV } from "./__fixtures__/test-env";

describe("zaiConfig", () => {
  it("is off with no environment, and for anything but exactly 'on'", () => {
    expect(zaiConfig({})).toEqual({ enabled: false, reason: "ZAI_PAYMENTS is not on" });
    for (const v of ["", "true", "1", "ON", "yes", " on"]) expect(zaiSwitchOn({ ...TEST_ENV, ZAI_PAYMENTS: v }), v).toBe(false);
    expect(() => requireZaiConfig({})).toThrow(ZaiDisabledError);
  });

  it("is off in this test run's own environment (no ZAI_ variable is set anywhere)", () => {
    expect(Object.keys(process.env).filter((k) => k.startsWith("ZAI_"))).toEqual([]);
    expect(zaiConfig().enabled).toBe(false);
  });

  it("refuses to run when any setting is missing, naming the setting and never its value", () => {
    for (const name of ["ZAI_ENVIRONMENT", "ZAI_API_BASE_URL", "ZAI_AUTH_TOKEN_URL", "ZAI_CLIENT_ID", "ZAI_CLIENT_SECRET", "ZAI_SCOPE", "ZAI_WEBHOOK_SECRET"]) {
      const env = { ...TEST_ENV, [name]: "" };
      const r = zaiConfig(env);
      expect(r.enabled, name).toBe(false);
      if (!r.enabled) {
        expect(r.reason).toContain(name);
        expect(r.reason).not.toContain("placeholder");
      }
    }
  });

  it("accepts only the core API Zai documents for the environment", () => {
    expect(zaiConfig({ ...TEST_ENV, ZAI_API_BASE_URL: "https://secure.api.promisepay.com" }).enabled).toBe(false);
    expect(zaiConfig({ ...TEST_ENV, ZAI_API_BASE_URL: "https://evil.example.com" }).enabled).toBe(false);
    expect(zaiConfig({ ...TEST_ENV, ZAI_ENVIRONMENT: "live", ZAI_API_BASE_URL: "https://secure.api.promisepay.com" }).enabled).toBe(true);
    expect(zaiConfig({ ...TEST_ENV, ZAI_API_BASE_URL: "https://test.api.promisepay.com/" }).enabled).toBe(true);
  });

  it("requires an https token URL, a webhook secret of 32 ASCII characters, and a sane tolerance", () => {
    expect(zaiConfig({ ...TEST_ENV, ZAI_AUTH_TOKEN_URL: "http://auth.example.test/tokens" }).enabled).toBe(false);
    expect(zaiConfig({ ...TEST_ENV, ZAI_WEBHOOK_SECRET: "x".repeat(31) }).enabled).toBe(false);
    expect(zaiConfig({ ...TEST_ENV, ZAI_WEBHOOK_SECRET: "é".repeat(40) }).enabled).toBe(false);
    expect(zaiConfig({ ...TEST_ENV, ZAI_WEBHOOK_TOLERANCE_SECONDS: "0" }).enabled).toBe(false);
    expect(zaiConfig({ ...TEST_ENV, ZAI_RECEIPT_ACTOR_ID: "not-a-uuid" }).enabled).toBe(false);
    const r = zaiConfig(TEST_ENV);
    expect(r.enabled && r.config.webhookToleranceSeconds).toBe(300);
    expect(r.enabled && r.config.receiptActorId).toBe(null);
    // No default for the receipt's debit account (review M5): unset is null, only BANK is accepted.
    expect(r.enabled && r.config.receiptDebitFrom).toBe(null);
    expect(zaiConfig({ ...TEST_ENV, ZAI_RECEIPT_DEBIT_ACCOUNT: "SUSPENSE" }).enabled).toBe(false);
    const bank = zaiConfig({ ...TEST_ENV, ZAI_RECEIPT_DEBIT_ACCOUNT: "BANK" });
    expect(bank.enabled && bank.config.receiptDebitFrom).toBe("BANK");
  });
});
