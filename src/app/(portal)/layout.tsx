import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, getAvailablePortals } from "@/lib/queries/profiles";
import { getPendingInvitationsForEmail } from "@/lib/queries/invitations";
import { PortalShell } from "@/components/portal-shell";

// Auth-protected layout reads cookies at request time, so it cannot be
// prerendered into the static shell. Opt out of instant validation.
// See: https://nextjs.org/docs/app/guides/authentication-with-cache-components
export const instant = false;

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const profile = await getCurrentProfile();
  const availablePortals = profile
    ? await getAvailablePortals(profile.id)
    : [];

  const pendingInvitations = profile
    ? await getPendingInvitationsForEmail(profile.email)
    : [];

  return (
    <PortalShell
      user={user}
      availablePortals={availablePortals}
      pendingInvitationCount={pendingInvitations.length}
    >
      {children}
    </PortalShell>
  );
}
