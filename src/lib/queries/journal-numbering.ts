/**
 * Journal entry numbering under the building's lock (27 Oct 2026).
 *
 * Entry numbers are the next after the highest in the building
 * (getNextEntryNumber), unique per building
 * (journal_entries_scheme_id_entry_number_key). Two writers numbering at the
 * same moment would both take the same number and the second insert would be
 * refused, after the first part of its work had committed. So every journal
 * writer numbers and inserts its entry inside a transaction that holds the
 * building's numbering lock (lockJournalNumbering: the `schemes` row, FOR NO
 * KEY UPDATE), together with the rest of its writes.
 *
 * Lock order, for every writer: the building row first, then any notice rows
 * in id order, then the writer's own rows. A writer that passes its own
 * transaction to addNumberedJournal has taken the lock at the start of it
 * (numberedTransaction does), so the lock taken again here is a no-op.
 *
 * Nothing in here reads through the global `db`: everything goes through the
 * transaction, so a writer never waits for a second pool connection while it
 * holds the lock. Look up accounts and the like before the transaction opens.
 *
 * Kept apart from journal-entries.ts so that createJournalEntry,
 * postJournalEntry and getNextEntryNumber are called through that module's
 * exports (the NSW golden tests record those calls).
 */
import { db } from "@/prisma/db";
import {
  createJournalEntry,
  getNextEntryNumber,
  isLockTimeout,
  JournalBusyError,
  lockJournalNumbering,
  postJournalEntry,
  setJournalLockTimeout,
  type CreateJournalEntryInput,
} from "@/lib/queries/journal-entries";

export type Tx = { orm: typeof db.orm };

export { isLockTimeout, JournalBusyError, lockJournalNumbering };

/**
 * A transaction that takes the building's numbering lock before anything
 * else. It waits at most 5 seconds for any row lock (the building's, a
 * notice's: SET LOCAL lock_timeout, so this transaction only) rather than
 * holding a pool connection while it queues, then throws JournalBusyError,
 * whose message the actions show as it is. Each writer holds the building's
 * lock for a few statements, so 5 seconds is a long queue. The data
 * migration cutover is the one writer that holds it for longer (a whole
 * import, src/lib/finance/migration-batches.ts): while one runs, other
 * writers in that building are told it is busy.
 */
export async function numberedTransaction<T>(schemeId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return await db.transaction(async (tx) => {
      await setJournalLockTimeout(tx);
      await lockJournalNumbering(tx, schemeId);
      return fn(tx);
    });
  } catch (err) {
    if (isLockTimeout(err)) throw new JournalBusyError({ cause: err });
    throw err;
  }
}

/**
 * Number a journal entry and write it, with its lines, in the caller's
 * transaction, under the building's numbering lock. With `postedBy` it is
 * posted there too (the period is checked through the transaction, so a
 * closed period rolls back everything the caller wrote). Without it, the
 * entry stays a draft.
 */
export async function addNumberedJournal(
  tx: Tx,
  data: Omit<CreateJournalEntryInput, "entryNumber">,
  postedBy: string | null,
): Promise<{ entry: Awaited<ReturnType<typeof createJournalEntry>>; entryNumber: string }> {
  await lockJournalNumbering(tx, data.schemeId);
  const entryNumber = await getNextEntryNumber(data.schemeId, tx.orm);
  const { schemeId, ...rest } = data;
  const entry = await createJournalEntry({ schemeId, entryNumber, ...rest }, tx.orm);
  if (postedBy) await postJournalEntry(entry.id, postedBy, false, tx.orm);
  return { entry, entryNumber };
}
