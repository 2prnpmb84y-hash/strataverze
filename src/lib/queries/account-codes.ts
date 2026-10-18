import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { Varchar } from "@prisma/orm-postgres/target/codec-types";

/** Cast a plain string to the Prisma 8 Varchar branded type. */
function toVarchar<N extends number>(value: string): Varchar<N> {
  return value as unknown as Varchar<N>;
}

/**
 * Fetch all active account codes for a scheme, ordered by code.
 */
export async function getAccountCodesForScheme(
  schemeId: string,
  limit = 200,
) {
  return db.orm.public.AccountCode
    .where((a) => and(a.schemeId.eq(schemeId), a.isActive.eq(true)))
    .include("fund")
    .include("childAccounts")
    .orderBy((a) => a.code.asc())
    .limit(limit)
    .all();
}

/**
 * Fetch a single account code by ID with fund, parent and children.
 */
export async function getAccountCodeById(accountCodeId: string) {
  try {
    return db.orm.public.AccountCode
      .where((a) => a.id.eq(accountCodeId))
      .include("fund")
      .include("parentAccount")
      .include("childAccounts")
      .first();
  } catch {
    // Table may not exist yet
    return null;
  }
}

/**
 * Fetch active account codes for a scheme filtered by account type.
 */
export async function getAccountCodesByType(
  schemeId: string,
  accountType: string,
  limit = 200,
) {
  return db.orm.public.AccountCode
    .where((a) =>
      and(
        a.schemeId.eq(schemeId),
        a.accountType.eq(accountType),
        a.isActive.eq(true),
      ),
    )
    .include("fund")
    .orderBy((a) => a.code.asc())
    .limit(limit)
    .all();
}

/**
 * Fetch active account codes for a scheme filtered by fund.
 */
export async function getAccountCodesByFund(
  schemeId: string,
  fundId: string,
  limit = 200,
) {
  return db.orm.public.AccountCode
    .where((a) =>
      and(
        a.schemeId.eq(schemeId),
        a.fundId.eq(fundId),
        a.isActive.eq(true),
      ),
    )
    .orderBy((a) => a.code.asc())
    .limit(limit)
    .all();
}

/**
 * Create an account code entry.
 */
export async function createAccountCode(data: {
  schemeId: string;
  code: string;
  name: string;
  accountType: string;
  accountSubType?: string;
  fundId?: string;
  parentAccountId?: string;
  isSystemAccount?: boolean;
  gstApplicable?: boolean;
  description?: string;
}) {
  return db.orm.public.AccountCode.create({
    schemeId: data.schemeId,
    code: toVarchar<10>(data.code),
    name: toVarchar<200>(data.name),
    accountType: data.accountType,
    accountSubType: data.accountSubType ?? null,
    fundId: data.fundId ?? null,
    parentAccountId: data.parentAccountId ?? null,
    isSystemAccount: data.isSystemAccount ?? false,
    gstApplicable: data.gstApplicable ?? false,
    description: data.description ?? null,
  });
}

/**
 * Update an account code's mutable fields.
 */
export async function updateAccountCode(
  accountCodeId: string,
  data: Partial<{
    name: string;
    accountSubType: string | null;
    fundId: string | null;
    parentAccountId: string | null;
    gstApplicable: boolean;
    description: string | null;
    isActive: boolean;
  }>,
) {
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = toVarchar<200>(data.name);
  if (data.accountSubType !== undefined)
    updateData.accountSubType = data.accountSubType;
  if (data.fundId !== undefined) updateData.fundId = data.fundId;
  if (data.parentAccountId !== undefined)
    updateData.parentAccountId = data.parentAccountId;
  if (data.gstApplicable !== undefined)
    updateData.gstApplicable = data.gstApplicable;
  if (data.description !== undefined)
    updateData.description = data.description;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  return db.orm.public.AccountCode
    .where({ id: accountCodeId })
    .update(updateData);
}

/**
 * Deactivate an account code (soft-disable, not delete).
 */
export async function deactivateAccountCode(accountCodeId: string) {
  try {
    return db.orm.public.AccountCode
      .where({ id: accountCodeId })
      .update({ isActive: false });
  } catch {
    // Table may not exist yet
    return [];
  }
}

/**
 * Fetch all system accounts for a scheme.
 */
export async function getSystemAccounts(schemeId: string, limit = 100) {
  try {
    return db.orm.public.AccountCode
      .where((a) =>
        and(
          a.schemeId.eq(schemeId),
          a.isSystemAccount.eq(true),
          a.isActive.eq(true),
        ),
      )
      .include("fund")
      .orderBy((a) => a.code.asc())
      .limit(limit)
      .all();
  } catch {
    // Table may not exist yet
    return [];
  }
}

/**
 * Look up a system account by its sub-type and fund type.
 *
 * Used by automated journal entry generation to find the correct
 * account for double-entry postings (e.g. Levies Receivable for a
 * specific fund, Accounts Payable, Bank Account).
 *
 * Returns null if the scheme's chart of accounts has not been seeded
 * or the requested account type does not exist.
 */
export async function getSystemAccountBySubType(
  schemeId: string,
  accountSubType: string,
  fundType?: "ADMINISTRATIVE" | "CAPITAL_WORKS",
) {
  const accounts = await db.orm.public.AccountCode
    .where((a) =>
      and(
        a.schemeId.eq(schemeId),
        a.isSystemAccount.eq(true),
        a.isActive.eq(true),
        a.accountSubType.eq(accountSubType),
      ),
    )
    .include("fund")
    .limit(10)
    .all();

  if (!fundType) return accounts[0] ?? null;

  return accounts.find((a) => a.fund?.fundType === fundType) ?? null;
}
