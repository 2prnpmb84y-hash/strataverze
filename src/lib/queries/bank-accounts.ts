import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { Numeric, TimestampString, Varchar } from "@prisma/orm-postgres/target/codec-types";

/** Cast a number or string to the Prisma 8 Numeric branded type. */
function toNumeric(value: number | string): Numeric<12, 2> {
  return String(value) as unknown as Numeric<12, 2>;
}

/** Cast an ISO string to the Prisma 8 TimestampString branded type. */
function toTimestamp(value: string): TimestampString<3> {
  return value as unknown as TimestampString<3>;
}

/** Cast a plain string to the Prisma 8 Varchar branded type. */
function toVarchar<N extends number>(value: string): Varchar<N> {
  return value as unknown as Varchar<N>;
}

/**
 * Fetch all active bank accounts for a scheme, ordered by account name.
 */
export async function getBankAccountsForScheme(schemeId: string, limit = 200) {
  try {
    return db.orm.public.SchemeBankAccount
      .where((ba) => and(ba.schemeId.eq(schemeId), ba.isActive.eq(true)))
      .orderBy((ba) => ba.accountName.asc())
      .limit(limit)
      .all();
  } catch {
    // Table may not exist yet
    return [];
  }
}

/**
 * Fetch a single bank account by ID, including its linked funds.
 */
export async function getBankAccountById(bankAccountId: string) {
  try {
    return db.orm.public.SchemeBankAccount
      .where((ba) => ba.id.eq(bankAccountId))
      .include("funds")
      .first();
  } catch {
    // Table may not exist yet
    return null;
  }
}

/**
 * Fetch the operating (primary) bank account for a scheme.
 */
export async function getOperatingAccount(schemeId: string) {
  try {
    return db.orm.public.SchemeBankAccount
      .where((ba) =>
        and(
          ba.schemeId.eq(schemeId),
          ba.isOperating.eq(true),
          ba.isActive.eq(true),
        ),
      )
      .first();
  } catch {
    // Table may not exist yet
    return null;
  }
}

/**
 * Create a new bank account for a scheme.
 */
export async function createBankAccount(data: {
  schemeId: string;
  accountName: string;
  bsb: string;
  accountNumber: string;
  bankName?: string;
  accountType?: string;
  isOperating?: boolean;
}) {
  return db.orm.public.SchemeBankAccount.create({
    schemeId: data.schemeId,
    accountName: data.accountName,
    bsb: toVarchar<7>(data.bsb),
    accountNumber: toVarchar<20>(data.accountNumber),
    bankName: data.bankName ?? null,
    accountType: data.accountType ?? "CHEQUE",
    isOperating: data.isOperating ?? false,
  });
}

/**
 * Partially update a bank account's details.
 */
export async function updateBankAccount(
  bankAccountId: string,
  data: Partial<{
    accountName: string;
    bankName: string | null;
    accountType: string;
    isOperating: boolean;
    isActive: boolean;
    bankFeedEnabled: boolean;
  }>,
) {
  const updateData: Record<string, unknown> = {};
  if (data.accountName !== undefined) updateData.accountName = data.accountName;
  if (data.bankName !== undefined) updateData.bankName = data.bankName;
  if (data.accountType !== undefined) updateData.accountType = data.accountType;
  if (data.isOperating !== undefined) updateData.isOperating = data.isOperating;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  if (data.bankFeedEnabled !== undefined) updateData.bankFeedEnabled = data.bankFeedEnabled;

  return db.orm.public.SchemeBankAccount
    .where({ id: bankAccountId })
    .update(updateData);
}

/**
 * Update the reconciliation status of a bank account after completing
 * a bank reconciliation.
 */
export async function updateReconciliationStatus(
  bankAccountId: string,
  date: string,
  balance: number,
) {
  return db.orm.public.SchemeBankAccount
    .where({ id: bankAccountId })
    .update({
      lastReconciledDate: toTimestamp(date),
      lastReconciledBalance: toNumeric(balance),
    });
}

/**
 * Deactivate a bank account (soft-disable via isActive flag).
 */
export async function deactivateBankAccount(bankAccountId: string) {
  try {
    return db.orm.public.SchemeBankAccount
      .where({ id: bankAccountId })
      .update({ isActive: false });
  } catch {
    // Table may not exist yet
    return [];
  }
}
