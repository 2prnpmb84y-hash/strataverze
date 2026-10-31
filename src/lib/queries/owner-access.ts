import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";
import type { db } from "@/prisma/db";

type MembershipRow = { id: string; schemeId: string; profileId: string; lotId?: string | null; startDate?: unknown; endDate?: unknown; role: string };

/**
 * Start an ended OWNER membership again on `lotId`, first keeping the lot and
 * dates it held in owner_lot_history (migration 20261201), so the history the
 * 30-day own-lot check reads is not rewritten. Through the caller's ORM.
 */
export async function restartOwnerAccess(orm: typeof db.orm, ended: MembershipRow, lotId: string | null) {
  if (ended.lotId) {
    await orm.public.OwnerLotHistory.create({
      schemeId: ended.schemeId,
      lotId: ended.lotId,
      profileId: ended.profileId,
      membershipId: ended.id,
      startedAt: (ended.startDate ? String(ended.startDate) : new Date().toISOString()) as unknown as TimestampString<3>,
      endedAt: (ended.endDate ? String(ended.endDate) : new Date().toISOString()) as unknown as TimestampString<3>,
    });
  }
  const n = await orm.public.SchemeMembership
    .where((m) => and(m.id.eq(ended.id), m.schemeId.eq(ended.schemeId), m.role.eq("OWNER"), m.isActive.eq(false)))
    .updateAndCount({
      lotId,
      isActive: true,
      isTreasurer: false,
      endDate: null,
      startDate: new Date().toISOString() as unknown as TimestampString<3>,
    });
  if (n !== 1) throw new Error("The owner access changed while it was being started again.");
}

