import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/mfa-policy";

/** Only allow redirects to internal paths (the shared rule, see mfa-policy). */
function sanitiseRedirectPath(raw: string | null): string {
  return safeNextPath(raw) ?? "/dashboard";
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = sanitiseRedirectPath(searchParams.get("next"));

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
