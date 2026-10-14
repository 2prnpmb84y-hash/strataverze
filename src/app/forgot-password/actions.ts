"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function resetPassword(formData: FormData) {
  const supabase = await createClient();

  const email = String(formData.get("email"));

  if (!email) {
    redirect("/forgot-password?error=Please+enter+your+email+address");
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/reset-password`,
  });

  if (error) {
    redirect(
      "/forgot-password?error=" + encodeURIComponent(error.message)
    );
  }

  redirect(
    "/forgot-password?message=Check+your+email+for+a+password+reset+link"
  );
}
