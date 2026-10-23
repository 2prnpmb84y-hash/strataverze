"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site-url";
import { auditHash, recordSecurityEventLater } from "@/lib/audit/security-audit";
import { headers } from "next/headers";
import { hitRateLimits } from "@/lib/auth/rate-limit-db";

const SENT = "/forgot-password?message=If+that+address+has+an+account%2C+we+have+emailed+a+password+reset+link";

export async function resetPassword(formData: FormData) {
  const supabase = await createClient();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!email) {
    redirect("/forgot-password?error=Please+enter+your+email+address");
  }

  // A few reset emails per account and per address (S7, SEC-020). When the
  // limit is reached nothing is sent, but the page says the same as always,
  // so it cannot be used to tell which addresses have accounts.
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!(await hitRateLimits([["passwordReset", email], ["passwordResetAddress", ip]]))) {
    await recordSecurityEventLater({
      action: "auth.password_reset_requested",
      outcome: "denied",
      reason: "too many attempts",
      metadata: { subject: auditHash(email) },
    });
    redirect(SENT);
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl()}/reset-password`,
  });

  if (error) {
    // Keep Supabase's message server-side, and show the same confirmation
    // whether or not the address has an account, so the form cannot be
    // used to discover who is registered.
    console.error("[forgot-password] resetPasswordForEmail failed:", error.code ?? error.name);
  }

  await recordSecurityEventLater({
    action: "auth.password_reset_requested",
    outcome: error ? "failed" : "allowed",
    metadata: { subject: auditHash(email) },
  });

  redirect(SENT);
}
