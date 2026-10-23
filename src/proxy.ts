import { createServerClient } from "@supabase/ssr";
import { safeNextPath } from "@/lib/auth/mfa-policy";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js Proxy (formerly middleware) for StrataVerze.
 *
 * Responsibilities:
 * 1. Set a per-request nonce-based Content-Security-Policy header.
 * 2. Refresh the Supabase auth session on every matched request so
 *    server components always see a fresh token.
 * 3. Redirect unauthenticated visitors away from portal routes.
 * 4. Redirect authenticated visitors away from auth pages.
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
    // Scheme map embeds (see components/ui/static-map.tsx), and a supplier
    // invoice PDF the adviser has picked, shown beside the review form (blob:).
    "frame-src 'self' blob: https://www.google.com https://maps.google.com",
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
        setAll(cookiesToSet) {
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
        },
      },
    },
  );

  // Refresh the session. This reads + writes cookies, so it must run
  // before we inspect the user.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // --- Protected portal routes ---
  const isProtected = protectedPrefixes.some((prefix) =>
    pathname.startsWith(prefix),
  );

  if (!user && isProtected) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // --- Auth pages: redirect logged-in users to their portal ---
  if (user && authRoutes.has(pathname)) {
    const next = request.nextUrl.searchParams.get("next");
    const destination = sanitisePath(next) ?? "/owner/dashboard";

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = destination;
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  // Apply CSP header to the response
  supabaseResponse.headers.set("Content-Security-Policy", cspHeaderValue);
  supabaseResponse.headers.set("x-nonce", nonce);

  return supabaseResponse;
}

// ── Helpers ──────────────────────────────────────────────────────────

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
