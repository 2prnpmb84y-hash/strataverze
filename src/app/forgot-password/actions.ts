"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site-url";
import { auditHash, recordSecurityEventLater } from "@/lib/audit/security-audit";
import { headers } from "next/headers";
import { anyRateLimitReached, clientIp, recordRateLimitHits, type RateLimitName } from "@/lib/auth/rate-limit-db";
import { CAPTCHA_FAILED_MESSAGE, captchaTokenFrom, isCaptchaFailure } from "@/lib/auth/captcha";

const SENT = "/forgot-password?message=If+that+address+has+an+account%2C+we+have+emailed+a+password+reset+link";

export async function resetPassword(formData: FormData) {
  const supabase = await createClient();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!email) {
    redirect("/forgot-password?error=Please+enter+your+email+address");
  }

  // A few reset emails per account and address, per account, and per
  // address (S7, SEC-020). Only emails actually requested from Supabase
  // count, so refused requests do not extend the block. When a limit is
  // reached nothing is sent, but the page says the same as always, so it
  // cannot be used to tell which addresses have accounts.
  const ip = clientIp(await headers());
  const limits: [RateLimitName, string | null][] = [
    ["passwordReset", ip ? `${ip}|${email}` : email],
    ["passwordResetAccount", email],
    ["passwordResetAddress", ip],
  ];
  if (await anyRateLimitReached(limits)) {
    await recordSecurityEventLater({
      action: "auth.password_reset_requested",
      outcome: "denied",
      reason: "too many attempts",
      metadata: { subject: auditHash(email) },
    });
    redirect(SENT);
  }

  const captchaToken = captchaTokenFrom(formData);
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl()}/reset-password`,
    ...(captchaToken ? { captchaToken } : {}),
  });
  if (isCaptchaFailure(error)) {
    // Says nothing about the address; nothing was sent, so nothing is counted.
    redirect(`/forgot-password?error=${encodeURIComponent(CAPTCHA_FAILED_MESSAGE)}`);
  }
  await recordRateLimitHits(limits);

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
