/**
 * Multi-factor authentication policy (security stage S4, finding SEC-010).
 * Pure, so the rules can be unit tested.
 *
 * Mandatory: StrataVerze platform admins, and anyone holding an Adviser,
 * Accountant or Payment Authoriser role, or the treasurer office, on any
 * scheme. Everyone else may enrol; once they have, they must use it too.
 *
 * Enforcement is on the server (see mfa-enforcement.ts): a user who needs
 * MFA but whose session is only at assurance level aal1 cannot load any page
 * or run any action until they verify. A password reset or a new sign-in
 * gives an aal1 session, so neither bypasses MFA.
 */

/** Scheme roles that must use MFA. */
export const MFA_REQUIRED_ROLES = ["ADVISER", "ACCOUNTANT", "PAYMENT_AUTHORISER"] as const;

/** How recent an authenticator check must be for a sensitive operation. */
export const STEP_UP_SECONDS = 15 * 60;

/** Most authenticators a user may enrol (a second one is the recovery route). */
export const MAX_TOTP_FACTORS = 2;

export type MembershipForMfa = {
  role: string;
  isActive: boolean;
  isTreasurer?: boolean | null;
};

/** Whether the user must use MFA, from their profile flag and active memberships. */
export function mfaMandatory(
  isPlatformAdmin: boolean | null | undefined,
  memberships: readonly MembershipForMfa[],
): boolean {
  if (isPlatformAdmin) return true;
  return memberships.some(
    (m) =>
      m.isActive &&
      ((MFA_REQUIRED_ROLES as readonly string[]).includes(m.role) || (m.role === "COMMITTEE" && !!m.isTreasurer)),
  );
}

export type SessionAssurance = {
  /** "aal1" after a password, link or code sign-in; "aal2" after an authenticator check. */
  aal: string | null;
  /** Unix seconds of the most recent authenticator (TOTP) check in this session, if any. */
  lastTotpAt: number | null;
  /** The Supabase session id. */
  sessionId: string | null;
};

type AmrEntry = { method?: string; timestamp?: number } | string;

/** AMR method names Supabase uses for an authenticator app check (auth-js lists both). */
const TOTP_AMR_METHODS: readonly string[] = ["totp", "mfa/totp"];

/** Read the assurance level and the last TOTP time from access token claims. */
export function assuranceFromClaims(claims: Record<string, unknown> | null | undefined): SessionAssurance {
  if (!claims) return { aal: null, lastTotpAt: null, sessionId: null };
  const amr = Array.isArray(claims.amr) ? (claims.amr as AmrEntry[]) : [];
  const totpTimes = amr
    .filter((e): e is { method?: string; timestamp?: number } => typeof e === "object" && e !== null)
    .filter((e) => TOTP_AMR_METHODS.includes(e.method ?? "") && typeof e.timestamp === "number")
    .map((e) => e.timestamp as number);
  return {
    aal: typeof claims.aal === "string" ? claims.aal : null,
    lastTotpAt: totpTimes.length ? Math.max(...totpTimes) : null,
    sessionId: typeof claims.session_id === "string" ? claims.session_id : null,
  };
}

/**
 * Decode a JWT payload without verifying it. Only use this on a token the
 * Auth server has just accepted (getCurrentProfile calls getUser with the
 * same session token first).
 */
export function decodeJwtPayload(token: string | null | undefined): Record<string, unknown> | null {
  if (!token) return null;
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const value = JSON.parse(json);
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export type MfaGate = "ok" | "enrol" | "verify";

/**
 * What the user must do before using the app:
 *   "enrol"  MFA is mandatory and they have no verified authenticator;
 *   "verify" they have an authenticator but this session is not at aal2;
 *   "ok"     nothing.
 */
export function mfaGate(input: {
  mandatory: boolean;
  verifiedFactorCount: number;
  aal: string | null;
}): MfaGate {
  if (input.verifiedFactorCount === 0) return input.mandatory ? "enrol" : "ok";
  return input.aal === "aal2" ? "ok" : "verify";
}

/** Whether the session's last authenticator check is recent enough for a sensitive operation. */
export function recentlyVerified(
  assurance: SessionAssurance,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  maxAgeSeconds: number = STEP_UP_SECONDS,
): boolean {
  if (assurance.aal !== "aal2" || assurance.lastTotpAt == null) return false;
  return nowSeconds - assurance.lastTotpAt <= maxAgeSeconds && assurance.lastTotpAt <= nowSeconds + 60;
}

/** MFA pages that may be returned to after verifying (adding a second authenticator). */
const ALLOWED_MFA_RETURN_PATHS: readonly string[] = ["/mfa/setup"];

/**
 * A safe path to return to after verifying: an internal path only.
 *
 * The value is parsed as a URL against a placeholder origin and must still
 * be on that origin, so "//evil.com", "/\\evil.com" and "/<tab>/evil.com"
 * (browsers drop tabs and newlines from URLs) are all refused. Control
 * characters are refused outright. MFA pages are refused, apart from the
 * setup page, so a user cannot be sent round in a loop.
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string" || raw.length > 2048) return null;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw, "https://next.invalid");
  } catch {
    return null;
  }
  if (parsed.origin !== "https://next.invalid") return null;
  const path = parsed.pathname + parsed.search;
  if (path.startsWith("//")) return null;
  if ((path === "/mfa" || path.startsWith("/mfa/") || path.startsWith("/mfa?")) && !ALLOWED_MFA_RETURN_PATHS.includes(parsed.pathname)) {
    return null;
  }
  return path;
}
