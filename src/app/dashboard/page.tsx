import { redirect } from "next/navigation";
import { getCurrentProfile, getAvailablePortals } from "@/lib/queries/profiles";

export const instant = false;

/**
 * Dashboard router — reads the user's active memberships and redirects
 * to their first available portal. Falls back to /owner if no memberships
 * exist yet (new users get set up during onboarding).
 */
export default async function DashboardRouter() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  const portals = await getAvailablePortals(profile.id);

  // Redirect to the first available portal, defaulting to owner
  const target = portals[0] ?? "owner";
  redirect(`/${target}`);
}
