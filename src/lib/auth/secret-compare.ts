import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Compare a presented secret with the expected one in constant time
 * (security stage S7, finding SEC-027). Both are hashed first, so the
 * comparison takes the same time whatever their lengths.
 */
export function secretMatches(presented: string | null | undefined, expected: string | null | undefined): boolean {
  if (!expected || typeof presented !== "string") return false;
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Whether a request carries `Authorization: Bearer <expected>`. */
export function bearerMatches(authorization: string | null, expected: string | null | undefined): boolean {
  if (!expected) return false;
  return secretMatches(authorization, `Bearer ${expected}`);
}
