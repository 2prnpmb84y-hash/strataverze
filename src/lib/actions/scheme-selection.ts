"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE_NAME = "sv_selected_scheme";

/**
 * Server action: set the selected scheme cookie and redirect to the dashboard.
 */
export async function selectScheme(schemeId: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, schemeId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
  redirect("/owner/dashboard");
}

/**
 * Read the currently selected scheme ID from cookies.
 * Returns null if no scheme is selected.
 */
export async function getSelectedSchemeId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value ?? null;
}

/**
 * Clear the selected scheme cookie (go back to scheme picker).
 */
export async function clearSelectedScheme() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  redirect("/owner");
}
