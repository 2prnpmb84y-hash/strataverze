import { getCurrentProfile, hasCommitteeRole } from "@/lib/queries/profiles";
import { getSchemesForCommittee } from "@/lib/queries/schemes";

/**
 * Verify the current user is a committee member and return their profile
 * and committee-linked schemes. Returns null if not authenticated or not
 * a committee member — callers should render a "not authorised" message.
 */
export async function requireCommitteeAccess() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const isCommittee = await hasCommitteeRole(profile.id);
  if (!isCommittee) return null;

  const schemes = await getSchemesForCommittee(profile.id);
  const schemeIds = schemes.map((s) => s.id);

  return { profile, schemes, schemeIds };
}
