import { db } from "@/prisma/db";
import { AuthorisationError, requireAuth, requirePlatformAdmin } from "@/lib/auth/require-membership";
import { requireSchemeAccess } from "@/lib/auth/require-access";

/**
 * Who may invite owners, committee members and accountants to a building
 * (security stage S2a, the approved permissions matrix, "Memberships and
 * invitations"): the building's Adviser (members.manage) and StrataVerze
 * platform admins (onboarding and support; every use is audited).
 *
 * Inviting an Adviser (a strata manager, by a platform admin or the
 * committee's chair or secretary) is stage S2d and is not offered here.
 *
 * Callers must also call requireRecentMfa(): inviting is a membership change.
 */
export async function authoriseInviter(schemeId: string): Promise<{
  profile: { id: string; firstName: string; lastName: string };
  actorRole: "ADVISER" | "platform_admin";
}> {
  if (!schemeId) throw new AuthorisationError("You do not have permission to perform this action.");
  const current = await requireAuth();
  if (current.isPlatformAdmin) {
    const profile = await requirePlatformAdmin();
    const scheme = await db.orm.public.Scheme.where((s) => s.id.eq(schemeId)).first();
    if (!scheme) throw new AuthorisationError("You do not have permission to perform this action.");
    return { profile, actorRole: "platform_admin" };
  }
  const { profile } = await requireSchemeAccess(schemeId, "members.manage");
  return { profile, actorRole: "ADVISER" };
}
