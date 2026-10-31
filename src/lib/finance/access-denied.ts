import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import { logError } from "@/lib/log";
import { recordSecurityEventLater } from "@/lib/audit/security-audit";
import { logActivity, type ActivityEntityType } from "@/lib/queries/activity-log";
import { notFound } from "@/lib/pdf/response";

/**
 * A refused request for a finance document (TC-011, finding S-04).
 *
 * The answer is the same 404 as for a document that does not exist, so an
 * id of another building cannot be probed for existence.
 *
 * The refusal is a security event for the caller (shown in the building's
 * security log without the caller's name when they are not one of its
 * people). It goes into the building's activity log only when the caller is
 * a member of that building (an owner asking for another lot's notice, say),
 * never into the activity log of a building the caller does not belong to.
 */
export async function refuseAsNotFound(input: {
  schemeId: string;
  actorId: string;
  entityType: ActivityEntityType;
  entityId: string | null;
  what: string;
}): Promise<ReturnType<typeof notFound>> {
  await recordSecurityEventLater({
    action: "access.denied",
    outcome: "denied",
    actorProfileId: input.actorId,
    schemeId: input.schemeId,
    resourceType: input.entityType,
    resourceId: input.entityId,
    reason: "finance document refused",
  });
  try {
    const member = await db.orm.public.SchemeMembership
      .where((m) => and(m.schemeId.eq(input.schemeId), m.profileId.eq(input.actorId), m.isActive.eq(true)))
      .first();
    if (member) {
      await logActivity({
        schemeId: input.schemeId,
        actorId: input.actorId,
        action: "FINANCIAL_DOCUMENT_ACCESS_DENIED",
        entityType: input.entityType,
        entityId: input.entityId ?? undefined,
        metadata: { what: input.what },
      });
    }
  } catch (err) {
    // The refusal stands even if it cannot be logged.
    logError("Could not log a refused document request:", err);
  }
  return notFound();
}
