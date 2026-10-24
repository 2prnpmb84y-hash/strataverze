"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site-url";
import { auditHash, recordSecurityEventLater } from "@/lib/audit/security-audit";

export async function resetPassword(formData: FormData) {
  const supabase = await createClient();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!email) {
    redirect("/forgot-password?error=Please+enter+your+email+address");
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

  redirect(
    "/forgot-password?message=If+that+address+has+an+account%2C+we+have+emailed+a+password+reset+link",
  );
}
