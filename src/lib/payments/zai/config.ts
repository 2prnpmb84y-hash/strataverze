/**
 * The Zai switch and settings, read from the environment only.
 *
 * ZAI_PAYMENTS must be exactly "on". It is off everywhere: no environment
 * sets it, and switching it on is gated on the assessment's conditions (the
 * legal opinion on trust money, Zai approving stored value and sub-wallets,
 * sandbox access, and KYB for owners corporations) and on migration 20261128
 * being applied. While it is off nothing in src/lib/payments/zai reads the
 * database or calls Zai, and the webhook route answers 404.
 *
 * Even with the switch on, every setting must be present and valid, or the
 * integration refuses to run (zaiConfig returns { enabled: false }). None of
 * these variables exists yet, and no credential is ever written in code.
 *
 * - ZAI_ENVIRONMENT: "prelive" or "live".
 * - ZAI_API_BASE_URL: the core API, which must be the one Zai documents for
 *   that environment: https://test.api.promisepay.com (pre-live) or
 *   https://secure.api.promisepay.com (live) (environments guide and API
 *   overview, read 31 Oct 2026).
 * - ZAI_AUTH_TOKEN_URL: the OAuth2 token endpoint. The docs say the
 *   authentication URLs are in the Zai Dashboard (API overview), so only an
 *   https URL is checked (NOT_CONFIRMED NC-AUTH-URL).
 * - ZAI_CLIENT_ID, ZAI_CLIENT_SECRET, ZAI_SCOPE: the client credentials from
 *   the Dashboard (API overview: Platform Profile, Reveal).
 * - ZAI_WEBHOOK_SECRET: the secret_key set with Zai's webhook secret key API,
 *   which must be ASCII and at least 32 bytes (verify webhook signatures,
 *   read 31 Oct 2026).
 * - ZAI_WEBHOOK_TOLERANCE_SECONDS (optional, default 300): how old a
 *   signature's timestamp may be. Zai leaves the tolerance to the platform.
 * - ZAI_RECEIPT_ACTOR_ID (optional): the profile automatic receipts are
 *   recorded by. Without it no payment is receipted automatically: matched
 *   payments wait for a person (decision D5 in the design).
 */
import { ZAI_DOCS } from "./docs";

export type ZaiEnvironment = "prelive" | "live";

/** The core API base URL Zai documents for each environment (environments guide, read 31 Oct 2026). */
export const ZAI_CORE_API_BASE_URLS: Record<ZaiEnvironment, string> = {
  prelive: "https://test.api.promisepay.com",
  live: "https://secure.api.promisepay.com",
};

/**
 * The addresses Zai sends callbacks and webhooks from (callbacks guide and
 * best practices for webhooks, read 31 Oct 2026). Checked as well as the
 * signature, where the request's address is known.
 */
export const ZAI_SENDER_IPS: Record<ZaiEnvironment, readonly string[]> = {
  prelive: ["13.236.213.54", "13.237.52.66", "13.237.231.88", "54.183.18.207", "54.183.142.227"],
  live: ["13.238.88.233", "13.238.89.179", "13.238.80.244", "54.183.18.207", "54.183.142.227"],
};

export const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300;

export interface ZaiConfig {
  environment: ZaiEnvironment;
  apiBaseUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope: string;
  webhookSecret: string;
  webhookToleranceSeconds: number;
  receiptActorId: string | null;
}

export type ZaiConfigResult = { enabled: true; config: ZaiConfig } | { enabled: false; reason: string };

type Env = Record<string, string | undefined>;

/** Whether the switch is on. Only the exact value "on" counts. */
export function zaiSwitchOn(env: Env = process.env): boolean {
  return env.ZAI_PAYMENTS === "on";
}

const isHttpsUrl = (v: string) => {
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
};

/**
 * The settings, or why the integration must not run. The reason names the
 * setting, never its value.
 */
export function zaiConfig(env: Env = process.env): ZaiConfigResult {
  if (!zaiSwitchOn(env)) return { enabled: false, reason: "ZAI_PAYMENTS is not on" };
  const environment = env.ZAI_ENVIRONMENT;
  if (environment !== "prelive" && environment !== "live") return { enabled: false, reason: "ZAI_ENVIRONMENT must be prelive or live" };
  const apiBaseUrl = (env.ZAI_API_BASE_URL ?? "").replace(/\/+$/, "");
  if (apiBaseUrl !== ZAI_CORE_API_BASE_URLS[environment]) {
    return { enabled: false, reason: `ZAI_API_BASE_URL must be the ${environment} core API Zai documents (${ZAI_DOCS.environments})` };
  }
  const tokenUrl = env.ZAI_AUTH_TOKEN_URL ?? "";
  if (!isHttpsUrl(tokenUrl)) return { enabled: false, reason: "ZAI_AUTH_TOKEN_URL must be an https URL" };
  for (const name of ["ZAI_CLIENT_ID", "ZAI_CLIENT_SECRET", "ZAI_SCOPE"] as const) {
    if (!env[name]?.trim()) return { enabled: false, reason: `${name} is not set` };
  }
  const webhookSecret = env.ZAI_WEBHOOK_SECRET ?? "";
  // "must be ASCII characters and at least 32 bytes in size" (verify webhook signatures).
  if (webhookSecret.length < 32 || !/^[\x20-\x7e]+$/.test(webhookSecret)) {
    return { enabled: false, reason: "ZAI_WEBHOOK_SECRET must be at least 32 ASCII characters" };
  }
  const toleranceRaw = env.ZAI_WEBHOOK_TOLERANCE_SECONDS;
  const webhookToleranceSeconds = toleranceRaw === undefined || toleranceRaw === "" ? DEFAULT_WEBHOOK_TOLERANCE_SECONDS : Number(toleranceRaw);
  if (!Number.isInteger(webhookToleranceSeconds) || webhookToleranceSeconds < 1 || webhookToleranceSeconds > 3600) {
    return { enabled: false, reason: "ZAI_WEBHOOK_TOLERANCE_SECONDS must be a whole number of seconds from 1 to 3600" };
  }
  const actor = env.ZAI_RECEIPT_ACTOR_ID?.trim() || null;
  if (actor && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actor)) {
    return { enabled: false, reason: "ZAI_RECEIPT_ACTOR_ID must be a profile id (a uuid)" };
  }
  return {
    enabled: true,
    config: {
      environment,
      apiBaseUrl,
      tokenUrl,
      clientId: env.ZAI_CLIENT_ID!.trim(),
      clientSecret: env.ZAI_CLIENT_SECRET!,
      scope: env.ZAI_SCOPE!.trim(),
      webhookSecret,
      webhookToleranceSeconds,
      receiptActorId: actor,
    },
  };
}

export class ZaiDisabledError extends Error {
  readonly code = "ZAI_DISABLED";
  constructor(reason: string) {
    super(`Zai payments are switched off: ${reason}.`);
    this.name = "ZaiDisabledError";
  }
}

/** The settings, or throw ZaiDisabledError. Every Zai entry point calls this first. */
export function requireZaiConfig(env: Env = process.env): ZaiConfig {
  const result = zaiConfig(env);
  if (!result.enabled) throw new ZaiDisabledError(result.reason);
  return result.config;
}
