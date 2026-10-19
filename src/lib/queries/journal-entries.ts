import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type {
  Numeric,
  TimestampString,
  Varchar,
} from "@prisma/orm-postgres/target/codec-types";
import { getFinancialPeriodsForScheme } from "./financial-periods";

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

// ─── Types ─────────────────────────────────────────────────────

interface JournalLineInput {
  accountCodeId: string;
  fundId: string;
  debit?: number;
  credit?: number;
  description?: string;
  lotId?: string;
  supplierId?: string;
  gstAmount?: number;
}

interface CreateJournalEntryInput {
  schemeId: string;
  entryNumber: string;
  transactionDate: string;
  description: string;
  entryType: string;
  sourceType: string;
  sourceId?: string;
  createdBy: string;
  lines: JournalLineInput[];
}

interface JournalEntryFilters {
  status?: string;
  entryType?: string;
  startDate?: string;
  endDate?: string;
}

// ─── Period Validation ────────────────────────────────────────

/**
 * Find the financial period that covers a given transaction date.
 * Returns null if no period exists for that date.
 */
export async function findPeriodForDate(
  schemeId: string,
  transactionDate: string,
) {
  const periods = await getFinancialPeriodsForScheme(schemeId);
  const txDate = transactionDate.slice(0, 10);

  return (
    periods.find((p) => {
      const start = String(p.startDate).slice(0, 10);
      const end = String(p.endDate).slice(0, 10);
      return txDate >= start && txDate <= end;
    }) ?? null
  );
}

/**
 * Validate that a journal entry can be posted to its transaction date's period.
 *
 * Rules:
 * - If no periods exist for the scheme, posting is allowed (periods not yet set up).
 * - If the date falls within an OPEN period, posting is allowed.
 * - If the date falls within a CLOSED period, only ADJUSTMENT entries are allowed.
 * - If the date falls within a LOCKED period, no entries are allowed.
 * - If the date doesn't fall within any period, posting is allowed (gap tolerance).
 *
 * Throws an error when posting is blocked.
 */
export async function validatePeriodForPosting(
  schemeId: string,
  transactionDate: string,
  entryType: string,
) {
  const period = await findPeriodForDate(schemeId, transactionDate);

  // No matching period — allow (periods may not be set up yet or date is in a gap)
  if (!period) return;

  if (period.status === "LOCKED") {
    throw new Error(
      `Cannot post to a locked period (${String(period.name)}). The period must be reopened before any entries can be posted.`,
    );
  }

  if (period.status === "CLOSED" && entryType !== "ADJUSTMENT") {
    throw new Error(
      `Cannot post to a closed period (${String(period.name)}). Use an adjustment entry or reopen the period first.`,
    );
  }

  // OPEN period or CLOSED + ADJUSTMENT — allowed
}

// ─── Validation Helpers (exported for unit testing) ──────────

export interface JournalBalanceResult {
  isBalanced: boolean;
  totalDebits: number;
  totalCredits: number;
}

/**
 * Validate that journal lines are balanced (total debits === total credits)
 * and that there is at least one line. Pure function, no DB access.
 */
export function validateJournalBalance(
  lines: Array<{ debit?: number; credit?: number }>,
): JournalBalanceResult {
  const totalDebits = lines.reduce(
    (sum, line) => sum + (line.debit ?? 0),
    0,
  );
  const totalCredits = lines.reduce(
    (sum, line) => sum + (line.credit ?? 0),
    0,
  );
  const roundedDebits = Math.round(totalDebits * 100) / 100;
  const roundedCredits = Math.round(totalCredits * 100) / 100;

  return {
    isBalanced: roundedDebits === roundedCredits,
    totalDebits: roundedDebits,
    totalCredits: roundedCredits,
  };
}

/**
 * Determine whether a posting is allowed for a given period status and entry type.
 * Returns null if allowed, or an error message string if blocked.
 * Pure function, no DB access.
 */
export function checkPeriodPostingRule(
  periodStatus: string,
  periodName: string,
  entryType: string,
): string | null {
  if (periodStatus === "LOCKED") {
    return `Cannot post to a locked period (${periodName}). The period must be reopened before any entries can be posted.`;
  }
  if (periodStatus === "CLOSED" && entryType !== "ADJUSTMENT") {
    return `Cannot post to a closed period (${periodName}). Use an adjustment entry or reopen the period first.`;
  }
  return null;
}

// ─── Queries ───────────────────────────────────────────────────

/**
 * Fetch journal entries for a scheme with optional filters.
 * Includes lines with their account codes.
 */
export async function getJournalEntriesForScheme(
  schemeId: string,
  filters?: JournalEntryFilters,
  limit = 200,
) {
  let query = db.orm.public.JournalEntry.where((je) =>
    and(je.schemeId.eq(schemeId)),
  );

  if (filters?.status) {
    query = query.where((je) => je.status.eq(filters.status!));
  }
  if (filters?.entryType) {
    query = query.where((je) => je.entryType.eq(filters.entryType!));
  }
  if (filters?.startDate) {
    query = query.where((je) =>
      je.transactionDate.gte(toTimestamp(filters.startDate!)),
    );
  }
  if (filters?.endDate) {
    query = query.where((je) =>
      je.transactionDate.lte(toTimestamp(filters.endDate!)),
    );
  }

  return query
    .include("lines", (l) => l.include("accountCode").include("fund"))
    .orderBy((je) => je.transactionDate.desc())
    .limit(limit)
    .all();
}

/**
 * Fetch a single journal entry by ID with full line details.
 */
export async function getJournalEntryById(entryId: string) {
  try {
    return db.orm.public.JournalEntry
      .where((je) => je.id.eq(entryId))
      .include("lines", (l) =>
        l
          .include("accountCode")
          .include("fund")
          .include("lot")
          .include("supplier"),
      )
      .first();
  } catch {
    // Table may not exist yet
    return null;
  }
}

/**
 * Create a journal entry with lines in a single transaction.
 * Validates that total debits equal total credits before persisting.
 */
export async function createJournalEntry(data: CreateJournalEntryInput) {
  // Validate debit/credit balance
  const totalDebits = data.lines.reduce(
    (sum, line) => sum + (line.debit ?? 0),
    0,
  );
  const totalCredits = data.lines.reduce(
    (sum, line) => sum + (line.credit ?? 0),
    0,
  );

  const roundedDebits = Math.round(totalDebits * 100) / 100;
  const roundedCredits = Math.round(totalCredits * 100) / 100;

  if (roundedDebits !== roundedCredits) {
    throw new Error(
      `Journal entry is not balanced: debits (${roundedDebits}) do not equal credits (${roundedCredits})`,
    );
  }

  if (data.lines.length === 0) {
    throw new Error("Journal entry must have at least one line");
  }

  return db.transaction(async (tx) => {
    const entry = await tx.orm.public.JournalEntry.create({
      schemeId: data.schemeId,
      entryNumber: toVarchar<20>(data.entryNumber),
      transactionDate: toTimestamp(data.transactionDate),
      description: toVarchar<500>(data.description),
      entryType: data.entryType,
      sourceType: data.sourceType,
      sourceId: data.sourceId ?? null,
      status: "DRAFT",
      createdBy: data.createdBy,
    });

    for (const line of data.lines) {
      await tx.orm.public.JournalLine.create({
        journalEntryId: entry.id,
        accountCodeId: line.accountCodeId,
        fundId: line.fundId,
        debit: line.debit != null ? toNumeric(line.debit) : null,
        credit: line.credit != null ? toNumeric(line.credit) : null,
        description: line.description ? toVarchar<500>(line.description) : null,
        lotId: line.lotId ?? null,
        supplierId: line.supplierId ?? null,
        gstAmount: line.gstAmount != null ? toNumeric(line.gstAmount) : null,
      });
    }

    return entry;
  });
}

/**
 * Post a journal entry (transition from DRAFT to POSTED).
 *
 * Validates the transaction date against financial periods:
 * - OPEN periods allow all entries
 * - CLOSED periods allow only ADJUSTMENT entries
 * - LOCKED periods block all entries
 *
 * Pass skipPeriodCheck = true only for system-generated entries
 * (e.g. levy issuance, payment recording) that must go through
 * regardless of period status.
 */
export async function postJournalEntry(
  entryId: string,
  postedBy: string,
  skipPeriodCheck = false,
) {
  // Fetch the entry to get its transaction date and scheme
  const entry = await db.orm.public.JournalEntry
    .where((je) => je.id.eq(entryId))
    .first();

  if (!entry) {
    throw new Error("Journal entry not found.");
  }

  if (entry.status !== "DRAFT") {
    throw new Error("Only draft journal entries can be posted.");
  }

  // Validate against financial period unless explicitly skipped
  if (!skipPeriodCheck) {
    await validatePeriodForPosting(
      entry.schemeId,
      String(entry.transactionDate).slice(0, 10),
      entry.entryType,
    );
  }

  return db.orm.public.JournalEntry
    .where({ id: entryId })
    .update({
      status: "POSTED",
      postedAt: toTimestamp(new Date().toISOString()),
      postedBy,
    });
}

/**
 * Reverse a posted journal entry. Creates a new reversal entry with
 * mirror lines (debits and credits swapped) and marks the original
 * as REVERSED.
 */
export async function reverseJournalEntry(
  originalEntryId: string,
  data: { entryNumber: string; createdBy: string; description?: string },
) {
  const original = await db.orm.public.JournalEntry
    .where((je) => je.id.eq(originalEntryId))
    .include("lines")
    .first();

  if (!original) {
    throw new Error("Original journal entry not found");
  }

  if (original.status !== "POSTED") {
    throw new Error("Only posted journal entries can be reversed");
  }

  return db.transaction(async (tx) => {
    // Create the reversal entry
    const reversalEntry = await tx.orm.public.JournalEntry.create({
      schemeId: original.schemeId,
      entryNumber: toVarchar<20>(data.entryNumber),
      transactionDate: toTimestamp(new Date().toISOString().split("T")[0]),
      description: toVarchar<500>(
        data.description ?? `Reversal of ${original.entryNumber}`,
      ),
      entryType: "REVERSAL",
      sourceType: "REVERSAL",
      sourceId: original.id,
      status: "POSTED",
      reversalOfId: original.id,
      postedAt: toTimestamp(new Date().toISOString()),
      postedBy: data.createdBy,
      createdBy: data.createdBy,
    });

    // Create mirror lines (swap debit and credit)
    for (const line of original.lines) {
      await tx.orm.public.JournalLine.create({
        journalEntryId: reversalEntry.id,
        accountCodeId: line.accountCodeId,
        fundId: line.fundId,
        debit: line.credit,
        credit: line.debit,
        description: line.description
          ? toVarchar<500>(`Reversal: ${line.description}`)
          : null,
        lotId: line.lotId ?? null,
        supplierId: line.supplierId ?? null,
        gstAmount: line.gstAmount,
      });
    }

    // Mark the original as reversed
    await tx.orm.public.JournalEntry
      .where({ id: originalEntryId })
      .update({ status: "REVERSED" });

    return reversalEntry;
  });
}

/**
 * Find journal entries linked to a specific source document.
 */
export async function getJournalEntriesBySource(
  schemeId: string,
  sourceType: string,
  sourceId: string,
  limit = 200,
) {
  return db.orm.public.JournalEntry
    .where((je) =>
      and(
        je.schemeId.eq(schemeId),
        je.sourceType.eq(sourceType),
        je.sourceId.eq(sourceId),
      ),
    )
    .include("lines", (l) => l.include("accountCode").include("fund"))
    .orderBy((je) => je.transactionDate.desc())
    .limit(limit)
    .all();
}

/**
 * Generate the next sequential journal entry number for a scheme.
 * Format: JE-0001, JE-0002, etc.
 */
/**
 * Fetch posted journal entries that have not been matched to a bank transaction.
 * Used for reconciliation matching. Optionally filter by a bank account's fund.
 */
export async function getUnmatchedJournalEntries(
  schemeId: string,
  limit = 200,
) {
  // Get all posted entries, then filter out ones already matched to a bank transaction
  const entries = await db.orm.public.JournalEntry
    .where((je) =>
      and(je.schemeId.eq(schemeId), je.status.eq("POSTED")),
    )
    .include("lines", (l) => l.include("accountCode").include("fund"))
    .orderBy((je) => je.transactionDate.desc())
    .limit(limit)
    .all();

  // Filter out entries that are already matched to bank transactions
  // Only fetch transactions that actually have a match (much smaller set)
  const matchedTxns = await db.orm.public.BankTransaction
    .where((t) => and(t.schemeId.eq(schemeId), t.matchedJournalEntryId.isNotNull()))
    .limit(1000)
    .all();

  const matchedEntryIds = new Set<string>();
  for (const txn of matchedTxns) {
    if (txn.matchedJournalEntryId) {
      matchedEntryIds.add(txn.matchedJournalEntryId);
    }
  }

  return entries.filter((e) => !matchedEntryIds.has(e.id));
}

export async function getNextEntryNumber(schemeId: string): Promise<string> {
  try {
    const entries = await db.orm.public.JournalEntry
      .where((je) => je.schemeId.eq(schemeId))
      .orderBy((je) => je.entryNumber.desc())
      .limit(1)
      .all();

    if (entries.length === 0) return "JE-0001";

    // Parse the numeric portion of the last entry number
    const last = String(entries[0].entryNumber);
    const match = last.match(/(\d+)$/);
    const nextNum = match ? parseInt(match[1], 10) + 1 : 1;
    return `JE-${String(nextNum).padStart(4, "0")}`;
  } catch {
    // Table may not exist yet
    return "JE-0001";
  }
}
