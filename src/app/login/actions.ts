"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { authRateLimit } from "@/lib/auth/rate-limit";

export async function login(formData: FormData) {
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const email = String(formData.get("email"));

  const limit = authRateLimit(`login:${ip}:${email}`);
  if (!limit.success) {
    redirect("/login?error=Too+many+attempts.+Please+try+again+later.");
  }

  const supabase = await createClient();

  const data = {
    email,
    password: String(formData.get("password")),
  };

  const { error } = await supabase.auth.signInWithPassword(data);

  if (error) {
    redirect("/login?error=Invalid+email+or+password");
  }

  revalidatePath("/", "layout");

  // Use portal hint from the login form to redirect directly
  const portal = formData.get("portal");
  if (portal === "adviser") {
    redirect("/adviser");
  }
  if (portal === "supplier") {
    redirect("/supplier");
  }

  redirect("/dashboard");
}

/**
 * Validate password meets minimum complexity requirements.
 * Returns an error message or null if valid.
 */
function validatePassword(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(password))
    return "Password must contain at least one uppercase letter.";
  if (!/[a-z]/.test(password))
    return "Password must contain at least one lowercase letter.";
  if (!/\d/.test(password))
    return "Password must contain at least one number.";
  if (!/[^A-Za-z0-9]/.test(password))
    return "Password must contain at least one special character.";
  return null;
}

export async function signup(formData: FormData) {
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const email = String(formData.get("email"));

  const limit = authRateLimit(`signup:${ip}:${email}`);
  if (!limit.success) {
    redirect("/login?error=Too+many+attempts.+Please+try+again+later.");
  }

  const supabase = await createClient();

  const data = {
    email,
    password: String(formData.get("password")),
  };

  const passwordError = validatePassword(data.password);
  if (passwordError) {
    redirect(`/login?error=${encodeURIComponent(passwordError)}`);
  }

  const { error } = await supabase.auth.signUp(data);

  if (error) {
    // Map to a generic message so Supabase internals are not exposed
    redirect("/login?error=Unable+to+create+account.+Please+try+again.");
  }

  revalidatePath("/", "layout");
  redirect("/login?message=Check+your+email+to+confirm+your+account");
}
