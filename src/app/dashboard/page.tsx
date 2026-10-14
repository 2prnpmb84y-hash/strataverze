import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

/**
 * Dashboard router — reads the user's portal role from the profiles table
 * and redirects to the appropriate portal. Falls back to /owner if no
 * profile exists yet (new users get set up during onboarding).
 */
export default async function DashboardRouter() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Look up the user's role from the profiles table
  const { data: profile } = await supabase
    .from("profiles")
    .select("portal_role")
    .eq("auth_id", user.id)
    .single();

  const role = profile?.portal_role?.toLowerCase() ?? "owner";

  redirect(`/${role}`);
}
