import { createHmac } from "node:crypto";
import { after } from "next/server";
import { headers } from "next/headers";
import { db } from "@/prisma/db";

/**
 * The security audit log (security stage S6, finding SEC-016).
 *
 * recordSecurityEvent appends one event to security_audit_events. The
 * database numbers, timestamps and hash-chains it, and refuses any later
 * change. Writing never throws: a failure is logged to the server log and
 * the user's request carries on.
 *
 * Never put passwords, tokens, codes, bank or card numbers, or request
 * bodies in an event. Metadata is filtered to an allow-list of simple
 * values (see sanitiseMetadata), and IP addresses are stored only as a
 * keyed hash.
 */

export type SecurityOutcome = "allowed" | "denied" | "failed";

export type SecurityEvent = {
  /** Lower case, dotted: "auth.sign_in", "mfa.verify", "access.denied". */
  action: string;
  outcome: SecurityOutcome;
  actorProfileId?: string | null;
  actorAuthId?: string | null;
  actorRole?: string | null;
  schemeId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  /** A short, human reason. Never free text typed by a user that may hold personal details. */
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type RequestContext = { ipHash: string | null; userAgent: string | null; requestId: string | null };

const ACTION = /^[a-z][a-z0-9_.]{1,80}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Metadata keys never stored, whatever the caller passes. */
const FORBIDDEN_KEY = /pass|token|secret|code|otp|bsb|account|bank|card|tfn|abn|email|phone|address|name|body|note|reason|comment/i;
const MAX_KEYS = 20;
const MAX_STRING = 200;

/**
 * Keep only simple values (strings, numbers, booleans, null) under keys that
 * cannot hold secrets or personal details. Strings are cut to 200 characters.
 */
export function sanitiseMetadata(input: Record<string, unknown> | null | undefined): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  if (!input || typeof input !== "object") return out;
  for (const [key, value] of Object.entries(input)) {
    if (Object.keys(out).length >= MAX_KEYS) break;
    if (!/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(key) || FORBIDDEN_KEY.test(key)) continue;
    if (value === null || typeof value === "boolean") out[key] = value;
    else if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "string") out[key] = value.slice(0, MAX_STRING);
  }
  return out;
}

/**
 * The key for hashing IP addresses (and emails of failed sign-ins), so the
 * log can link events from the same source without storing the address.
 * AUDIT_HASH_KEY if set; otherwise derived from the service role key, which
 * is already a server-only secret. Null when neither is set (nothing hashed).
 */
function hashKey(): string | null {
  const explicit = process.env.AUDIT_HASH_KEY;
  if (explicit) return explicit;
  const derived = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return derived ? `strataverze-audit|${derived}` : null;
}

/** A keyed hash of an identifier (IP address, email), or null. */
export function auditHash(value: string | null | undefined): string | null {
  if (!value) return null;
  const key = hashKey();
  if (!key) return null;
  return createHmac("sha256", key).update(value.trim().toLowerCase()).digest("hex").slice(0, 32);
}

/** Request details for an event, from request headers. */
export function contextFromHeaders(h: Headers): RequestContext {
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  return {
    ipHash: auditHash(ip),
    userAgent: h.get("user-agent")?.slice(0, 200) ?? null,
    requestId: h.get("x-vercel-id")?.slice(0, 200) ?? null,
  };
}

async function requestContext(): Promise<RequestContext> {
  try {
    return contextFromHeaders(await headers());
  } catch {
    // Outside a request (a scheduled job, a test).
    return { ipHash: null, userAgent: null, requestId: null };
  }
}

function uuidOrNull(value: string | null | undefined): string | null {
  return value && UUID.test(value) ? value : null;
}

/** Write an event with request details already gathered (the proxy uses this). */
export async function writeSecurityEvent(event: SecurityEvent, context: RequestContext): Promise<void> {
  if (!ACTION.test(event.action)) {
    console.error("[security-audit] refused an invalid action name");
    return;
  }
  try {
    await db.orm.public.SecurityAuditEvent.create({
      actorProfileId: uuidOrNull(event.actorProfileId),
      actorAuthId: uuidOrNull(event.actorAuthId),
      actorRole: event.actorRole?.slice(0, 40) ?? null,
      schemeId: uuidOrNull(event.schemeId),
      action: event.action,
      resourceType: event.resourceType?.slice(0, 80) ?? null,
      resourceId: event.resourceId?.slice(0, 200) ?? null,
      outcome: event.outcome,
      reason: event.reason?.slice(0, 500) ?? null,
      ipHash: context.ipHash,
      userAgent: context.userAgent,
      requestId: context.requestId,
      metadata: sanitiseMetadata(event.metadata) as Parameters<
        typeof db.orm.public.SecurityAuditEvent.create
      >[0]["metadata"],
    });
  } catch (err) {
    // Never break the user's request because the audit write failed, but
    // make it visible.
    console.error("[security-audit] write failed:", event.action, err instanceof Error ? err.name : "error");
  }
}

/** Record an event now (awaits the write). Use for security decisions. */
export async function recordSecurityEvent(event: SecurityEvent): Promise<void> {
  await writeSecurityEvent(event, await requestContext());
}

/**
 * Record an event after the response is sent, so pages are not slowed down.
 * Use for views and other high-volume events. The request details are read
 * now, while they are available.
 */
export async function recordSecurityEventLater(event: SecurityEvent): Promise<void> {
  const context = await requestContext();
  try {
    after(() => writeSecurityEvent(event, context));
  } catch {
    // after() is unavailable outside a request; write straight away.
    await writeSecurityEvent(event, context);
  }
}

const invocationsSeen = new WeakSet<object>();

/**
 * Record that a server action (a write: every form submit and button in the
 * app is one) was authorised for this person, once per request. Called by
 * the authorisation layer, so every Adviser, committee, owner and admin
 * action is in the log with who, which building, their roles and the page,
 * even where the action records no more specific event.
 *
 * Next.js marks a server action request with a Next-Action header; page
 * loads and route handlers are not recorded here.
 */
export async function recordActionInvocation(input: {
  actorProfileId: string;
  actorRole: string;
  schemeId?: string | null;
}): Promise<void> {
  let h: Headers;
  try {
    h = await headers();
  } catch {
    return;
  }
  const actionId = h.get("next-action");
  if (!actionId) return;
  if (invocationsSeen.has(h)) return;
  invocationsSeen.add(h);
  let page: string | null = null;
  try {
    const referer = h.get("referer");
    page = referer ? new URL(referer).pathname.slice(0, 200) : null;
  } catch {
    page = null;
  }
  await recordSecurityEventLater({
    action: "action.authorised",
    outcome: "allowed",
    actorProfileId: input.actorProfileId,
    actorRole: input.actorRole,
    schemeId: input.schemeId ?? null,
    metadata: { actionId: actionId.slice(0, 16), page },
  });
}
