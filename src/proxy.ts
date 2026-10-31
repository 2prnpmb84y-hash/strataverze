import { createServerClient } from "@supabase/ssr";
import { safeNextPath } from "@/lib/auth/mfa-policy";
import { loadSessionState } from "@/lib/auth/session-state";
import { contextFromHeaders } from "@/lib/audit/security-audit";
import { canonicalUuid, isPrefetch, viewTargetFor } from "@/lib/audit/view-audit";
import { recordPageView } from "@/lib/audit/page-views";
import { MARKETING_SITE_URL } from "@/lib/site-url";
import { after, NextResponse, type NextRequest } from "next/server";

/**
 * Next.js Proxy (formerly middleware) for StrataVerze.
 *
 * Responsibilities:
 * 1. Set a per-request nonce-based Content-Security-Policy header.
 * 2. Refresh the Supabase auth session on every matched request so
 *    server components always see a fresh token.
 * 3. Redirect unauthenticated visitors away from portal routes.
 * 4. Redirect authenticated visitors away from auth pages.
 * 5. Send the app root on: signed in to /dashboard, signed out to the
 *    marketing site.
 */

const SUPABASE_HOST = "vtqovzfywfrizjufsrmj.supabase.co";

/**
 * Build the Content-Security-Policy header value for a given nonce.
 * In development mode, unsafe-eval is permitted for React dev tooling
 * and unsafe-inline is added for styles that hot-reload injects.
 */
function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";

  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}' https://fonts.googleapis.com${isDev ? " 'unsafe-inline'" : ""}`,
    "font-src 'self' https://fonts.gstatic.com",
    `img-src 'self' data: blob: https://${SUPABASE_HOST}`,
    `connect-src 'self' https://${SUPABASE_HOST} wss://${SUPABASE_HOST}`,
    // Scheme map embeds (see components/ui/static-map.tsx), a supplier
    // invoice PDF the adviser has picked, shown beside the review form
    // (blob:), and the Turnstile security check on the sign-in forms.
    "frame-src 'self' blob: https://www.google.com https://maps.google.com https://challenges.cloudflare.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];

  return directives.join("; ");
}

const protectedPrefixes = [
  "/owner",
  "/committee",
  "/adviser",
  "/accountant",
  "/supplier",
  "/settings",
  "/invitations",
  "/admin",
  "/mfa",
  "/dashboard",
];

// Signed-in users are sent on from these. Not /reset-password: a recovery
// session is signed in, and must be able to come back to it after entering
// an authenticator code.
const authRoutes = new Set([
  "/login",
  "/signup",
  "/forgot-password",
]);

export async function proxy(request: NextRequest) {
  // Generate a per-request nonce for CSP
  const nonce = crypto.randomUUID();
  const cspHeaderValue = buildCsp(nonce);

  // Set the nonce on the request so Next.js can auto-apply it to
  // framework-injected scripts and styles.
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", cspHeaderValue);

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, cacheHeaders) {
          // Forward new cookies to the browser via the request object
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          // Rebuild the response so it carries updated cookies downstream
          // AND sets the new cookies on the outgoing response.
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
          // A response that sets auth cookies must not be cached (S7).
          Object.entries(cacheHeaders ?? {}).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value),
          );
        },
      },
    },
  );

  // Refresh the session. This reads + writes cookies, so it must run
  // before we inspect the user.
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  let user = authUser;
  let endedReason: string | null = null;

  // Session timeouts and revocation (security stage S5). The same check
  // runs in getCurrentSession; here it can also clear the cookies.
  if (user) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    let state: Awaited<ReturnType<typeof loadSessionState>> | null = null;
    try {
      state = await loadSessionState(user, session?.access_token, { createProfile: false });
    } catch (err) {
      // getCurrentSession repeats this check and fails closed, so a database
      // error here does not let an ended session through.
      console.error("[proxy] session check failed:", err instanceof Error ? err.name : "error");
    }
    // Building pages, and owner pages showing other owners' arrears, are
    // recorded in the security audit log (S6), after the response is sent.
    if (state?.kind === "active" && request.method === "GET" && !isPrefetch(request.headers)) {
      const target = viewTargetFor(request.nextUrl.pathname);
      if (target) {
        const context = contextFromHeaders(request.headers);
        const profile = state.session.profile;
        const cookieScheme = canonicalUuid(request.cookies.get("sv_selected_scheme")?.value);
        after(() => recordPageView(target, profile, cookieScheme, context));
      }
    }
    if (state?.kind === "ended") {
      endedReason = state.reason;
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // Already gone; the cookies are cleared either way.
      }
      user = null;
    }
  }

  const { pathname } = request.nextUrl;

  // --- The app root (AR-008) ---
  // The old landing page here was retired on 31 Oct 2026; the public site is
  // www.strataverze.com, a separate project. A temporary redirect (307),
  // never a permanent one: the target depends on the session, and browsers
  // cache permanent redirects. withCookies also marks it no-store.
  if (pathname === "/") {
    if (!user) {
      return withCookies(NextResponse.redirect(MARKETING_SITE_URL, 307), supabaseResponse);
    }
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    return withCookies(NextResponse.redirect(dashboardUrl, 307), supabaseResponse);
  }

  // --- Protected portal routes ---
  const isProtected = protectedPrefixes.some((prefix) =>
    pathname.startsWith(prefix),
  );

  if (!user && isProtected) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", pathname);
    if (endedReason) loginUrl.searchParams.set("reason", endedReason);
    return withCookies(NextResponse.redirect(loginUrl), supabaseResponse);
  }

  // --- Auth pages: redirect logged-in users to their portal ---
  // A signed-in person who opens the sign-in page without a "next" link
  // sees it with a choice of their portals instead of being sent to the
  // owner portal (they may have meant the adviser or supplier portal).
  const choosingPortal = pathname === "/login" && !request.nextUrl.searchParams.get("next");
  if (user && authRoutes.has(pathname) && !choosingPortal) {
    const next = request.nextUrl.searchParams.get("next");
    const destination = sanitisePath(next) ?? "/owner/dashboard";

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = destination;
    redirectUrl.search = "";
    return withCookies(NextResponse.redirect(redirectUrl), supabaseResponse);
  }

  // Apply CSP header to the response
  supabaseResponse.headers.set("Content-Security-Policy", cspHeaderValue);
  supabaseResponse.headers.set("x-nonce", nonce);

  return supabaseResponse;
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Carry any cookies Supabase set (a refresh, or clearing on sign-out) onto a redirect. */
function withCookies(response: NextResponse, from: NextResponse): NextResponse {
  for (const cookie of from.cookies.getAll()) response.cookies.set(cookie);
  // Redirects that carry auth cookies are never cached (S7).
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

/**
 * Sanitise a redirect path so it cannot be used for open-redirect
 * attacks. Returns null for anything suspicious.
 */
function sanitisePath(raw: string | null): string | null {
  // One rule for every "return to" link (security review of S4).
  return safeNextPath(raw);
}

// ── Matcher ─────────────────────────────────────────────────────────

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimisation)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - Public assets (images, fonts etc.)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|eot)$).*)",
  ],
};
