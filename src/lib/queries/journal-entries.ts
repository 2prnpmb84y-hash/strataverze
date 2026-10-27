import { db } from "@/prisma/db";
import { schemeToday } from "@/lib/jurisdiction/scheme-time";
import { and } from "@prisma/orm-postgres/orm-client";
import type {
  Numeric,
  TimestampString,
  Varchar,
} from "@prisma/orm-postgres/target/codec-types";
import { getFinancialPeriodsForScheme } from "./financial-periods";
import { assertFundIntegrity } from "@/lib/finance/fund-integrity";

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

export interface CreateJournalEntryInput {
  schemeId: string;
  entryNumber: string;
  transactionDate: string;
  description: string;
  entryType: string;
  sourceType: string;
  sourceId?: string;
  /** The rule pack the entry was worked out under (interest charges). */
  rulePack?: string | null;
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
  /** A transaction's `tx.orm`, to read inside it. */
  orm: typeof db.orm = db.orm,
) {
  const periods = await getFinancialPeriodsForScheme(schemeId, 50, orm);
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
  /** A transaction's `tx.orm`, to read inside it. */
  orm: typeof db.orm = db.orm,
) {
  const period = await findPeriodForDate(schemeId, transactionDate, orm);

  // No matching period — allow (periods may not be set up yet or date is in a gap)
  if (!period) return;

  // One rule, shared with the pure check below.
  const problem = checkPeriodPostingRule(String(period.status), String(period.name), entryType);
  if (problem) throw new Error(problem);

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
    // TC-010 wording.
    return `This period is locked. Contact your system administrator to unlock. (${periodName})`;
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
 *
 * `orm`: a transaction's `tx.orm`. The entry and its lines are then written
 * in the caller's transaction (no transaction of their own), and the checks
 * read through it, so nothing waits for a second pool connection while the
 * caller holds locks. A caller that numbers the entry holds the building's
 * numbering lock (src/lib/queries/journal-numbering.ts).
 */
export async function createJournalEntry(data: CreateJournalEntryInput, orm?: typeof db.orm) {
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

  // Each fund balances on its own, and each account is used for its own fund
  // (financials review B1, 26 Oct 2026).
  await assertFundIntegrity(orm ?? db.orm, data.schemeId, data.lines);

  const write = async (tx: { orm: typeof db.orm }) => {
    const entry = await tx.orm.public.JournalEntry.create({
      schemeId: data.schemeId,
      entryNumber: toVarchar<20>(data.entryNumber),
      transactionDate: toTimestamp(data.transactionDate),
      description: toVarchar<500>(data.description),
      entryType: data.entryType,
      sourceType: data.sourceType,
      sourceId: data.sourceId ?? null,
      rulePack: data.rulePack ? toVarchar<40>(data.rulePack) : null,
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
  };
  return orm ? write({ orm }) : db.transaction(write);
}

/**
 * Create a journal entry already posted, inside the caller's transaction
 * (`orm` is its `tx.orm`), so it commits or rolls back with the rest of the
 * caller's writes. The same checks as createJournalEntry and
 * postJournalEntry: balanced, at least one line, each fund on its own, and
 * the period open for the entry's type, all read through `orm`, so nothing
 * waits for a second pool connection while the caller holds locks. Used where
 * a late charge is charged with its notice locked (src/lib/queries/interest.ts).
 */
export async function createPostedJournalEntryIn(orm: typeof db.orm, data: CreateJournalEntryInput, postedBy: string) {
  const totalDebits = Math.round(data.lines.reduce((sum, line) => sum + (line.debit ?? 0), 0) * 100) / 100;
  const totalCredits = Math.round(data.lines.reduce((sum, line) => sum + (line.credit ?? 0), 0) * 100) / 100;
  if (totalDebits !== totalCredits) {
    throw new Error(`Journal entry is not balanced: debits (${totalDebits}) do not equal credits (${totalCredits})`);
  }
  if (data.lines.length === 0) throw new Error("Journal entry must have at least one line");
  await assertFundIntegrity(orm, data.schemeId, data.lines);
  await validatePeriodForPosting(data.schemeId, data.transactionDate.slice(0, 10), data.entryType, orm);
  const entry = await orm.public.JournalEntry.create({
    schemeId: data.schemeId,
    entryNumber: toVarchar<20>(data.entryNumber),
    transactionDate: toTimestamp(data.transactionDate),
    description: toVarchar<500>(data.description),
    entryType: data.entryType,
    sourceType: data.sourceType,
    sourceId: data.sourceId ?? null,
    rulePack: data.rulePack ? toVarchar<40>(data.rulePack) : null,
    status: "POSTED",
    postedAt: toTimestamp(new Date().toISOString()),
    postedBy,
    createdBy: data.createdBy,
  });
  for (const line of data.lines) {
    await orm.public.JournalLine.create({
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
  /** A transaction's `tx.orm`, to read and post inside it. */
  orm: typeof db.orm = db.orm,
) {
  // Fetch the entry to get its transaction date and scheme
  const entry = await orm.public.JournalEntry
    .where((je) => je.id.eq(entryId))
    .first();

  if (!entry) {
    throw new Error("Journal entry not found.");
  }

  if (entry.status !== "DRAFT") {
    throw new Error("Only draft journal entries can be posted.");
  }

  // Checked again at posting, for drafts saved before the check existed.
  const lines = await orm.public.JournalLine.where((l) => l.journalEntryId.eq(entryId)).limit(10000).all();
  await assertFundIntegrity(orm, entry.schemeId, lines.map((l) => ({ accountCodeId: l.accountCodeId, fundId: l.fundId, debit: l.debit, credit: l.credit })));

  // Validate against financial period unless explicitly skipped
  if (!skipPeriodCheck) {
    await validatePeriodForPosting(
      entry.schemeId,
      String(entry.transactionDate).slice(0, 10),
      entry.entryType,
      orm,
    );
  }

  return orm.public.JournalEntry
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
 * as REVERSED. The reversal is numbered in the same transaction, under the
 * building's numbering lock (lockJournalNumbering), and its period is checked
 * there before anything is written.
 */
export async function reverseJournalEntry(
  originalEntryId: string,
  data: { createdBy: string; description?: string },
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

  // Dated today in the building's time zone.
  const today = await schemeToday(original.schemeId);

  const reversal = db.transaction(async (tx) => {
    await setJournalLockTimeout(tx);
    await lockJournalNumbering(tx, original.schemeId);
    await validatePeriodForPosting(original.schemeId, today, "REVERSAL", tx.orm);
    // Still posted under the lock: a reversal at the same moment has not reversed it already.
    const current = await tx.orm.public.JournalEntry.where((je) => je.id.eq(originalEntryId)).first();
    if (!current || current.status !== "POSTED") throw new Error("Only posted journal entries can be reversed");
    const entryNumber = await getNextEntryNumber(original.schemeId, tx.orm);

    // Create the reversal entry
    const reversalEntry = await tx.orm.public.JournalEntry.create({
      schemeId: original.schemeId,
      entryNumber: toVarchar<20>(entryNumber),
      transactionDate: toTimestamp(today),
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
  return reversal.catch((err: unknown) => {
    throw isLockTimeout(err) ? new JournalBusyError({ cause: err }) : err;
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

/**
 * Lock the building's row (FOR NO KEY UPDATE) in the caller's transaction,
 * so journal entry numbers (the next after the highest, unique per building,
 * journal_entries_scheme_id_entry_number_key) are given out one transaction
 * at a time. Every transaction that numbers a journal takes it first, before
 * any notice or other row lock, so two writers always lock in the same order.
 * Taking it again in the same transaction is a no-op. FOR NO KEY UPDATE does
 * not block rows that only refer to the building (their foreign key check
 * takes a key share lock), only another writer locking the building row.
 * Shared with the late charge first paths (src/lib/queries/interest.ts).
 */
export async function lockJournalNumbering(tx: { orm: typeof db.orm }, schemeId: string) {
  await tx.orm.public.Scheme.where((s) => s.id.eq(schemeId)).forNoKeyUpdate().first();
}

/** A numbered transaction gave up waiting for a lock (SQLSTATE 55P03, lock_not_available). */
export class JournalBusyError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("Another change to this building's accounts is being saved. Wait a moment and try again.", options);
    this.name = "JournalBusyError";
  }
}

/** Whether an error, or one it was caused by, is Postgres giving up waiting for a lock. */
export function isLockTimeout(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e && typeof e === "object" && depth < 5; e = (e as { cause?: unknown }).cause, depth++) {
    const x = e as { sqlState?: unknown; code?: unknown };
    if (x.sqlState === "55P03" || x.code === "55P03") return true;
  }
  return false;
}

/**
 * Wait at most 5 seconds for any row lock in this transaction (SET LOCAL, so
 * it ends with the transaction), rather than holding a pool connection while
 * it queues. Run first in every numbered transaction
 * (src/lib/queries/journal-numbering.ts).
 */
export async function setJournalLockTimeout(tx: Pick<Parameters<Parameters<typeof db.transaction>[0]>[0], "raw" | "execute">) {
  await tx.execute(tx.raw.sql`SET LOCAL lock_timeout = '5s'`.affectedCount().build());
}

/** The next entry number. Pass a transaction's `tx.orm` to count entries it has written and not yet committed. */
export async function getNextEntryNumber(schemeId: string, orm: typeof db.orm = db.orm): Promise<string> {
  try {
    const entries = await orm.public.JournalEntry
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
