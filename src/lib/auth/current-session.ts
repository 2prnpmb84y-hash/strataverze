import { cache } from "react";
import { db } from "@/prisma/db";
import { createClient } from "@/lib/supabase/server";
import { assuranceFromClaims, decodeJwtPayload } from "./mfa-policy";

/**
 * The signed-in user for this request: their Supabase user (validated with
 * the Auth server), their StrataVerze profile, the session's assurance level,
 * and their verified authenticators.
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

  // getUser has just validated this session's access token with the Auth
  // server, so its claims can be read without verifying it again. They are
  // used only when they belong to the same user.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const claims = decodeJwtPayload(session?.access_token);
  const assurance = assuranceFromClaims(claims && claims.sub === user.id ? claims : null);
  const verifiedFactors = (user.factors ?? []).filter(
    (f) => f.status === "verified" && f.factor_type === "totp",
  );

  let profile = await db.orm.public.Profile.where((p) => p.authId.eq(user.id)).first();
  if (!profile) {
    // First sign-in.
    profile = await db.orm.public.Profile.create({
      authId: user.id,
      email: user.email ?? "",
      firstName: "",
      lastName: "",
    });
  }

  return { user, profile, assurance, verifiedFactors };
});
