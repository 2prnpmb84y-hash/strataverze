import { defaultAccountingBasis } from "@/config/statutory";
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { Numeric, TimestampString } from "@prisma/orm-postgres/target/codec-types";

/** Cast an ISO string to the Prisma 8 TimestampString branded type. */
function toTimestamp(value: string): TimestampString<3> {
  return value as unknown as TimestampString<3>;
}

/** Cast a number or string to the Prisma 8 Numeric branded type. */
function toNumeric(value: number | string): Numeric<12, 2> {
  return String(value) as unknown as Numeric<12, 2>;
}

/**
 * Fetch all funds for a scheme, ordered by fund type.
 */
export async function getFundsForScheme(schemeId: string, limit = 200) {
  return db.orm.public.Fund
    .where((f) => and(f.schemeId.eq(schemeId), f.deletedAt.eq(null)))
    .orderBy((f) => f.createdAt.asc())
    .limit(limit)
    .all();
}

/**
 * Fetch a single fund by ID.
 */
export async function getFundById(fundId: string) {
  return db.orm.public.Fund
    .where((f) => and(f.id.eq(fundId), f.deletedAt.eq(null)))
    .first();
}

/**
 * Create a fund for a scheme.
 */
export async function createFund(data: {
  schemeId: string;
  name: string;
  fundType: string;
  balance?: number;
}) {
  return db.orm.public.Fund.create({
    schemeId: data.schemeId,
    name: data.name,
    fundType: data.fundType,
    balance: toNumeric(data.balance ?? 0),
    accountingBasis: defaultAccountingBasis(data.fundType),
  });
}

/**
 * Update a fund's name and balance.
 */
export async function updateFund(
  fundId: string,
  data: Partial<{
    name: string;
    balance: number;
  }>,
) {
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.balance !== undefined) updateData.balance = toNumeric(data.balance);

  return db.orm.public.Fund.where({ id: fundId }).update(updateData);
}

/**
 * Fetch funds across multiple schemes (for owner/committee views).
 */
export async function getFundsForSchemes(schemeIds: string[], limit = 200) {
  if (schemeIds.length === 0) return [];
  return db.orm.public.Fund
    .where((f) => and(f.schemeId.in(schemeIds), f.deletedAt.eq(null)))
    .orderBy((f) => f.createdAt.asc())
    .limit(limit)
    .all();
}

/**
 * Soft-delete a fund.
 */
export async function deleteFund(fundId: string) {
  return db.orm.public.Fund
    .where({ id: fundId })
    .update({ deletedAt: toTimestamp(new Date().toISOString()) });
}
