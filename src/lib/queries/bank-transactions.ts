import { db } from "@/prisma/db";
import { splitByFitId } from "@/lib/bank-import-parser";
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
 * Import bank transactions. OFX transactions whose FITID is already recorded
 * for the account are skipped (TC-012). Others matching an existing
 * transaction on date, amount and description are inserted but flagged with
 * isDuplicate = true for review.
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
    fitId?: string;
    importSource: string;
    importBatchId?: string;
  }>,
): Promise<{ created: Awaited<ReturnType<typeof db.orm.public.BankTransaction.create>>[]; skipped: number }> {
  if (transactions.length === 0) return { created: [], skipped: 0 };

  return db.transaction(async (tx) => {
    // FITIDs already recorded for each account: the fitid column, and the reference of earlier OFX imports.
    const known = new Map<string, Set<string>>();
    for (const accountId of new Set(transactions.filter((t) => t.fitId).map((t) => t.bankAccountId))) {
      const rows = await tx.orm.public.BankTransaction.where((t) => t.bankAccountId.eq(accountId)).limit(100000).all();
      known.set(
        accountId,
        new Set(rows.flatMap((r) => [r.fitid ? String(r.fitid) : null, r.importSource === "OFX_IMPORT" && r.reference ? String(r.reference) : null]).filter((x): x is string => !!x)),
      );
    }
    let skipped = 0;
    const fresh: typeof transactions = [];
    for (const accountId of new Set(transactions.map((t) => t.bankAccountId))) {
      const split = splitByFitId(transactions.filter((t) => t.bankAccountId === accountId), known.get(accountId) ?? new Set());
      skipped += split.skipped.length;
      fresh.push(...split.fresh);
    }

    const created = [];
    for (const txn of fresh) {
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
        reference: txn.reference ? toVarchar<100>(txn.reference.slice(0, 100)) : null,
        balance: txn.balance !== undefined ? toNumeric(txn.balance) : null,
        importSource: txn.importSource,
        importBatchId: txn.importBatchId ?? null,
        isDuplicate,
        fitid: txn.fitId ? toVarchar<255>(txn.fitId.slice(0, 255)) : null,
      });

      created.push(record);
    }

    return { created, skipped };
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
export async function excludeTransaction(transactionId: string, reason: string) {
  try {
    return db.orm.public.BankTransaction
      .where({ id: transactionId })
      .update({
        reconciliationStatus: "EXCLUDED",
        exclusionReason: reason,
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
