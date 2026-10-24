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
  /** Keep only these metadata keys (used for mirrored activity). */
  metadataKeys?: ReadonlySet<string>;
};

export type RequestContext = { ipHash: string | null; userAgent: string | null; requestId: string | null };

const ACTION = /^[a-z][a-z0-9_.]{1,80}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Metadata keys never stored, whatever the caller passes. */
const FORBIDDEN_KEY = /pass|token|secret|code|otp|bsb|account|bank|card|tfn|abn|email|phone|address|name|body|note|reason|comment|title|description|pattern|reference|policy|message|text|search|query/i;
const MAX_KEYS = 20;
const MAX_STRING = 200;

/**
 * String values must look like an identifier, a code, a date, an amount or
 * a path: letters, digits and _ . : / - only, with no spaces. Names,
 * titles, descriptions and other free text therefore never reach the log.
 */
const TOKEN_VALUE = /^[A-Za-z0-9_.:/-]{1,200}$/;

/**
 * Keep only simple values (numbers, booleans, null, and token-like strings)
 * under keys that cannot hold secrets or personal details. When `allowKeys`
 * is given, only those keys are kept.
 */
export function sanitiseMetadata(
  input: Record<string, unknown> | null | undefined,
  allowKeys?: ReadonlySet<string>,
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  if (!input || typeof input !== "object") return out;
  for (const [key, value] of Object.entries(input)) {
    if (Object.keys(out).length >= MAX_KEYS) break;
    if (!/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(key) || FORBIDDEN_KEY.test(key)) continue;
    if (allowKeys && !allowKeys.has(key)) continue;
    if (value === null || typeof value === "boolean") out[key] = value;
    else if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "string" && TOKEN_VALUE.test(value.slice(0, MAX_STRING))) out[key] = value.slice(0, MAX_STRING);
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

/**
 * The signed-in person for the current request, noted by getCurrentSession,
 * so events raised deep inside a helper (a cross-building refusal, say) can
 * name who made the request without being passed it.
 */
const actorByRequest = new WeakMap<object, { profileId: string; authId: string }>();

export async function noteRequestActor(actor: { profileId: string; authId: string }): Promise<void> {
  try {
    actorByRequest.set(await headers(), actor);
  } catch {
    // Outside a request.
  }
}

async function requestActor(): Promise<{ profileId: string; authId: string } | null> {
  try {
    return actorByRequest.get(await headers()) ?? null;
  } catch {
    return null;
  }
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

/**
 * Events from people who are not signed in (failed sign-ins and the like)
 * are capped per source, so a flood of attempts cannot fill the log, which
 * keeps every row for 7 years. Past the cap, one event a minute records how
 * many were held back. Per server instance, like the login limiter.
 */
const anonymousBursts = new Map<string, { windowStart: number; count: number; heldBack: number; lastSummary: number }>();
const ANON_WINDOW_MS = 10 * 60 * 1000;
const ANON_MAX_PER_WINDOW = 20;

export function anonymousEventAllowed(sourceKey: string, nowMs: number = Date.now()): { write: boolean; heldBack: number } {
  let b = anonymousBursts.get(sourceKey);
  if (!b || nowMs - b.windowStart > ANON_WINDOW_MS) {
    b = { windowStart: nowMs, count: 0, heldBack: 0, lastSummary: 0 };
    anonymousBursts.set(sourceKey, b);
    if (anonymousBursts.size > 5000) anonymousBursts.clear();
  }
  b.count += 1;
  if (b.count <= ANON_MAX_PER_WINDOW) return { write: true, heldBack: 0 };
  b.heldBack += 1;
  if (nowMs - b.lastSummary >= 60_000) {
    const heldBack = b.heldBack;
    b.heldBack = 0;
    b.lastSummary = nowMs;
    return { write: true, heldBack };
  }
  return { write: false, heldBack: 0 };
}

/** Write an event with request details already gathered (the proxy uses this). */
export async function writeSecurityEvent(event: SecurityEvent, context: RequestContext): Promise<void> {
  if (!ACTION.test(event.action)) {
    console.error("[security-audit] refused an invalid action name");
    return;
  }
  if (!event.actorProfileId && !event.actorAuthId) {
    const gate = anonymousEventAllowed(`${context.ipHash ?? "unknown"}|${event.action}`);
    if (!gate.write) return;
    if (gate.heldBack > 0) event = { ...event, metadata: { ...(event.metadata ?? {}), heldBack: gate.heldBack } };
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
      metadata: sanitiseMetadata(event.metadata, event.metadataKeys) as Parameters<
        typeof db.orm.public.SecurityAuditEvent.create
      >[0]["metadata"],
    });
  } catch (err) {
    // Never break the user's request because the audit write failed, but
    // make it visible.
    console.error("[security-audit] write failed:", event.action, err instanceof Error ? err.name : "error");
  }
}

async function withActor(event: SecurityEvent): Promise<SecurityEvent> {
  if (event.actorProfileId || event.actorAuthId) return event;
  const actor = await requestActor();
  return actor ? { ...event, actorProfileId: actor.profileId, actorAuthId: actor.authId } : event;
}

/** Record an event now (awaits the write). Use for security decisions. */
export async function recordSecurityEvent(event: SecurityEvent): Promise<void> {
  await writeSecurityEvent(await withActor(event), await requestContext());
}

/**
 * Record an event after the response is sent, so pages are not slowed down.
 * Use for views and other high-volume events. The request details are read
 * now, while they are available.
 */
export async function recordSecurityEventLater(event: SecurityEvent): Promise<void> {
  event = await withActor(event);
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
