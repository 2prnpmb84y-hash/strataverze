import { createHash, randomBytes } from "node:crypto";

/**
 * The token in an invitation link (security stage S2a).
 *
 * 32 random bytes, written as 43 base64url characters. Only its SHA-256 is
 * stored (invitations.token_hash), so a read of the database does not give
 * anyone a working link. The token has 256 bits of entropy, so a plain
 * (unkeyed) hash is enough: there is nothing to guess.
 *
 * The link is `${siteUrl()}/join#<token>`. The token sits in the fragment,
 * which browsers never send to the server, so it does not reach server
 * logs, the proxy or a Referer header. The /join page reads it in the
 * browser and passes it to the server actions in a POST body.
 */

/** How long an invitation and its link last (decided 23 Oct 2026: 14 days). */
export const INVITATION_TTL_DAYS = 14;

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** A new link token and the hash to store. */
export function newLinkToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: sha256(token) };
}

/** The stored hash for a token from a link, or null if it is not a token at all. */
export function hashLinkToken(token: unknown): string | null {
  if (typeof token !== "string") return null;
  const t = token.trim().replace(/^#/, "");
  return TOKEN.test(t) ? sha256(t) : null;
}

/** When an invitation sent now expires. */
export function invitationExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * An address shown on the /join page with most of it hidden
 * ("ja***@ex***.com"), so a forwarded link does not show the whole address
 * to whoever holds it, while the invitee can still recognise it.
 */
export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  const dot = domain.lastIndexOf(".");
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : "";
  const keep = (s: string, n: number) => (s.length <= n ? s.slice(0, 1) : s.slice(0, n)) + "***";
  return `${keep(local, 2)}@${keep(host, 2)}${tld}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
