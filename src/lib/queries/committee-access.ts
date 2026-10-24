import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForCommittee } from "@/lib/queries/schemes";

/**
 * Verify the current user is a committee member and return their profile
 * and the schemes where they hold an ACTIVE COMMITTEE membership. Returns
 * null if not authenticated or not on any committee — callers should render
 * a "not authorised" message.
 *
 * Being on a committee somewhere is not authority over any particular
 * scheme (SEC-023): callers must only show or change data for schemes in
 * `schemeIds`, and narrow to the selected scheme with
 * getVerifiedSelectedSchemeId (src/lib/owner/selected-scheme.ts), never the
 * raw cookie.
 */
export async function requireCommitteeAccess() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = await getSchemesForCommittee(profile.id);
  if (schemes.length === 0) return null;
  const schemeIds = schemes.map((s) => s.id);

  return { profile, schemes, schemeIds };
}
