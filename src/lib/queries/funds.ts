import { rulesForScheme } from "@/lib/jurisdiction/scheme-rules";
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import { withLedgerBalances } from "@/lib/finance/fund-position";
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
 * Fetch all funds for a scheme, ordered by fund type. For a list or a choice
 * of fund: the stored `balance` column is not the fund's balance, so use
 * getFundsWithBalances wherever a balance is shown (financials review B2).
 */
export async function getFundsForScheme(schemeId: string, limit = 200) {
  return db.orm.public.Fund
    .where((f) => and(f.schemeId.eq(schemeId), f.deletedAt.eq(null)))
    .orderBy((f) => f.createdAt.asc())
    .limit(limit)
    .all();
}

/** A scheme's funds with `balance` and `cash` from the ledger as at today (financials review B2). */
export async function getFundsWithBalances(schemeId: string, limit = 200) {
  return withLedgerBalances(await getFundsForScheme(schemeId, limit));
}

/**
 * Fetch a single fund by ID.
 */
export async function getFundById(fundId: string) {
  return db.orm.public.Fund
    .where((f) => and(f.id.eq(fundId), f.deletedAt.eq(null)))
    .first();
}

/** A single fund with `balance` and `cash` from the ledger as at today. */
export async function getFundWithBalance(fundId: string) {
  const fund = await getFundById(fundId);
  if (!fund) return fund;
  return (await withLedgerBalances([fund]))[0];
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
  const { rules } = await rulesForScheme(data.schemeId);
  return db.orm.public.Fund.create({
    schemeId: data.schemeId,
    name: data.name,
    fundType: data.fundType,
    balance: toNumeric(data.balance ?? 0),
    accountingBasis: rules.defaultAccountingBasis(data.fundType),
  });
}

/**
 * Update a fund's name and balance.
 */
export async function updateFund(
  schemeId: string,
  fundId: string,
  data: Partial<{
    name: string;
    balance: number;
  }>,
) {
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.balance !== undefined) updateData.balance = toNumeric(data.balance);

  return db.orm.public.Fund.where((r) => and(r.id.eq(fundId), r.schemeId.eq(schemeId))).update(updateData);
}

/**
 * Fetch funds across multiple schemes (for owner/committee views), with
 * their ledger balances as at today.
 */
export async function getFundsForSchemes(schemeIds: string[], limit = 200) {
  if (schemeIds.length === 0) return [];
  const funds = await db.orm.public.Fund
    .where((f) => and(f.schemeId.in(schemeIds), f.deletedAt.eq(null)))
    .orderBy((f) => f.createdAt.asc())
    .limit(limit)
    .all();
  return withLedgerBalances(funds);
}

/**
 * Soft-delete a fund.
 */
export async function deleteFund(schemeId: string, fundId: string) {
  return db.orm.public.Fund
    .where((r) => and(r.id.eq(fundId), r.schemeId.eq(schemeId)))
    .update({ deletedAt: toTimestamp(new Date().toISOString()) });
}
