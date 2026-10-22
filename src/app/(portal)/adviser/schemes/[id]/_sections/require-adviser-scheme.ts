import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";

/**
 * Loads a scheme for an adviser section page. Returns null when nobody is
 * signed in (the portal layout handles that), and 404s when the scheme does
 * not exist or the user is not an adviser on it.
 */
export async function requireAdviserScheme(id: string) {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  return scheme;
}
