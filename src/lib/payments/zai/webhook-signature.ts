/**
 * Verifying a Zai webhook's signature (pure), as Zai documents it in
 * "Verify Webhook Signatures" (https://developer.hellozai.com/docs/verify-webhook-signatures,
 * read 31 Oct 2026):
 *
 * 1. Split the Webhooks-signature header at "," for the t (timestamp) and v
 *    (signature) values.
 * 2. The signed payload is the timestamp, ".", and the request body:
 *    `time + '.' + payload` in the page's Node.js sample.
 * 3. The expected signature is HMAC SHA-256 of it, keyed with the secret_key
 *    set with the webhook secret key API, base64url encoded with no padding
 *    (Node: digest("base64url"); Go: base64.RawURLEncoding).
 * 4. Compare the header's signature(s) with it, in constant time, and check
 *    the timestamp is within the platform's tolerance.
 *
 * Not stated on the page (NOT_CONFIRMED NC-SIG-DETAILS): a literal header
 * example, whether t is seconds (the samples' 10-digit values and Go's
 * time.Now().Unix() say seconds, so seconds are required here), and the
 * tolerance (ZAI_WEBHOOK_TOLERANCE_SECONDS, default 300). A new timestamp and
 * signature are made on every send, retries included, so an old signature is
 * never valid later.
 *
 * The body is verified exactly as received: never parse and re-serialise it
 * first.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** The header, as the page spells it. Header names are case-insensitive. */
export const ZAI_SIGNATURE_HEADER = "Webhooks-signature";

export interface ParsedSignatureHeader {
  timestamp: string;
  signatures: string[];
}

/** The t and v values of the header, or null if it is not in that form. */
export function parseSignatureHeader(header: string | null | undefined): ParsedSignatureHeader | null {
  if (!header || header.length > 2048) return null;
  let timestamp: string | null = null;
  const signatures: string[] = [];
  for (const element of header.split(",")) {
    const at = element.indexOf("=");
    if (at <= 0) return null;
    const key = element.slice(0, at).trim();
    const value = element.slice(at + 1).trim();
    if (key === "t") {
      if (timestamp !== null) return null; // one timestamp only
      timestamp = value;
    } else if (key === "v") {
      if (value) signatures.push(value);
    }
  }
  if (timestamp === null || !/^\d{1,12}$/.test(timestamp) || signatures.length === 0) return null;
  return { timestamp, signatures };
}

/** The expected signature: base64url (no padding) of HMAC SHA-256 over `${timestamp}.${rawBody}`. */
export function expectedSignature(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("base64url");
}

const constantTimeEqual = (a: string, b: string) => {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
};

export type SignatureCheck =
  | { ok: true; signedAt: Date }
  | { ok: false; reason: "NO_SECRET" | "MALFORMED_HEADER" | "TIMESTAMP_OUT_OF_TOLERANCE" | "SIGNATURE_MISMATCH" };

export function verifyZaiSignature(input: {
  header: string | null | undefined;
  rawBody: string;
  secret: string;
  nowSeconds: number;
  toleranceSeconds: number;
}): SignatureCheck {
  if (!input.secret) return { ok: false, reason: "NO_SECRET" };
  const parsed = parseSignatureHeader(input.header);
  if (!parsed) return { ok: false, reason: "MALFORMED_HEADER" };
  const t = Number(parsed.timestamp);
  if (!Number.isSafeInteger(t) || Math.abs(input.nowSeconds - t) > input.toleranceSeconds) {
    return { ok: false, reason: "TIMESTAMP_OUT_OF_TOLERANCE" };
  }
  const expected = expectedSignature(input.secret, parsed.timestamp, input.rawBody);
  // Every signature is compared, so the time taken does not show which one matched.
  let matched = false;
  for (const s of parsed.signatures) matched = constantTimeEqual(expected, s) || matched;
  if (!matched) return { ok: false, reason: "SIGNATURE_MISMATCH" };
  return { ok: true, signedAt: new Date(t * 1000) };
}
