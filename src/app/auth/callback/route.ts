import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Only allow redirects to internal paths (no protocol, no host). */
function sanitiseRedirectPath(raw: string): string {
  const fallback = "/dashboard";
  if (!raw || typeof raw !== "string") return fallback;

  // Strip any leading double-slash or protocol to prevent open redirect
  const cleaned = raw.replace(/^[/\\]{2,}/, "/").replace(/^https?:\/\//i, "/");

  // Must start with a single slash and not contain authority component
  if (!cleaned.startsWith("/") || cleaned.startsWith("//")) return fallback;

  try {
    const url = new URL(cleaned, "http://localhost");
    // Ensure the path stays on the same host (no redirect to external domain)
    if (url.hostname !== "localhost") return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = sanitiseRedirectPath(searchParams.get("next") ?? "/dashboard");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // If code exchange fails, redirect to login with an error
  return NextResponse.redirect(`${origin}/login?error=Could+not+authenticate`);
}
