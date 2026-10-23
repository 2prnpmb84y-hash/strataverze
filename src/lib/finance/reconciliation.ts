/**
 * Bank reconciliation rules (pure). Money is in whole cents. Nothing here
 * reads the database.
 *
 * A bank transaction can be allocated across several journal entries (a
 * deposit covering several levy notices), and a journal entry can take
 * allocations from several transactions (one invoice paid in parts). A
 * transaction is MATCHED only when its allocations add up to its whole
 * amount. A journal entry is matched when allocations add up to its bank-side
 * amount (the net of its lines on bank accounts).
 */

// ─── Allocations ────────────────────────────────────────────────────────────

export interface JournalLineForBank {
  accountSubType: string | null;
  debitCents: number;
  creditCents: number;
}

/** The bank-side amount of a journal entry: money in is positive, money out negative. */
export function bankSideCents(lines: JournalLineForBank[]): number {
  return lines.filter((l) => l.accountSubType === "BANK").reduce((s, l) => s + l.debitCents - l.creditCents, 0);
}

/** UNMATCHED until the allocations cover the whole transaction. RECONCILED and EXCLUDED are left alone. */
export function statusAfterAllocation(current: string, transactionCents: number, allocatedCents: number): string {
  if (current === "RECONCILED" || current === "EXCLUDED") return current;
  return allocatedCents === Math.abs(transactionCents) && allocatedCents > 0 ? "MATCHED" : "UNMATCHED";
}

export interface AllocationRequest {
  journalEntryId: string;
  amountCents: number;
}

export interface EntryForAllocation {
  id: string;
  bankSideCents: number;
  /** Already allocated to this entry from other transactions (positive). */
  allocatedCents: number;
}

/**
 * Why a set of new allocations for one transaction cannot be saved, or null.
 * Amounts are positive. Each entry must move money the same way as the
 * transaction (a deposit against a receipt), and nothing may be allocated
 * beyond what the transaction or the entry has left.
 */
export function allocationProblem(input: {
  transactionCents: number;
  status: string;
  alreadyAllocatedCents: number;
  requests: AllocationRequest[];
  entries: EntryForAllocation[];
}): string | null {
  if (input.status === "RECONCILED" || input.status === "EXCLUDED") {
    return "This transaction is reconciled or excluded. Undo that before allocating it.";
  }
  if (input.requests.length === 0) return "Choose at least one entry to allocate to.";
  const seen = new Set<string>();
  for (const r of input.requests) {
    if (!Number.isInteger(r.amountCents) || r.amountCents <= 0) return "Each allocation must be more than zero.";
    if (seen.has(r.journalEntryId)) return "The same entry is listed twice.";
    seen.add(r.journalEntryId);
    const entry = input.entries.find((e) => e.id === r.journalEntryId);
    if (!entry) return "One of the entries was not found in this scheme's posted journal.";
    if (Math.sign(entry.bankSideCents) !== Math.sign(input.transactionCents)) {
      return input.transactionCents > 0
        ? "A deposit can only be allocated to entries that record money received."
        : "A payment can only be allocated to entries that record money paid out.";
    }
    const entryLeft = Math.abs(entry.bankSideCents) - entry.allocatedCents;
    if (r.amountCents > entryLeft) {
      return `An allocation is more than the $${(entryLeft / 100).toFixed(2)} left on that entry.`;
    }
  }
  const total = input.requests.reduce((s, r) => s + r.amountCents, 0);
  const left = Math.abs(input.transactionCents) - input.alreadyAllocatedCents;
  if (total > left) return `The allocations add up to more than the $${(left / 100).toFixed(2)} left on this transaction.`;
  return null;
}

/** What is left to allocate on a transaction (positive cents). */
export function unallocatedCents(transactionCents: number, allocatedCents: number): number {
  return Math.max(0, Math.abs(transactionCents) - allocatedCents);
}

// ─── Period close ───────────────────────────────────────────────────────────

export interface OpenSuspenseItem {
  id: string;
  transactionDate: string;
  amountCents: number;
  description: string;
}

/** Suspense items on or before the period end block closing it. */
export function suspenseBlockingClose(periodEnd: string, items: OpenSuspenseItem[]): OpenSuspenseItem[] {
  return items.filter((i) => i.transactionDate <= periodEnd);
}

// ─── Statement running balance ──────────────────────────────────────────────

export interface StatementRow {
  date: string;
  amountCents: number;
  balanceCents: number | null;
}

export interface BalanceGap {
  /** Index of the row after which something is missing (in date order, oldest first). */
  afterIndex: number;
  afterDate: string;
  beforeDate: string;
  expectedCents: number;
  actualCents: number;
  missingCents: number;
}

export interface RunningBalanceCheck {
  checked: boolean;
  order: "OLDEST_FIRST" | "NEWEST_FIRST" | null;
  openingCents: number | null;
  closingCents: number | null;
  gaps: BalanceGap[];
  /** The file's opening balance does not follow on from the last imported balance. */
  openingGapCents: number | null;
}

function gapsFor(rows: StatementRow[]): BalanceGap[] {
  const gaps: BalanceGap[] = [];
  let prev: { index: number; row: StatementRow } | null = null;
  rows.forEach((row, index) => {
    if (row.balanceCents == null) return;
    if (prev) {
      // Movements between the previous balanced row and this one.
      let movement = 0;
      for (let k = prev.index + 1; k <= index; k++) movement += rows[k].amountCents;
      const expected = prev.row.balanceCents! + movement;
      if (expected !== row.balanceCents) {
        gaps.push({
          afterIndex: prev.index,
          afterDate: prev.row.date,
          beforeDate: row.date,
          expectedCents: expected,
          actualCents: row.balanceCents,
          missingCents: row.balanceCents - expected,
        });
      }
    }
    prev = { index, row };
  });
  return gaps;
}

/**
 * Check that each balance equals the previous balance plus the movements
 * since, which catches a missing statement page. Bank files come oldest first
 * or newest first, so both orders are tried and the one that fits is used.
 * `lastImportedBalanceCents` is the account's balance before this file, if
 * known, to check the file starts where the last import ended.
 */
export function checkRunningBalance(rows: StatementRow[], lastImportedBalanceCents: number | null = null): RunningBalanceCheck {
  const withBalance = rows.filter((r) => r.balanceCents != null);
  if (withBalance.length < 2) {
    return { checked: false, order: null, openingCents: null, closingCents: null, gaps: [], openingGapCents: null };
  }
  const asGiven = gapsFor(rows);
  const reversed = [...rows].reverse();
  const asReversed = gapsFor(reversed);
  const useReversed = asReversed.length < asGiven.length;
  const ordered = useReversed ? reversed : rows;
  const gaps = useReversed ? asReversed : asGiven;

  const firstIdx = ordered.findIndex((r) => r.balanceCents != null);
  const first = ordered[firstIdx];
  let lastIdx = ordered.length - 1;
  while (ordered[lastIdx].balanceCents == null) lastIdx--;
  // Opening balance: before the first row's own movement (and any unbalanced rows before it).
  const before = ordered.slice(0, firstIdx + 1).reduce((s, r) => s + r.amountCents, 0);
  const openingCents = first.balanceCents! - before;
  const after = ordered.slice(lastIdx + 1).reduce((s, r) => s + r.amountCents, 0);
  const closingCents = ordered[lastIdx].balanceCents! + after;
  const openingGapCents =
    lastImportedBalanceCents != null && lastImportedBalanceCents !== openingCents ? openingCents - lastImportedBalanceCents : null;
  return { checked: true, order: useReversed ? "NEWEST_FIRST" : "OLDEST_FIRST", openingCents, closingCents, gaps, openingGapCents };
}

// ─── Three-way reconciliation ───────────────────────────────────────────────

export interface ThreeWayInput {
  /** Ledger bank balance per fund, from posted journal lines on bank accounts. */
  ledgerByFund: { fundId: string; fundName: string; cents: number }[];
  /** Latest statement balance per bank account on or before the date, or null if no balance is known. */
  statementByAccount: { bankAccountId: string; accountName: string; cents: number | null; asAt: string | null }[];
  /** The payment provider's wallet balance, or null when there is no provider. */
  walletCents: number | null;
  /** Bank transactions not yet fully allocated: the unallocated part, signed (+ in, - out). */
  unmatchedBank: { id: string; date: string; description: string; cents: number }[];
  /** Ledger bank movements not yet matched to the bank: the unallocated part, signed. */
  pendingLedger: { id: string; date: string; description: string; cents: number }[];
  /** Open suspense items, signed. */
  suspense: { id: string; date: string; description: string; cents: number }[];
}

export interface ThreeWayResult {
  ledgerCents: number;
  statementCents: number | null;
  walletCents: number | null;
  unmatchedBankCents: number;
  pendingLedgerCents: number;
  suspenseCents: number;
  /** Statement less bank items not in the ledger plus ledger items not yet on the statement. */
  adjustedStatementCents: number | null;
  /** Ledger less the adjusted statement. Zero when everything is explained. */
  unexplainedCents: number | null;
  missingStatementAccounts: string[];
}

export function threeWayReconciliation(input: ThreeWayInput): ThreeWayResult {
  const sum = (xs: { cents: number }[]) => xs.reduce((s, x) => s + x.cents, 0);
  const ledgerCents = sum(input.ledgerByFund);
  const missing = input.statementByAccount.filter((a) => a.cents == null).map((a) => a.accountName);
  const statementCents = input.statementByAccount.length === 0 || missing.length > 0 ? null : sum(input.statementByAccount as { cents: number }[]);
  const unmatchedBankCents = sum(input.unmatchedBank);
  const pendingLedgerCents = sum(input.pendingLedger);
  const adjusted = statementCents == null ? null : statementCents - unmatchedBankCents + pendingLedgerCents;
  return {
    ledgerCents,
    statementCents,
    walletCents: input.walletCents,
    unmatchedBankCents,
    pendingLedgerCents,
    suspenseCents: sum(input.suspense),
    adjustedStatementCents: adjusted,
    unexplainedCents: adjusted == null ? null : ledgerCents - adjusted,
    missingStatementAccounts: missing,
  };
}
