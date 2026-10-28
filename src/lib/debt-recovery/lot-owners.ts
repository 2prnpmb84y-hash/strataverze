/**
 * Who owns a lot, for keeping a debtor out of their own debt recovery
 * (moved from src/lib/actions/debt-recovery.ts, 27 Oct 2026, so the daily
 * proceedings reminder uses the same test as the case actions).
 */
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";

/** Days after an ownership ends during which the former owner still counts as an owner. */
export const OWNER_CONFLICT_DAYS = 30;

/**
 * Profiles holding an OWNER membership on the lot (co-owners each have one),
 * active or ended in the last 30 days. They may not act on the lot's case,
 * and are never sent its reminders.
 */
export async function lotOwnerIds(schemeId: string, lotId: string, now: Date = new Date()): Promise<string[]> {
  const rows = await db.orm.public.SchemeMembership
    .where((m) => and(m.schemeId.eq(schemeId), m.lotId.eq(lotId), m.role.eq("OWNER")))
    .limit(50)
    .all();
  const cutoff = now.getTime() - OWNER_CONFLICT_DAYS * 24 * 60 * 60 * 1000;
  return rows
    .filter((m) => m.isActive || (m.endDate != null && new Date(String(m.endDate)).getTime() >= cutoff))
    .map((m) => m.profileId);
}
