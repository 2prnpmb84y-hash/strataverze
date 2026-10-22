import { db } from "@/prisma/db";

/*
 * Levy queries for the owner portal. Levies are levy schedules and levy
 * notices (see levy-schedules.ts). The legacy Levy and LevyItem models are
 * retired: nothing reads or writes them, and their tables are kept unchanged
 * until a separate decision to drop them.
 */

/**
 * Get levy notices for a specific lot (owner view).
 * Uses the LevyNotice model which provides richer data than LevyItem.
 */
export async function getLevyNoticesForLot(lotId: string, limit = 200) {
  try {
    return await db.orm.public.LevyNotice
      .where((ln) => ln.lotId.eq(lotId))
      .include("fund")
      .include("levySchedule")
      .orderBy((ln) => ln.dueDate.desc())
      .limit(limit)
      .all();
  } catch {
    // Table may not exist yet; return empty array
    return [];
  }
}

/**
 * Get levy notices for multiple lots (owner view across schemes).
 */
export async function getLevyNoticesForLots(lotIds: string[], limit = 500) {
  if (lotIds.length === 0) return [];
  try {
    return await db.orm.public.LevyNotice
      .where((ln) => ln.lotId.in(lotIds))
      .include("fund")
      .include("levySchedule")
      .orderBy((ln) => ln.dueDate.desc())
      .limit(limit)
      .all();
  } catch {
    // Table may not exist yet; return empty array
    return [];
  }
}
