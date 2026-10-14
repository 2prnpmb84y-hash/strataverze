"use server";

import { redirect } from "next/navigation";
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

  if (password.length < 8) {
    redirect(
      "/reset-password?error=Password+must+be+at+least+8+characters"
    );
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect(
      "/reset-password?error=" + encodeURIComponent(error.message)
    );
  }

  redirect("/login?message=Password+updated+successfully.+Please+sign+in.");
}
