"use server";
import { logError } from "@/lib/log";

import { createClient } from "@/lib/supabase/server";

export async function joinWaitlistAction(email: string) {
  if (!email || typeof email !== "string") {
    return { error: "Please enter a valid email address." };
  }

  const trimmed = email.trim().toLowerCase();

  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { error: "Please enter a valid email address." };
  }

  try {
    const supabase = await createClient();

    const { error } = await supabase.from("waitlist").insert({
      email: trimmed,
    });

    if (error) {
      // Duplicate email (unique constraint violation)
      if (error.code === "23505") {
        return { success: true, message: "You are already on the waitlist." };
      }
      logError("Waitlist insert error:", error);
      return { error: "Something went wrong. Please try again." };
    }

    return { success: true, message: "You have been added to the waitlist." };
  } catch (err) {
    logError("Waitlist error:", err);
    return { error: "Something went wrong. Please try again." };
  }
}
