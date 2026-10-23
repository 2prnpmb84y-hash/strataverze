import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { loadSessionState } from "./session-state";
import { noteRequestActor } from "@/lib/audit/security-audit";

/**
 * The signed-in user for this request: their Supabase user (validated with
 * the Auth server), their StrataVerze profile, the session's assurance level,
 * their verified authenticators, and whether MFA is mandatory for them.
 *
 * Returns null when nobody is signed in, and also when the session has timed
 * out or been ended (security stage S5); the session is then signed out.
 *
 * This does NOT enforce MFA. Use getCurrentProfile (which does) everywhere
 * except the MFA pages themselves.
 */
export const getCurrentSession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const state = await loadSessionState(user, session?.access_token, { createProfile: true });

  if (state.kind !== "active") {
    // Revoke it with the Auth server and clear the cookies where this
    // context allows (a server component cannot set cookies; the proxy
    // clears them on the next page load).
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // Already gone.
    }
    return null;
  }
  // Lets security events raised later in this request name the person.
  await noteRequestActor({ profileId: state.session.profile.id, authId: state.session.user.id });
  return state.session;
});
