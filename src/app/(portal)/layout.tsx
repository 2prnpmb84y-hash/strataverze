import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, getAvailablePortals, hasCommitteeRole } from "@/lib/queries/profiles";
import { getPendingInvitationsForEmail } from "@/lib/queries/invitations";
import { invitationAddressOf } from "@/lib/invitations/invitee-address";
import { PortalShell } from "@/components/portal-shell";
import { levyNavLabel, ownerLevyNavLabel } from "@/lib/owner/levy-nav";
import { rulesForState } from "@/lib/jurisdiction/scheme-rules";
import { DEFAULT_SCHEME_STATE } from "@/config/jurisdictions";

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
  // Invitations are counted by the Auth address, only while the profile's
  // copy agrees with it (review finding L7).
  const inviteeAddress = profile ? invitationAddressOf({ user, profile }) : null;
  const [availablePortals, isCommitteeMember, pendingInvitations, leviesNavLabel] =
    await Promise.all([
      profile ? getAvailablePortals(profile.id) : Promise.resolve([]),
      profile ? hasCommitteeRole(profile.id) : Promise.resolve(false),
      inviteeAddress ? getPendingInvitationsForEmail(inviteeAddress) : Promise.resolve([]),
      // The owner portal's "Levies & Finance", in the words of the person's buildings.
      profile ? ownerLevyNavLabel(profile.id) : Promise.resolve(levyNavLabel(rulesForState(DEFAULT_SCHEME_STATE).rules.TERMINOLOGY.levies)),
    ]);

  return (
    <PortalShell
      user={user}
      availablePortals={profile?.isPlatformAdmin ? [...availablePortals, "admin"] : availablePortals}
      isCommitteeMember={isCommitteeMember}
      pendingInvitationCount={pendingInvitations.length}
      isPlatformAdmin={profile?.isPlatformAdmin ?? false}
      leviesNavLabel={leviesNavLabel}
    >
      {children}
    </PortalShell>
  );
}
