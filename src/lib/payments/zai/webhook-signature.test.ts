/**
 * Webhook signatures, as "Verify Webhook Signatures" documents them (read
 * 31 Oct 2026), with the page's own sample values. The page gives no
 * expected signature, so the expected value is the page's Node.js sample
 * run here: crypto.createHmac('sha256', secret).update(time + '.' + payload).digest("base64url").
 */
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { expectedSignature, parseSignatureHeader, verifyZaiSignature } from "./webhook-signature";
import { SIGNATURE_SAMPLE } from "./__fixtures__/zai-doc-examples";

const { secret, timestamp, payload } = SIGNATURE_SAMPLE;
const pageSample = (s: string, time: string, body: string) => createHmac("sha256", s).update(time + "." + body).digest("base64url");
const now = Number(timestamp) + 10;

describe("expectedSignature", () => {
  it("is the page's Node.js sample: HMAC SHA-256 of t.body, base64url without padding", () => {
    const sig = expectedSignature(secret, timestamp, payload);
    expect(sig).toBe(pageSample(secret, timestamp, payload));
    expect(sig).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes, no "=", no "+" or "/"
  });
});

describe("parseSignatureHeader", () => {
  it("splits at ',' then '=' for t and one or more v", () => {
    expect(parseSignatureHeader(`t=${timestamp},v=abc`)).toEqual({ timestamp, signatures: ["abc"] });
    expect(parseSignatureHeader(`t=${timestamp},v=abc,v=def`)).toEqual({ timestamp, signatures: ["abc", "def"] });
    // base64url never has "=" but a value is split at the first "=" only.
    expect(parseSignatureHeader(`t=${timestamp}, v=a=b`)).toEqual({ timestamp, signatures: ["a=b"] });
  });

  it("refuses a header that is missing, malformed, without a signature, or with two timestamps", () => {
    for (const h of [null, "", "garbage", `v=abc`, `t=${timestamp}`, `t=abc,v=x`, `t=1,t=2,v=x`, `t=${timestamp},=x`]) {
      expect(parseSignatureHeader(h), String(h)).toBeNull();
    }
  });
});

describe("verifyZaiSignature", () => {
  const header = `t=${timestamp},v=${pageSample(secret, timestamp, payload)}`;

  it("accepts the right signature over the raw body, within the tolerance", () => {
    expect(verifyZaiSignature({ header, rawBody: payload, secret, nowSeconds: now, toleranceSeconds: 300 })).toEqual({ ok: true, signedAt: new Date(Number(timestamp) * 1000) });
    // Any one of several signatures may match.
    const two = `t=${timestamp},v=${"A".repeat(43)},v=${pageSample(secret, timestamp, payload)}`;
    expect(verifyZaiSignature({ header: two, rawBody: payload, secret, nowSeconds: now, toleranceSeconds: 300 }).ok).toBe(true);
  });

  it("refuses a changed body, a re-serialised body, another secret or a signature for another time", () => {
    const check = (h: string, body: string, s = secret) => verifyZaiSignature({ header: h, rawBody: body, secret: s, nowSeconds: now, toleranceSeconds: 300 });
    expect(check(header, '{"event": "status_changed"}')).toEqual({ ok: false, reason: "SIGNATURE_MISMATCH" });
    expect(check(header, JSON.stringify(JSON.parse(payload)))).toEqual({ ok: false, reason: "SIGNATURE_MISMATCH" });
    expect(check(header, payload, "another-secret")).toEqual({ ok: false, reason: "SIGNATURE_MISMATCH" });
    expect(check(`t=${Number(timestamp) + 1},v=${pageSample(secret, timestamp, payload)}`, payload)).toEqual({ ok: false, reason: "SIGNATURE_MISMATCH" });
  });

  it("refuses a timestamp outside the tolerance, either way", () => {
    const at = (n: number) => verifyZaiSignature({ header, rawBody: payload, secret, nowSeconds: n, toleranceSeconds: 300 });
    expect(at(Number(timestamp) + 300).ok).toBe(true);
    expect(at(Number(timestamp) + 301)).toEqual({ ok: false, reason: "TIMESTAMP_OUT_OF_TOLERANCE" });
    expect(at(Number(timestamp) - 301)).toEqual({ ok: false, reason: "TIMESTAMP_OUT_OF_TOLERANCE" });
  });

  it("refuses everything without a secret or a header", () => {
    expect(verifyZaiSignature({ header, rawBody: payload, secret: "", nowSeconds: now, toleranceSeconds: 300 })).toEqual({ ok: false, reason: "NO_SECRET" });
    expect(verifyZaiSignature({ header: null, rawBody: payload, secret, nowSeconds: now, toleranceSeconds: 300 })).toEqual({ ok: false, reason: "MALFORMED_HEADER" });
  });
});
