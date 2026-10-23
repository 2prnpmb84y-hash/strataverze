import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import { writeSecurityEvent, type RequestContext } from "./security-audit";
import type { ViewTarget } from "./view-audit";

/**
 * Record one page view (security stage S6). Runs after the response. The
 * outcome reflects whether the person holds a role that may see the page on
 * that building: "denied" means the page refused them.
 */
export async function recordPageView(
  target: ViewTarget,
  profile: { id: string; isPlatformAdmin?: boolean | null },
  cookieSchemeId: string | null,
  context: RequestContext,
): Promise<void> {
  try {
    const schemeId = target.schemeId ?? cookieSchemeId;
    if (!schemeId) return;
    const memberships = await db.orm.public.SchemeMembership
      .where((m) => and(m.profileId.eq(profile.id), m.schemeId.eq(schemeId), m.isActive.eq(true)))
      .limit(20)
      .all();
    const roles = [...new Set(memberships.map((m) => String(m.role)))];
    // Owner pages fall back to the person's own buildings when the cookie
    // names one they do not belong to, so there is nothing to record.
    if (target.area === "owner" && roles.length === 0) return;
    const allowed = roles.some((r) => target.roles.includes(r));
    await writeSecurityEvent(
      {
        action: target.action,
        outcome: allowed ? "allowed" : "denied",
        actorProfileId: profile.id,
        actorRole: roles.join(",") || (profile.isPlatformAdmin ? "platform_admin" : "none"),
        schemeId,
        resourceType: target.resourceType,
        resourceId: target.resourceId ?? schemeId,
        reason: allowed ? null : "no role on this building for this page",
        metadata: { page: target.page, area: target.area },
      },
      context,
    );
  } catch (err) {
    console.error("[security-audit] page view not recorded:", err instanceof Error ? err.name : "error");
  }
}
