import { db } from "@/prisma/db";
import type { Numeric } from "@prisma/orm-postgres/target/codec-types";

/** Cast a number or string to the Prisma 8 Numeric branded type. */
function toNumeric(value: number | string): Numeric<12, 2> {
  return String(value) as unknown as Numeric<12, 2>;
}

/**
 * Fetch all funds for a scheme, ordered by fund type.
 */
export async function getFundsForScheme(schemeId: string) {
  return db.orm.public.Fund
    .where((f) => f.schemeId.eq(schemeId))
    .orderBy((f) => f.createdAt.asc())
    .all();
}

/**
 * Fetch a single fund by ID.
 */
export async function getFundById(fundId: string) {
  return db.orm.public.Fund.first({ id: fundId });
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
 * Delete a fund.
 */
export async function deleteFund(fundId: string) {
  return db.orm.public.Fund.where({ id: fundId }).delete();
}
