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
 * Fetch all levies for a scheme, newest first.
 */
export async function getLeviesForScheme(schemeId: string) {
  return db.orm.public.Levy
    .where((l) => and(l.schemeId.eq(schemeId), l.deletedAt.eq(null)))
    .include("items", (i) =>
      i.where((li) => li.deletedAt.eq(null)).include("lot"),
    )
    .orderBy((l) => l.createdAt.desc())
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

    // Create a line item per lot, proportional to entitlement
    for (const lot of lots) {
      const share = totalEntitlement > 0
        ? (lot.entitlement / totalEntitlement) * data.totalAmount
        : 0;
      const amount = Math.round(share * 100) / 100; // round to cents

      await tx.orm.public.LevyItem.create({
        levyId: levy.id,
        lotId: lot.id,
        amount: toNumeric(amount),
        paidAmount: toNumeric(0),
        status: "UNPAID",
      });
    }

    return levy;
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
export async function getLeviesForSchemes(schemeIds: string[]) {
  if (schemeIds.length === 0) return [];

  return db.orm.public.Levy
    .where((l) => and(l.schemeId.in(schemeIds), l.deletedAt.eq(null)))
    .include("items", (i) => i.where((li) => li.deletedAt.eq(null)))
    .include("scheme")
    .orderBy((l) => l.dueDate.desc())
    .all();
}

/**
 * Get levy items for a specific lot (owner view).
 */
export async function getLevyItemsForLot(lotId: string) {
  return db.orm.public.LevyItem
    .where((li) => and(li.lotId.eq(lotId), li.deletedAt.eq(null)))
    .include("levy")
    .all();
}
