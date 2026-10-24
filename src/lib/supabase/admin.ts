import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client with the service role key, for the few administrative
 * operations the app cannot do as the signed-in user (resetting another
 * user's authenticator). It bypasses RLS and Auth checks, so:
 *   - only server code may import it (a guard test checks no client file does);
 *   - every caller must authorise the request first (platform admin plus a
 *     fresh authenticator check) and record what it did.
 * The key is SUPABASE_SERVICE_ROLE_KEY, a server-only Vercel variable.
 */
export function createAdminClient() {
  if (typeof window !== "undefined") throw new Error("The admin client is server-only.");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
