import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client with the service role key, for the few administrative
 * operations the app cannot do as the signed-in user (resetting another
 * user's authenticator). It bypasses RLS and Auth checks, so:
 *   - only server code may import it (a guard test checks no client file does);
 *   - every caller must authorise the request first (platform admin plus a
 *     fresh authenticator check) and record what it did.
 * The key is SUPABASE_SERVICE_ROLE_KEY, a server-only Vercel variable.
 *
 * `timeoutMs` ends every request the client makes after that long (an
 * AbortSignal.timeout on its fetch, through supabase-js's `global.fetch`
 * option). Use it where a caller holds database locks across Auth calls
 * (the /join set-up, S2a). Storage uploads leave it unset, as a large file
 * can take longer.
 */
export function createAdminClient(options: { timeoutMs?: number } = {}) {
  if (typeof window !== "undefined") throw new Error("The admin client is server-only.");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(options.timeoutMs ? { global: { fetch: fetchWithTimeout(options.timeoutMs) } } : {}),
  });
}

/**
 * A fetch that gives up after `ms` milliseconds, as well as when the
 * caller's own signal (if any) aborts. A timed-out request rejects with a
 * TimeoutError, which supabase-js returns as an error result.
 */
export function fetchWithTimeout(ms: number, base: typeof fetch = fetch): typeof fetch {
  return (input, init) => {
    const timeout = AbortSignal.timeout(ms);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return base(input, { ...init, signal });
  };
}
