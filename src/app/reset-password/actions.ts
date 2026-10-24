"use server";

import { redirect } from "next/navigation";
import { validatePassword } from "@/lib/auth/password-policy";
import { createClient } from "@/lib/supabase/server";

export async function updatePassword(formData: FormData) {
  const supabase = await createClient();

  const password = String(formData.get("password"));
  const confirmPassword = String(formData.get("confirmPassword"));

  if (!password || !confirmPassword) {
    redirect("/reset-password?error=Please+fill+in+both+password+fields");
  }

  if (password !== confirmPassword) {
    redirect("/reset-password?error=Passwords+do+not+match");
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    redirect("/reset-password?error=" + encodeURIComponent(passwordError));
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    // Supabase's own message can describe its internals; keep it server-side.
    console.error("[reset-password] updateUser failed:", error.code ?? error.name);
    redirect(
      "/reset-password?error=" +
        encodeURIComponent("Unable to update your password. The reset link may have expired. Please request a new one."),
    );
  }

  redirect("/login?message=Password+updated+successfully.+Please+sign+in.");
}
