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
 */
export async function postJournalEntry(entryId: string, postedBy: string) {
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
    .all();
}

/**
 * Generate the next sequential journal entry number for a scheme.
 * Format: JE-0001, JE-0002, etc.
 */
export async function getNextEntryNumber(schemeId: string): Promise<string> {
  const entries = await db.orm.public.JournalEntry
    .where((je) => je.schemeId.eq(schemeId))
    .all();

  const nextNum = entries.length + 1;
  return `JE-${String(nextNum).padStart(4, "0")}`;
}
