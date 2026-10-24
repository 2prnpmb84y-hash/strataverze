/**
 * Simple in-memory sliding-window rate limiter for auth endpoints.
 *
 * Per server instance only. The limits that must hold across instances are
 * in rate-limit-db.ts (S7); this is their cheap first check and fallback.
 */

interface RateLimitEntry {
  timestamps: number[];
  /** The entry's own window, so clean-up never uses another limit's (S7). */
  windowMs: number;
}

const store = new Map<string, RateLimitEntry>();

/** Evict stale entries every 5 minutes to prevent unbounded growth. */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < entry.windowMs);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetMs: number;
}

/**
 * Check whether a request identified by `key` is within the rate limit.
 *
 * @param key      – unique identifier (e.g. IP address or email)
 * @param limit    – maximum requests allowed in the window
 * @param windowMs – sliding window duration in milliseconds
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  cleanup();

  const now = Date.now();
  let entry = store.get(key);

  if (!entry) {
    entry = { timestamps: [], windowMs };
    store.set(key, entry);
  }

  entry.windowMs = Math.max(entry.windowMs, windowMs);
  // Remove timestamps outside the current window
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

  if (entry.timestamps.length >= limit) {
    const oldestInWindow = entry.timestamps[0];
    return {
      success: false,
      remaining: 0,
      resetMs: oldestInWindow + windowMs - now,
    };
  }

  entry.timestamps.push(now);

  return {
    success: true,
    remaining: limit - entry.timestamps.length,
    resetMs: windowMs,
  };
}

/**
 * Pre-configured limiter for authentication endpoints.
 *
 * 5 attempts per 15-minute window per identifier.
 */
export function authRateLimit(identifier: string): RateLimitResult {
  return rateLimit(identifier, 5, 15 * 60 * 1000);
}
