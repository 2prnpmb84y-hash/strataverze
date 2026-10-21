import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { Numeric, TimestampString } from "@prisma/orm-postgres/target/codec-types";

/** Cast a number or string to the Prisma 8 Numeric branded type. */
function toNumeric(value: number | string): Numeric<12, 2> {
  return String(value) as unknown as Numeric<12, 2>;
}

/** Cast an ISO string to the Prisma 8 TimestampString branded type. */
function toTimestamp(value: string): TimestampString<3> {
  return value as unknown as TimestampString<3>;
}

/**
 * Apportion a total amount across lots by entitlement using the
 * largest-remainder method so that rounded cent values always sum
 * exactly to `totalAmount`.
 *
 * 1. Floor each lot's share to the cent.
 * 2. Calculate the shortfall (total minus sum of floored values).
 * 3. Award one extra cent to the lots whose fractional remainders
 *    are largest, until the shortfall is zero.
 */
function apportionByEntitlement(
  lots: Array<{ id: string; entitlement: number }>,
  totalEntitlement: number,
  totalAmount: number,
): Array<{ lotId: string; amount: number }> {
  if (totalEntitlement <= 0 || lots.length === 0) {
    return lots.map((lot) => ({ lotId: lot.id, amount: 0 }));
  }

  // Calculate exact shares in cents, then floor
  const items = lots.map((lot) => {
    const exactCents = (lot.entitlement / totalEntitlement) * totalAmount * 100;
    const flooredCents = Math.floor(exactCents);
    return {
      lotId: lot.id,
      flooredCents,
      remainder: exactCents - flooredCents,
    };
  });

  const totalCents = Math.round(totalAmount * 100);
  const flooredSum = items.reduce((sum, i) => sum + i.flooredCents, 0);
  let shortfall = totalCents - flooredSum;

  // Sort by remainder descending; award one extra cent to each until shortfall is zero
  const sorted = [...items].sort((a, b) => b.remainder - a.remainder);
  for (const item of sorted) {
    if (shortfall <= 0) break;
    item.flooredCents += 1;
    shortfall -= 1;
  }

  return items.map((i) => ({
    lotId: i.lotId,
    amount: i.flooredCents / 100,
  }));
}

/**
 * Fetch all levies for a scheme, newest first.
 */
export async function getLeviesForScheme(schemeId: string, limit = 200) {
  return db.orm.public.Levy
    .where((l) => and(l.schemeId.eq(schemeId), l.deletedAt.eq(null)))
    .include("items", (i) =>
      i.where((li) => li.deletedAt.eq(null)).include("lot"),
    )
    .orderBy((l) => l.createdAt.desc())
    .limit(limit)
    .all();
}

/**
 * Fetch a single levy by ID with its items and lot details.
 */
export async function getLevyById(levyId: string) {
  return db.orm.public.Levy
    .where((l) => and(l.id.eq(levyId), l.deletedAt.eq(null)))
    .include("items", (i) =>
      i.where((li) => li.deletedAt.eq(null)).include("lot"),
    )
    .first();
}

/**
 * Create a levy and auto-generate line items for every lot
 * based on entitlement shares.
 */
export async function createLevy(data: {
  schemeId: string;
  title: string;
  description?: string;
  totalAmount: number;
  dueDate: string;
  levyType: string;
}) {
  // Fetch all lots for the scheme to calculate shares
  const lots = await db.orm.public.Lot
    .where((l) => l.schemeId.eq(data.schemeId))
    .all();

  const totalEntitlement = lots.reduce((sum, lot) => sum + lot.entitlement, 0);
  const shares = apportionByEntitlement(lots, totalEntitlement, data.totalAmount);

  return db.transaction(async (tx) => {
    // Create the levy
    const levy = await tx.orm.public.Levy.create({
      schemeId: data.schemeId,
      title: data.title,
      description: data.description ?? null,
      totalAmount: toNumeric(data.totalAmount),
      dueDate: toTimestamp(data.dueDate),
      levyType: data.levyType,
      status: "DRAFT",
    });

    // Create a line item per lot using pre-apportioned amounts
    for (const share of shares) {
      await tx.orm.public.LevyItem.create({
        levyId: levy.id,
        lotId: share.lotId,
        amount: toNumeric(share.amount),
        paidAmount: toNumeric(0),
        status: "UNPAID",
      });
    }

    return levy;
  });
}

/**
 * Create multiple levies atomically in a single transaction.
 * Each levy gets auto-generated line items for every lot.
 */
export async function createLeviesBatch(
  items: Array<{
    schemeId: string;
    title: string;
    description?: string;
    totalAmount: number;
    dueDate: string;
    levyType: string;
  }>,
) {
  if (items.length === 0) return [];

  // All items share the same schemeId
  const schemeId = items[0].schemeId;
  const lots = await db.orm.public.Lot
    .where((l) => l.schemeId.eq(schemeId))
    .all();

  const totalEntitlement = lots.reduce((sum, lot) => sum + lot.entitlement, 0);

  return db.transaction(async (tx) => {
    const createdLevies = [];

    for (const data of items) {
      const shares = apportionByEntitlement(lots, totalEntitlement, data.totalAmount);

      const levy = await tx.orm.public.Levy.create({
        schemeId: data.schemeId,
        title: data.title,
        description: data.description ?? null,
        totalAmount: toNumeric(data.totalAmount),
        dueDate: toTimestamp(data.dueDate),
        levyType: data.levyType,
        status: "DRAFT",
      });

      for (const share of shares) {
        const amount = share.amount;

        await tx.orm.public.LevyItem.create({
          levyId: levy.id,
          lotId: share.lotId,
          amount: toNumeric(amount),
          paidAmount: toNumeric(0),
          status: "UNPAID",
        });
      }

      createdLevies.push(levy);
    }

    return createdLevies;
  });
}

/**
 * Update levy details (not items).
 */
export async function updateLevy(
  levyId: string,
  data: Partial<{
    title: string;
    description: string | null;
    totalAmount: number;
    dueDate: string;
    levyType: string;
    status: string;
  }>,
) {
  const updateData: Record<string, unknown> = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.totalAmount !== undefined) updateData.totalAmount = toNumeric(data.totalAmount);
  if (data.dueDate !== undefined) updateData.dueDate = toTimestamp(data.dueDate);
  if (data.levyType !== undefined) updateData.levyType = data.levyType;
  if (data.status !== undefined) updateData.status = data.status;

  return db.orm.public.Levy.where({ id: levyId }).update(updateData);
}

/**
 * Soft-delete a levy and its items.
 */
export async function deleteLevy(levyId: string) {
  const now = toTimestamp(new Date().toISOString());
  return db.transaction(async (tx) => {
    await tx.orm.public.LevyItem.where({ levyId }).update({ deletedAt: now });
    return tx.orm.public.Levy.where({ id: levyId }).update({ deletedAt: now });
  });
}

/**
 * Issue a levy (change status from DRAFT to ISSUED).
 */
export async function issueLevy(levyId: string) {
  return db.orm.public.Levy
    .where({ id: levyId })
    .update({ status: "ISSUED" });
}

/**
 * Mark a levy item as paid.
 */
export async function markLevyItemPaid(itemId: string, amount: number) {
  return db.orm.public.LevyItem
    .where({ id: itemId })
    .update({
      paidAmount: toNumeric(amount),
      status: "PAID",
      paidAt: toTimestamp(new Date().toISOString()),
    });
}

/**
 * Get levies across multiple schemes.
 */
export async function getLeviesForSchemes(schemeIds: string[], limit = 200) {
  if (schemeIds.length === 0) return [];

  return db.orm.public.Levy
    .where((l) => and(l.schemeId.in(schemeIds), l.deletedAt.eq(null)))
    .include("items", (i) => i.where((li) => li.deletedAt.eq(null)))
    .include("scheme")
    .orderBy((l) => l.dueDate.desc())
    .limit(limit)
    .all();
}

/**
 * Get levy items for a specific lot (owner view).
 */
export async function getLevyItemsForLot(lotId: string, limit = 200) {
  return db.orm.public.LevyItem
    .where((li) => and(li.lotId.eq(lotId), li.deletedAt.eq(null)))
    .include("levy")
    .limit(limit)
    .all();
}

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
