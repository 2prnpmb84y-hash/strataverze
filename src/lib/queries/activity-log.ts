import { db } from "@/prisma/db";

export type ActivityAction =
  | "LEVY_CREATED"
  | "LEVY_ISSUED"
  | "LEVIES_GENERATED"
  | "INVITATION_SENT"
  | "INVITATION_ACCEPTED"
  | "INVITATION_DECLINED"
  | "INVITATION_REVOKED"
  | "MEMBER_JOINED"
  | "MEMBER_REMOVED"
  | "DOCUMENT_UPLOADED"
  | "WORK_ORDER_CREATED"
  | "WORK_ORDER_COMPLETED"
  | "MEETING_SCHEDULED"
  | "COMPLIANCE_UPDATED"
  | "SCHEME_UPDATED"
  | "FUND_CREATED"
  | "LOT_CREATED"
  | "LEVY_PAYMENT_RECORDED"
  | "ANNOUNCEMENT_PUBLISHED"
  | "BYLAW_CREATED"
  | "BYLAW_UPDATED"
  | "INSURANCE_CREATED"
  | "INSURANCE_UPDATED"
  | "CONTACT_CREATED"
  | "CONTACT_UPDATED";

export type ActivityEntityType =
  | "Levy"
  | "Invitation"
  | "SchemeMembership"
  | "Document"
  | "WorkOrder"
  | "Meeting"
  | "ComplianceItem"
  | "Scheme"
  | "Fund"
  | "Lot"
  | "LevyItem"
  | "Announcement"
  | "ByLaw"
  | "InsurancePolicy"
  | "Contact";

/**
 * Log an activity event for a scheme.
 */
export async function logActivity(data: {
  schemeId: string;
  actorId: string;
  action: ActivityAction;
  entityType: ActivityEntityType;
  entityId?: string;
  metadata?: Record<string, unknown>;
}) {
  return db.orm.public.ActivityLog.create({
    schemeId: data.schemeId,
    actorId: data.actorId,
    action: data.action,
    entityType: data.entityType,
    entityId: data.entityId ?? null,
    metadata: (data.metadata ?? null) as Parameters<typeof db.orm.public.ActivityLog.create>[0]["metadata"],
  });
}

/**
 * Get recent activity for a scheme, newest first.
 */
export async function getActivityForScheme(
  schemeId: string,
  limit = 50,
) {
  return db.orm.public.ActivityLog
    .where((a) => a.schemeId.eq(schemeId))
    .include("actor")
    .orderBy((a) => a.createdAt.desc())
    .limit(limit)
    .all();
}

/**
 * Get recent activity across multiple schemes.
 */
export async function getActivityForSchemes(
  schemeIds: string[],
  limit = 50,
) {
  if (schemeIds.length === 0) return [];

  return db.orm.public.ActivityLog
    .where((a) => a.schemeId.in(schemeIds))
    .include("actor")
    .include("scheme")
    .orderBy((a) => a.createdAt.desc())
    .limit(limit)
    .all();
}
