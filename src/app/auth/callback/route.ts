import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/mfa-policy";
import { recordSecurityEvent } from "@/lib/audit/security-audit";

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
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // A sign-in from an email link (confirmation, recovery or invitation).
      await recordSecurityEvent({
        action: "auth.link_sign_in",
        outcome: "allowed",
        actorAuthId: data.user?.id ?? null,
        metadata: { next: next.split("?")[0] },
      });
      return NextResponse.redirect(`${origin}${next}`);
    }
    await recordSecurityEvent({ action: "auth.link_sign_in", outcome: "failed", reason: "link invalid or expired" });
  }

  // If code exchange fails, redirect to login with an error
  return NextResponse.redirect(`${origin}/login?error=Could+not+authenticate`);
}
