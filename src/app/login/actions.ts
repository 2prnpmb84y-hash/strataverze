"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const supabase = await createClient();

  const data = {
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  };

  const { error } = await supabase.auth.signInWithPassword(data);

  if (error) {
    redirect("/login?error=Invalid+email+or+password");
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signup(formData: FormData) {
  const supabase = await createClient();

  const data = {
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  };

  const { error } = await supabase.auth.signUp(data);

  if (error) {
    redirect("/login?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/", "layout");
  redirect("/login?message=Check+your+email+to+confirm+your+account");
}
