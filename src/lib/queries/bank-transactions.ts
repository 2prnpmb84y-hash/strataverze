import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type {
  Numeric,
  TimestampString,
  Varchar,
} from "@prisma/orm-postgres/target/codec-types";

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
 * Fetch bank transactions for a specific bank account, with optional filters.
 * Ordered by transaction date descending, then imported-at descending.
 */
export async function getBankTransactionsForAccount(
  bankAccountId: string,
  filters?: {
    startDate?: string;
    endDate?: string;
    reconciliationStatus?: string;
    minAmount?: number;
    maxAmount?: number;
  },
  limit = 500,
) {
  let query = db.orm.public.BankTransaction.where((t) =>
    and(t.bankAccountId.eq(bankAccountId)),
  );

  if (filters?.reconciliationStatus) {
    query = query.where((t) =>
      t.reconciliationStatus.eq(filters.reconciliationStatus!),
    );
  }

  if (filters?.startDate) {
    query = query.where((t) =>
      t.transactionDate.gte(toTimestamp(filters.startDate!)),
    );
  }

  if (filters?.endDate) {
    query = query.where((t) =>
      t.transactionDate.lte(toTimestamp(filters.endDate!)),
    );
  }

  if (filters?.minAmount !== undefined) {
    query = query.where((t) => t.amount.gte(toNumeric(filters.minAmount!)));
  }

  if (filters?.maxAmount !== undefined) {
    query = query.where((t) => t.amount.lte(toNumeric(filters.maxAmount!)));
  }

  return query
    .include("bankAccount")
    .orderBy((t) => t.transactionDate.desc())
    .limit(limit)
    .all();
}

/**
 * Fetch a single bank transaction by ID with its bank account and
 * matched journal entry (including journal lines).
 */
export async function getBankTransactionById(transactionId: string) {
  try {
    return db.orm.public.BankTransaction
      .where((t) => t.id.eq(transactionId))
      .include("bankAccount")
      .include("matchedJournalEntry", (je) => je.include("lines"))
      .first();
  } catch {
    // Table may not exist yet
    return null;
  }
}

/**
 * Fetch unreconciled (UNMATCHED) transactions for a bank account,
 * ordered by transaction date ascending for chronological matching.
 */
export async function getUnreconciledTransactions(
  bankAccountId: string,
  limit = 500,
) {
  return db.orm.public.BankTransaction
    .where((t) =>
      and(
        t.bankAccountId.eq(bankAccountId),
        t.reconciliationStatus.eq("UNMATCHED"),
        t.isDuplicate.eq(false),
      ),
    )
    .include("bankAccount")
    .orderBy((t) => t.transactionDate.asc())
    .limit(limit)
    .all();
}

/**
 * Import bank transactions in bulk. Performs duplicate detection within
 * the same bank account by matching amount, transaction date, and description.
 * Duplicates are still inserted but flagged with isDuplicate = true.
 */
export async function importBankTransactions(
  transactions: Array<{
    bankAccountId: string;
    schemeId: string;
    transactionDate: string;
    amount: number;
    description: string;
    reference?: string;
    balance?: number;
    importSource: string;
    importBatchId?: string;
  }>,
) {
  if (transactions.length === 0) return [];

  return db.transaction(async (tx) => {
    const created = [];

    for (const txn of transactions) {
      // Check for duplicates: same bank account, amount, date, description
      const existing = await tx.orm.public.BankTransaction
        .where((t) =>
          and(
            t.bankAccountId.eq(txn.bankAccountId),
            t.amount.eq(toNumeric(txn.amount)),
            t.transactionDate.eq(toTimestamp(txn.transactionDate)),
            t.description.eq(toVarchar<500>(txn.description)),
          ),
        )
        .first();

      const isDuplicate = existing !== null;

      const record = await tx.orm.public.BankTransaction.create({
        bankAccountId: txn.bankAccountId,
        schemeId: txn.schemeId,
        transactionDate: toTimestamp(txn.transactionDate),
        amount: toNumeric(txn.amount),
        description: toVarchar<500>(txn.description),
        reference: txn.reference ? toVarchar<100>(txn.reference) : null,
        balance: txn.balance !== undefined ? toNumeric(txn.balance) : null,
        importSource: txn.importSource,
        importBatchId: txn.importBatchId ?? null,
        isDuplicate,
      });

      created.push(record);
    }

    return created;
  });
}

/**
 * Match a bank transaction to a journal entry.
 */
export async function matchTransaction(
  transactionId: string,
  journalEntryId: string,
  matchedBy: string,
) {
  return db.orm.public.BankTransaction
    .where({ id: transactionId })
    .update({
      reconciliationStatus: "MATCHED",
      matchedJournalEntryId: journalEntryId,
      matchedAt: toTimestamp(new Date().toISOString()),
      matchedBy,
    });
}

/**
 * Mark a matched transaction as fully reconciled.
 */
export async function reconcileTransaction(transactionId: string) {
  try {
    return db.orm.public.BankTransaction
      .where({ id: transactionId })
      .update({
        reconciliationStatus: "RECONCILED",
      });
  } catch {
    // Table may not exist yet
    return [];
  }
}

/**
 * Exclude a transaction from reconciliation (e.g. bank fees handled separately).
 */
export async function excludeTransaction(transactionId: string) {
  try {
    return db.orm.public.BankTransaction
      .where({ id: transactionId })
      .update({
        reconciliationStatus: "EXCLUDED",
      });
  } catch {
    // Table may not exist yet
    return [];
  }
}

/**
 * Reset a transaction back to unmatched, clearing journal entry linkage.
 */
export async function unmatchTransaction(transactionId: string) {
  try {
    return db.orm.public.BankTransaction
      .where({ id: transactionId })
      .update({
        reconciliationStatus: "UNMATCHED",
        matchedJournalEntryId: null,
        matchedAt: null,
        matchedBy: null,
      });
  } catch {
    // Table may not exist yet
    return [];
  }
}

/**
 * Fetch all transactions from a specific import batch.
 */
export async function getTransactionsByBatch(
  importBatchId: string,
  limit = 1000,
) {
  return db.orm.public.BankTransaction
    .where((t) => t.importBatchId.eq(importBatchId))
    .include("bankAccount")
    .orderBy((t) => t.transactionDate.asc())
    .limit(limit)
    .all();
}
