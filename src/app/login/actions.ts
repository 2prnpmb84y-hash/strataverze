"use server";

import { revalidatePath } from "next/cache";
import { validatePassword } from "@/lib/auth/password-policy";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { authRateLimit } from "@/lib/auth/rate-limit";

/** Basic email format check — prevents obviously invalid submissions. */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export async function login(formData: FormData) {
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const email = String(formData.get("email")).trim().toLowerCase();

  if (!isValidEmail(email)) {
    redirect("/login?error=Please+enter+a+valid+email+address.");
  }

  const password = String(formData.get("password"));
  if (!password || password.length < 6) {
    redirect("/login?error=Please+enter+your+password.");
  }

  const limit = authRateLimit(`login:${ip}:${email}`);
  if (!limit.success) {
    redirect("/login?error=Too+many+attempts.+Please+try+again+later.");
  }

  const supabase = await createClient();

  const data = {
    email,
    password,
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


export async function signup(formData: FormData) {
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const email = String(formData.get("email")).trim().toLowerCase();

  if (!isValidEmail(email)) {
    redirect("/login?error=Please+enter+a+valid+email+address.");
  }

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
