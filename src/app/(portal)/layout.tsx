import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, getAvailablePortals, hasCommitteeRole } from "@/lib/queries/profiles";
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
  await connection();

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const profile = await getCurrentProfile();
  const [availablePortals, isCommitteeMember, pendingInvitations] =
    await Promise.all([
      profile ? getAvailablePortals(profile.id) : Promise.resolve([]),
      profile ? hasCommitteeRole(profile.id) : Promise.resolve(false),
      profile
        ? getPendingInvitationsForEmail(profile.email)
        : Promise.resolve([]),
    ]);

  return (
    <PortalShell
      user={user}
      availablePortals={availablePortals}
      isCommitteeMember={isCommitteeMember}
      pendingInvitationCount={pendingInvitations.length}
      isPlatformAdmin={profile?.isPlatformAdmin ?? false}
    >
      {children}
    </PortalShell>
  );
}
