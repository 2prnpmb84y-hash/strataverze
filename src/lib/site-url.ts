/**
 * The public address of the app, used in every emailed link and auth
 * redirect.
 *
 * Security finding SEC-033: links previously fell back to
 * https://strataverze.com.au, a domain that is not registered, so anyone who
 * registered it would have received owners' clicks on invitation and levy
 * emails. Links now fall back to the app's own address,
 * https://app.strataverze.com, and never to localhost outside development.
 *
 * Since 23 Oct 2026 www.strataverze.com (and the bare domain) serve the
 * marketing site, a separate Vercel project, whose Log in button links here.
 *
 * APP_URL (server) and NEXT_PUBLIC_SITE_URL (client) in Vercel override it.
 */
export const PRODUCTION_SITE_URL = "https://app.strataverze.com";

function clean(url: string | undefined): string | null {
  const value = url?.trim().replace(/\/+$/, "");
  if (!value) return null;
  // Only absolute https addresses (http is allowed for local development).
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(value) && !/^http:\/\/localhost(:\d+)?$/i.test(value)) {
    return null;
  }
  return value;
}

/** The base URL for links, with no trailing slash. */
export function siteUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = clean(env.APP_URL) ?? clean(env.NEXT_PUBLIC_SITE_URL);
  if (configured) return configured;
  if (env.NODE_ENV === "development" || env.NODE_ENV === "test") return "http://localhost:3000";
  return PRODUCTION_SITE_URL;
}
