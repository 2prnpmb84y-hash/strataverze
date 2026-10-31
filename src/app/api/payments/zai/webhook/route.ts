import { NextResponse, type NextRequest } from "next/server";
import { NO_STORE } from "@/lib/http/no-store";
import { logError } from "@/lib/log";
import { db } from "@/prisma/db";
import { ZAI_SENDER_IPS, zaiConfig } from "@/lib/payments/zai/config";
import { ZAI_SIGNATURE_HEADER, verifyZaiSignature } from "@/lib/payments/zai/webhook-signature";
import { parseZaiWebhook } from "@/lib/payments/zai/webhook-payload";
import { processWebhookEvent, storeWebhookEvent } from "@/lib/payments/zai/webhook-processor";
import { ledgerProcessorDeps } from "@/lib/payments/zai/receipt-in-ledger";

/**
 * Zai webhooks (switched off).
 *
 * While ZAI_PAYMENTS is off, or any Zai setting is missing, every request is
 * answered 404 before its body is read, and nothing touches the database.
 *
 * Once on, a request is accepted only if it comes from an address Zai sends
 * from (callbacks guide, read 31 Oct 2026) and its Webhooks-signature header
 * verifies against the raw body (verify webhook signatures, read
 * 31 Oct 2026; ./webhook-signature.ts). Then the raw body is stored once
 * (a repeated delivery is the same row) and processed in an order-safe way
 * (src/lib/payments/zai/webhook-processor.ts). 200 tells Zai it is done; a
 * failure answers 500 so Zai retries (for up to 24 hours, webhooks guide), and
 * the retry processes the stored event again.
 *
 * Zai documents only that the URL is https and accepts POST, and that the
 * listener returns "the proper response status code".
 */
export const maxDuration = 60;

/** Zai's payloads are single objects; anything far larger is refused before it is read. */
const MAX_BODY_BYTES = 256 * 1024;

const reply = (status: number, body: Record<string, unknown> | string) =>
  typeof body === "string" ? new NextResponse(body, { status, headers: NO_STORE }) : NextResponse.json(body, { status, headers: NO_STORE });

/** The address the request came from, as the platform's proxy gives it. */
function senderAddress(headers: Headers): string | null {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || null;
}

export async function POST(request: NextRequest) {
  const cfg = zaiConfig();
  if (!cfg.enabled) return reply(404, "Not Found");
  const { config } = cfg;

  const address = senderAddress(request.headers);
  if (!address || !ZAI_SENDER_IPS[config.environment].includes(address)) return reply(403, "Forbidden");
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declared) || declared > MAX_BODY_BYTES) return reply(413, "Payload Too Large");
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) return reply(413, "Payload Too Large");

  const check = verifyZaiSignature({
    header: request.headers.get(ZAI_SIGNATURE_HEADER),
    rawBody,
    secret: config.webhookSecret,
    nowSeconds: Math.floor(Date.now() / 1000),
    toleranceSeconds: config.webhookToleranceSeconds,
  });
  if (!check.ok) return reply(401, "Unauthorized");

  try {
    const parsed = parseZaiWebhook(rawBody);
    const stored = await storeWebhookEvent(db.orm, { rawBody, parsed, signedAt: check.signedAt });
    if (stored.status === "IGNORED" || stored.status === "PROCESSED" || stored.status === "STALE") {
      return reply(200, { received: true, duplicate: stored.duplicate });
    }
    const outcome = await processWebhookEvent(stored.id, ledgerProcessorDeps());
    if (outcome === "FAILED") return reply(500, { received: true, processed: false });
    return reply(200, { received: true, duplicate: stored.duplicate });
  } catch (err) {
    logError("[zai] webhook failed:", err);
    return reply(500, { received: false });
  }
}
