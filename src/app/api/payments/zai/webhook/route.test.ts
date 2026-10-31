/**
 * The Zai webhook route: 404 before reading anything while switched off;
 * once on, only Zai's addresses with a verified signature are stored and
 * processed; a failure answers 500 so Zai retries.
 */
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.fn();
const process_ = vi.fn();
const depsFn = vi.fn(() => ({}));
vi.mock("@/prisma/db", () => ({ db: { orm: {} } }));
vi.mock("@/lib/payments/zai/webhook-processor", () => ({
  storeWebhookEvent: (...a: unknown[]) => store(...a),
  processWebhookEvent: (...a: unknown[]) => process_(...a),
}));
vi.mock("@/lib/payments/zai/receipt-in-ledger", () => ({ ledgerProcessorDeps: () => depsFn() }));
vi.mock("@/lib/log", () => ({ logError: vi.fn() }));

const { POST } = await import("./route");
const { TEST_ENV } = await import("@/lib/payments/zai/__fixtures__/test-env");
const { NPP_PAYIN_EXAMPLE } = await import("@/lib/payments/zai/__fixtures__/zai-doc-examples");

const ZAI_PRELIVE_IP = "13.236.213.54";
const NOW = 1_800_000_000;
const rawBody = JSON.stringify(NPP_PAYIN_EXAMPLE);
const sign = (body: string, t = NOW, secret = TEST_ENV.ZAI_WEBHOOK_SECRET) => `t=${t},v=${createHmac("sha256", secret).update(`${t}.${body}`).digest("base64url")}`;

function request(opts: { body?: string; signature?: string | null; ip?: string | null } = {}) {
  const body = opts.body ?? rawBody;
  const headers = new Headers({ "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) });
  if (opts.signature !== null) headers.set("Webhooks-signature", opts.signature ?? sign(body));
  if (opts.ip !== null) headers.set("x-forwarded-for", opts.ip ?? ZAI_PRELIVE_IP);
  const text = vi.fn(async () => body);
  return { req: { headers, text } as unknown as Parameters<typeof POST>[0], text };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW * 1000));
  store.mockResolvedValue({ id: "ev-1", duplicate: false, status: "RECEIVED" });
  process_.mockResolvedValue("PROCESSED");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
const switchOn = () => {
  for (const [k, v] of Object.entries(TEST_ENV)) vi.stubEnv(k, v);
};

describe("switched off", () => {
  it("answers 404 without reading the body or touching the database, however the request looks", async () => {
    for (const value of [undefined, "", "off", "true", "ON"]) {
      if (value !== undefined) vi.stubEnv("ZAI_PAYMENTS", value);
      const { req, text } = request();
      const res = await POST(req);
      expect(res.status, String(value)).toBe(404);
      expect(res.headers.get("cache-control")).toMatch(/no-store/);
      expect(text).not.toHaveBeenCalled();
    }
    expect(store).not.toHaveBeenCalled();
    expect(process_).not.toHaveBeenCalled();
  });

  it("answers 404 when switched on but a setting is missing", async () => {
    switchOn();
    vi.stubEnv("ZAI_WEBHOOK_SECRET", "");
    const { req, text } = request();
    expect((await POST(req)).status).toBe(404);
    expect(text).not.toHaveBeenCalled();
    expect(store).not.toHaveBeenCalled();
  });
});

describe("switched on", () => {
  beforeEach(switchOn);

  it("stores and processes a signed delivery from Zai", async () => {
    const res = await POST(request().req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, duplicate: false });
    expect(store).toHaveBeenCalledWith({}, { rawBody, parsed: expect.objectContaining({ kind: "OBJECT", objectType: "transactions" }), signedAt: new Date(NOW * 1000) });
    expect(process_).toHaveBeenCalledWith("ev-1", {});
  });

  it("refuses an address Zai does not send from, or none", async () => {
    for (const ip of ["203.0.113.9", "13.238.88.233", null]) {
      expect((await POST(request({ ip }).req)).status, String(ip)).toBe(403);
    }
    expect(store).not.toHaveBeenCalled();
  });

  it("refuses a missing, wrong, stale or tampered signature", async () => {
    for (const signature of [null, "t=1,v=x", sign(rawBody, NOW - 301), sign(rawBody, NOW, "another-secret-that-is-32-chars-long!")]) {
      expect((await POST(request({ signature }).req)).status, String(signature)).toBe(401);
    }
    expect((await POST(request({ body: rawBody.replace("10000000", "10000001"), signature: sign(rawBody) }).req)).status).toBe(401);
    expect(store).not.toHaveBeenCalled();
  });

  it("refuses a body that is too large", async () => {
    const big = JSON.stringify({ transactions: { id: "x", pad: "y".repeat(300 * 1024) } });
    expect((await POST(request({ body: big }).req)).status).toBe(413);
    expect(store).not.toHaveBeenCalled();
  });

  it("answers 200 to a finished duplicate without processing it again", async () => {
    store.mockResolvedValue({ id: "ev-1", duplicate: true, status: "PROCESSED" });
    const res = await POST(request().req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, duplicate: true });
    expect(process_).not.toHaveBeenCalled();
  });

  it("answers 500 when processing failed, or storing threw, so Zai retries", async () => {
    process_.mockResolvedValue("FAILED");
    expect((await POST(request().req)).status).toBe(500);
    store.mockRejectedValue(new Error("database down"));
    expect((await POST(request().req)).status).toBe(500);
  });
});
