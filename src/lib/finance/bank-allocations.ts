/**
 * Bank reconciliation (server side): allocating bank transactions to journal
 * entries (one to many and many to one), receipting a deposit across several
 * levy notices, and the suspense account for amounts nobody can identify yet.
 */
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { Numeric, TimestampString } from "@prisma/orm-postgres/target/codec-types";
import { fromCents, toCents } from "@/lib/billing/money";
import { captureTransactionFee } from "@/lib/billing/capture";
import { getSystemAccountBySubType } from "@/lib/queries/account-codes";
import { validatePeriodForPosting } from "@/lib/queries/journal-entries";
import { addNumberedJournal, numberedTransaction } from "@/lib/queries/journal-numbering";
import { logActivity } from "@/lib/queries/activity-log";
import {
  allocationProblem,
  bankSideCents,
  statusAfterAllocation,
  unallocatedCents,
  type AllocationRequest,
} from "./reconciliation";
import { LevyReceiptError, prepareLevyReceipt, suspenseAccount, type PreparedLevyReceipt } from "./levy-receipts";
import { messageTermsFor } from "@/lib/jurisdiction/scheme-rules";

export class ReconciliationError extends Error {}

const num = (cents: number) => String(fromCents(cents)) as unknown as Numeric<12, 2>;
const ts = (v: string) => v as unknown as TimestampString<3>;
const isoDay = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").slice(0, 10));
const cents = (v: unknown) => toCents(String(v ?? 0));

// ─── Reading ────────────────────────────────────────────────────────────────

type Orm = typeof db.orm;

async function loadTransaction(schemeId: string, transactionId: string, orm: Orm = db.orm) {
  const txn = await orm.public.BankTransaction.where((t) => t.id.eq(transactionId)).first();
  if (!txn || txn.schemeId !== schemeId) throw new ReconciliationError("Bank transaction not found.");
  return txn;
}

/** Allocations per transaction (cents allocated). */
export async function allocatedByTransaction(transactionIds: string[], orm: Orm = db.orm): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (transactionIds.length === 0) return map;
  const rows = await orm.public.BankTransactionAllocation.where((a) => a.bankTransactionId.in(transactionIds)).limit(20000).all();
  for (const r of rows) map.set(r.bankTransactionId, (map.get(r.bankTransactionId) ?? 0) + cents(r.amount));
  return map;
}

/** Allocations per journal entry (cents allocated). */
export async function allocatedByEntry(entryIds: string[], orm: Orm = db.orm): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (entryIds.length === 0) return map;
  const rows = await orm.public.BankTransactionAllocation.where((a) => a.journalEntryId.in(entryIds)).limit(20000).all();
  for (const r of rows) map.set(r.journalEntryId, (map.get(r.journalEntryId) ?? 0) + cents(r.amount));
  return map;
}

export interface AllocationCandidate {
  id: string;
  entryNumber: string;
  date: string;
  description: string;
  bankSideCents: number;
  allocatedCents: number;
  remainingCents: number;
}

/**
 * Posted journal entries that move money through a bank account and still
 * have an amount not matched to the bank, newest first.
 */
export async function getAllocationCandidates(schemeId: string, limit = 300): Promise<AllocationCandidate[]> {
  const entries = await db.orm.public.JournalEntry
    .where((je) => and(je.schemeId.eq(schemeId), je.status.eq("POSTED")))
    .include("lines", (l) => l.include("accountCode"))
    .orderBy((je) => je.transactionDate.desc())
    .limit(2000)
    .all();
  const withBank = entries
    .map((e) => ({
      e,
      bank: bankSideCents(
        (e.lines ?? []).map((l) => ({
          accountSubType: l.accountCode?.accountSubType ?? null,
          debitCents: cents(l.debit),
          creditCents: cents(l.credit),
        })),
      ),
    }))
    .filter((x) => x.bank !== 0);
  const allocated = await allocatedByEntry(withBank.map((x) => x.e.id));
  return withBank
    .map(({ e, bank }) => {
      const done = allocated.get(e.id) ?? 0;
      return {
        id: e.id,
        entryNumber: String(e.entryNumber),
        date: isoDay(e.transactionDate),
        description: String(e.description),
        bankSideCents: bank,
        allocatedCents: done,
        remainingCents: Math.abs(bank) - done,
      };
    })
    .filter((c) => c.remainingCents > 0)
    .slice(0, limit);
}

// ─── Allocating ─────────────────────────────────────────────────────────────

/** Recompute a transaction's status from its allocations. */
export async function syncTransaction(orm: typeof db.orm, transactionId: string, actorId: string | null) {
  const txn = await orm.public.BankTransaction.where((t) => t.id.eq(transactionId)).first();
  if (!txn) return;
  const rows = await orm.public.BankTransactionAllocation.where((a) => a.bankTransactionId.eq(transactionId)).limit(500).all();
  const allocated = rows.reduce((s, r) => s + cents(r.amount), 0);
  const status = statusAfterAllocation(txn.reconciliationStatus, cents(txn.amount), allocated);
  await orm.public.BankTransaction.where((t) => t.id.eq(transactionId)).update({
    reconciliationStatus: status,
    // Kept for older reports: the entry when there is exactly one.
    matchedJournalEntryId: rows.length === 1 ? rows[0].journalEntryId : null,
    matchedAt: status === "MATCHED" ? ts(new Date().toISOString()) : null,
    matchedBy: status === "MATCHED" ? actorId : null,
  });
}

interface AllocationInput {
  schemeId: string;
  transactionId: string;
  requests: AllocationRequest[];
  actorId: string;
}

/**
 * Allocate a bank transaction to posted journal entries, reading and writing
 * through `orm` (a transaction's), so a caller can allocate a journal it has
 * just written in the same transaction. The activity is logged by the caller
 * once it has committed (logAllocation).
 */
async function allocateIn(orm: Orm, input: AllocationInput) {
  const txn = await loadTransaction(input.schemeId, input.transactionId, orm);
  const already = (await allocatedByTransaction([txn.id], orm)).get(txn.id) ?? 0;
  const entryIds = input.requests.map((r) => r.journalEntryId);
  const entries = await orm.public.JournalEntry
    .where((je) => and(je.schemeId.eq(input.schemeId), je.status.eq("POSTED"), je.id.in(entryIds.length ? entryIds : ["00000000-0000-0000-0000-000000000000"])))
    .include("lines", (l) => l.include("accountCode"))
    .limit(500)
    .all();
  const entryAllocated = await allocatedByEntry(entries.map((e) => e.id), orm);
  const problem = allocationProblem({
    transactionCents: cents(txn.amount),
    status: txn.reconciliationStatus,
    alreadyAllocatedCents: already,
    requests: input.requests,
    entries: entries.map((e) => ({
      id: e.id,
      bankSideCents: bankSideCents(
        (e.lines ?? []).map((l) => ({ accountSubType: l.accountCode?.accountSubType ?? null, debitCents: cents(l.debit), creditCents: cents(l.credit) })),
      ),
      allocatedCents: entryAllocated.get(e.id) ?? 0,
    })),
  });
  if (problem) throw new ReconciliationError(problem);

  for (const r of input.requests) {
    const existing = await orm.public.BankTransactionAllocation
      .where((a) => and(a.bankTransactionId.eq(txn.id), a.journalEntryId.eq(r.journalEntryId)))
      .first();
    if (existing) {
      await orm.public.BankTransactionAllocation.where((a) => a.id.eq(existing.id)).update({ amount: num(cents(existing.amount) + r.amountCents) });
    } else {
      await orm.public.BankTransactionAllocation.create({
        schemeId: input.schemeId,
        bankTransactionId: txn.id,
        journalEntryId: r.journalEntryId,
        amount: num(r.amountCents),
        createdBy: input.actorId,
      });
    }
  }
  await syncTransaction(orm, txn.id, input.actorId);
}

async function logAllocation(input: AllocationInput) {
  await logActivity({
    schemeId: input.schemeId,
    actorId: input.actorId,
    action: "BANK_TRANSACTION_MATCHED",
    entityType: "BankTransaction",
    entityId: input.transactionId,
    metadata: { allocations: input.requests.map((r) => ({ journalEntryId: r.journalEntryId, amount: fromCents(r.amountCents) })) },
  });
}

/**
 * Allocate a bank transaction to one or more posted journal entries. Under
 * the building's numbering lock, so it waits for an auto-match or a receipt
 * on the same transaction, and checks what is left on it as it then stands.
 */
export async function allocateBankTransaction(input: AllocationInput) {
  await numberedTransaction(input.schemeId, async (tx) => allocateIn(tx.orm, input));
  await logAllocation(input);
}

/** Remove every allocation of a transaction. Not allowed while it has an open suspense item. */
export async function clearAllocations(input: { schemeId: string; transactionId: string; actorId: string }) {
  const txn = await loadTransaction(input.schemeId, input.transactionId);
  if (txn.reconciliationStatus === "RECONCILED") throw new ReconciliationError("This transaction is reconciled. It cannot be unmatched.");
  const suspense = await db.orm.public.SuspenseItem.where((s) => s.bankTransactionId.eq(txn.id)).limit(10).all();
  if (suspense.length > 0) {
    throw new ReconciliationError("Part of this transaction is in suspense. Clear the suspense item to the right account instead.");
  }
  await db.transaction(async (tx) => {
    await tx.orm.public.BankTransactionAllocation.where((a) => a.bankTransactionId.eq(txn.id)).deleteAndCount();
    await syncTransaction(tx.orm, txn.id, null);
  });
  await logActivity({
    schemeId: input.schemeId,
    actorId: input.actorId,
    action: "BANK_TRANSACTION_UNMATCHED",
    entityType: "BankTransaction",
    entityId: txn.id,
    metadata: {},
  });
}

// ─── Receipting a deposit across levy notices ───────────────────────────────

/**
 * Split a bank deposit across several levy notices: one receipt journal with
 * a line for each notice, and the deposit allocated to it. The StrataVerze
 * transaction fee, if any, is charged once for the deposit.
 */
export async function receiptDepositToNotices(input: {
  schemeId: string;
  transactionId: string;
  receipts: { levyNoticeId: string; amountCents: number }[];
  confirmOverpayment: boolean;
  feeConfirmedCents: number | null;
  actorId: string;
}) {
  const txn = await loadTransaction(input.schemeId, input.transactionId);
  const amount = cents(txn.amount);
  if (amount <= 0) throw new ReconciliationError(`Only a deposit can be receipted to ${(await messageTermsFor(input.schemeId)).levy} notices.`);
  const already = (await allocatedByTransaction([txn.id])).get(txn.id) ?? 0;
  const left = unallocatedCents(amount, already);
  const total = input.receipts.reduce((s, r) => s + r.amountCents, 0);
  if (input.receipts.length === 0 || input.receipts.some((r) => !(r.amountCents > 0))) {
    throw new ReconciliationError("Enter an amount for each notice.");
  }
  if (new Set(input.receipts.map((r) => r.levyNoticeId)).size !== input.receipts.length) {
    throw new ReconciliationError("The same notice is listed twice.");
  }
  if (total > left) throw new ReconciliationError(`The receipts add up to more than the $${fromCents(left).toFixed(2)} left on this deposit.`);

  // Check every notice before receipting any, so a problem does not leave the deposit half done.
  const notices = await db.orm.public.LevyNotice.where((n) => n.id.in(input.receipts.map((r) => r.levyNoticeId))).limit(500).all();
  for (const r of input.receipts) {
    const n = notices.find((x) => x.id === r.levyNoticeId);
    if (!n || n.schemeId !== input.schemeId || n.status === "DRAFT" || n.status === "WRITTEN_OFF") {
      throw new ReconciliationError("One of the notices is not an issued notice of this scheme.");
    }
    const owing = cents(n.amountDue) + cents(n.interestCharged) - cents(n.amountPaid);
    if (r.amountCents > owing && !input.confirmOverpayment) {
      throw new ReconciliationError(
        `$${fromCents(r.amountCents).toFixed(2)} is more than notice ${String(n.noticeNumber)} owes ($${fromCents(Math.max(0, owing)).toFixed(2)}). Confirm that the extra is to be held as the owner's credit.`,
      );
    }
  }

  // Everything the receipt needs from outside its transaction, found first.
  const receipt = await prepareLevyReceipt({
    schemeId: input.schemeId,
    receipts: input.receipts,
    paymentDate: isoDay(txn.transactionDate),
    actorId: input.actorId,
    reference: String(txn.reference ?? txn.description).slice(0, 100),
    confirmOverpayment: input.confirmOverpayment,
    captureFee: false,
  });
  const allocation = (journalEntryId: string): AllocationInput => ({ schemeId: input.schemeId, transactionId: txn.id, requests: [{ journalEntryId, amountCents: total }], actorId: input.actorId });

  // One transaction for the deposit: the building's numbering lock, the
  // notices in id order, the fee, the payments and the receipt journal, and
  // the deposit allocated to it. All of it is written or none.
  const result = await numberedTransaction(input.schemeId, async (tx) => {
    for (const id of input.receipts.map((r) => r.levyNoticeId).sort()) {
      await tx.orm.public.LevyNotice.where((n) => n.id.eq(id)).forNoKeyUpdate().first();
    }
    // One fee for the deposit (deduplicated by source, so it is never charged twice).
    await captureTransactionFee(tx.orm, {
      schemeId: input.schemeId,
      movement: "LEVY_RECEIPT",
      paymentCents: amount,
      sourceType: "BankTransaction",
      sourceId: txn.id,
      actorId: input.actorId,
      confirmedCents: input.feeConfirmedCents,
      date: isoDay(txn.transactionDate),
    });
    // One receipt journal for the whole deposit, with a line for each notice (TC-004).
    const out = await receipt.run(tx);
    if (out.journalEntryId) await allocateIn(tx.orm, allocation(out.journalEntryId));
    return out;
  });
  await receipt.log(result);
  if (!result.journalEntryId) {
    const { levies } = await messageTermsFor(input.schemeId);
    throw new ReconciliationError(
      `The notices were receipted but no journal could be posted. Check the chart of accounts has the bank, ${levies} receivable and ${levies} paid in advance accounts.`,
    );
  }
  await logAllocation(allocation(result.journalEntryId));
}

// ─── Suspense ───────────────────────────────────────────────────────────────

/**
 * Post the unallocated part of a transaction to suspense: DR bank, CR
 * suspense for money received, the reverse for money paid out. The item
 * stays open until it is cleared to the right account.
 */
export async function postToSuspense(input: { schemeId: string; transactionId: string; note: string | null; actorId: string }) {
  const txn = await loadTransaction(input.schemeId, input.transactionId);
  const amount = cents(txn.amount);
  const left = unallocatedCents(amount, (await allocatedByTransaction([txn.id])).get(txn.id) ?? 0);
  if (left <= 0) throw new ReconciliationError("Nothing is left to post to suspense on this transaction.");
  const bank = await getSystemAccountBySubType(input.schemeId, "BANK", "ADMINISTRATIVE");
  const suspense = await suspenseAccount(input.schemeId);
  if (!bank || !suspense?.fundId) throw new ReconciliationError("The chart of accounts needs a bank account and a suspense account. Seed the chart of accounts first.");
  const fundId = suspense.fundId;
  const signed = amount > 0 ? left : -left;
  const date = isoDay(txn.transactionDate);
  const description = `Suspense — ${String(txn.description).slice(0, 200)}`;

  // Refused before anything is written if the period is closed or locked.
  await validatePeriodForPosting(input.schemeId, date, "AUTO");
  const allocation = (journalEntryId: string): AllocationInput => ({ schemeId: input.schemeId, transactionId: txn.id, requests: [{ journalEntryId, amountCents: left }], actorId: input.actorId });

  // The suspense journal, the item and the allocation together, numbered under the building's lock.
  const entry = await numberedTransaction(input.schemeId, async (tx) => {
    const { entry } = await addNumberedJournal(
      tx,
      {
        schemeId: input.schemeId,
        transactionDate: date,
        description,
        entryType: "AUTO",
        sourceType: "SUSPENSE",
        sourceId: txn.id,
        createdBy: input.actorId,
        lines:
          signed > 0
            ? [
                { accountCodeId: bank.id, fundId, debit: fromCents(left), description: "Bank receipt not yet identified" },
                { accountCodeId: suspense.id, fundId, credit: fromCents(left), description },
              ]
            : [
                { accountCodeId: suspense.id, fundId, debit: fromCents(left), description },
                { accountCodeId: bank.id, fundId, credit: fromCents(left), description: "Bank payment not yet identified" },
              ],
      },
      input.actorId,
    );

    await tx.orm.public.SuspenseItem.create({
      schemeId: input.schemeId,
      bankTransactionId: txn.id,
      journalEntryId: entry.id,
      amount: num(signed),
      transactionDate: ts(date),
      description: input.note?.trim() ? `${String(txn.description)} (${input.note.trim()})` : String(txn.description),
      status: "OPEN",
      clearedJournalEntryId: null,
      clearedNote: null,
      clearedBy: null,
      clearedAt: null,
      createdBy: input.actorId,
    });
    await allocateIn(tx.orm, allocation(entry.id));
    return entry;
  });
  await logAllocation(allocation(entry.id));
  await logActivity({
    schemeId: input.schemeId,
    actorId: input.actorId,
    action: "SUSPENSE_POSTED",
    entityType: "BankTransaction",
    entityId: txn.id,
    metadata: { amount: fromCents(signed), journalEntryId: entry.id },
  });
}

export interface SuspenseRow {
  id: string;
  bankTransactionId: string;
  transactionDate: string;
  amountCents: number;
  description: string;
  status: string;
}

export async function getSuspenseItems(schemeId: string, status: "OPEN" | "CLEARED" | "ALL" = "OPEN"): Promise<SuspenseRow[]> {
  const rows = await db.orm.public.SuspenseItem
    .where((s) => (status === "ALL" ? s.schemeId.eq(schemeId) : and(s.schemeId.eq(schemeId), s.status.eq(status))))
    .orderBy((s) => s.transactionDate.asc())
    .limit(2000)
    .all();
  return rows.map((r) => ({
    id: r.id,
    bankTransactionId: r.bankTransactionId,
    transactionDate: isoDay(r.transactionDate),
    amountCents: cents(r.amount),
    description: r.description,
    status: r.status,
  }));
}

/**
 * Clear a suspense item once the amount is identified: to a levy notice
 * (money received only) or to an account in the chart of accounts.
 */
export async function clearSuspenseItem(input: {
  schemeId: string;
  itemId: string;
  target: { kind: "LEVY_NOTICE"; levyNoticeId: string; confirmOverpayment: boolean } | { kind: "ACCOUNT"; accountCodeId: string };
  note: string | null;
  actorId: string;
}) {
  const item = await db.orm.public.SuspenseItem.where((s) => s.id.eq(input.itemId)).first();
  if (!item || item.schemeId !== input.schemeId) throw new ReconciliationError("Suspense item not found.");
  if (item.status !== "OPEN") throw new ReconciliationError("This suspense item is already cleared.");
  const amount = cents(item.amount);
  const date = isoDay(item.transactionDate);
  const suspense = await suspenseAccount(input.schemeId);
  if (!suspense?.fundId) throw new ReconciliationError("The suspense account is missing from the chart of accounts.");

  const cleared = (clearedJournalEntryId: string) => ({
    status: "CLEARED",
    clearedJournalEntryId,
    clearedNote: input.note,
    clearedBy: input.actorId,
    clearedAt: ts(new Date().toISOString()),
  });
  /** The item read again under the building's lock: a clear at the same moment has been written, or waits for this one. */
  const stillOpen = async (orm: Orm) => {
    const current = await orm.public.SuspenseItem.where((s) => s.id.eq(item.id)).first();
    if (!current || current.status !== "OPEN") throw new ReconciliationError("This suspense item is already cleared.");
  };

  let clearedJournalEntryId: string;
  if (input.target.kind === "LEVY_NOTICE") {
    if (amount <= 0) throw new ReconciliationError(`Only money received can be cleared to a ${(await messageTermsFor(input.schemeId)).levy} notice.`);
    const asReconciliation = (err: unknown) => (err instanceof LevyReceiptError ? new ReconciliationError(err.message) : err);
    let receipt: PreparedLevyReceipt;
    try {
      receipt = await prepareLevyReceipt({
        schemeId: input.schemeId,
        receipts: [{ levyNoticeId: input.target.levyNoticeId, amountCents: amount }],
        paymentDate: date,
        actorId: input.actorId,
        reference: "Cleared from suspense",
        confirmOverpayment: input.target.confirmOverpayment,
        // The fee, if any, belongs to the deposit and is charged once for it.
        captureFee: false,
        debitFrom: "SUSPENSE",
      });
    } catch (err) {
      throw asReconciliation(err);
    }
    // The payment, its journal and the item cleared, together, under the building's lock.
    const result = await numberedTransaction(input.schemeId, async (tx) => {
      await stillOpen(tx.orm);
      const out = await receipt.run(tx).catch((err: unknown) => {
        throw asReconciliation(err);
      });
      if (out.journalEntryId) await tx.orm.public.SuspenseItem.where((s) => s.id.eq(item.id)).update(cleared(out.journalEntryId));
      return out;
    });
    await receipt.log(result);
    if (!result.journalEntryId) throw new ReconciliationError(`The ${(await messageTermsFor(input.schemeId)).levy} payment was recorded but no journal could be posted.`);
    clearedJournalEntryId = result.journalEntryId;
  } else {
    const accountCodeId = input.target.accountCodeId;
    const account = await db.orm.public.AccountCode.where((a) => a.id.eq(accountCodeId)).first();
    if (!account || account.schemeId !== input.schemeId || !account.isActive) throw new ReconciliationError("Choose an account of this scheme.");
    if (account.accountSubType === "SUSPENSE" || account.accountSubType === "BANK") {
      throw new ReconciliationError("Choose the account the amount belongs to, not the bank or suspense account.");
    }
    const fundId = account.fundId ?? suspense.fundId;
    const abs = fromCents(Math.abs(amount));
    // Both funds share the bank and suspense accounts. When the amount belongs
    // to the other fund, the money moves there in the bank as well, so each
    // fund balances on its own (financials review B1, 26 Oct 2026).
    const crossFund = fundId !== suspense.fundId;
    const bank = crossFund ? await getSystemAccountBySubType(input.schemeId, "BANK", "ADMINISTRATIVE") : null;
    if (crossFund && !bank) throw new ReconciliationError("The chart of accounts needs a bank account. Seed the chart of accounts first.");
    const moveCash = (into: string, outOf: string) =>
      crossFund && bank
        ? [
            { accountCodeId: bank.id, fundId: into, debit: abs, description: "Moved to the fund it belongs to" },
            { accountCodeId: bank.id, fundId: outOf, credit: abs, description: "Moved to the fund it belongs to" },
          ]
        : [];
    // Refused before anything is written if the period is closed or locked.
    await validatePeriodForPosting(input.schemeId, date, "AUTO");
    // The journal and the item cleared, together, numbered under the building's lock.
    clearedJournalEntryId = await numberedTransaction(input.schemeId, async (tx) => {
      await stillOpen(tx.orm);
      const { entry } = await addNumberedJournal(
        tx,
        {
          schemeId: input.schemeId,
          transactionDate: date,
          description: `Suspense cleared — ${item.description.slice(0, 200)}`,
          entryType: "AUTO",
          sourceType: "SUSPENSE",
          sourceId: item.id,
          createdBy: input.actorId,
          lines:
            amount > 0
              ? [
                  { accountCodeId: suspense.id, fundId: suspense.fundId!, debit: abs, description: "Suspense cleared" },
                  { accountCodeId: account.id, fundId, credit: abs, description: input.note ?? "Identified receipt" },
                  ...moveCash(fundId, suspense.fundId!),
                ]
              : [
                  { accountCodeId: account.id, fundId, debit: abs, description: input.note ?? "Identified payment" },
                  { accountCodeId: suspense.id, fundId: suspense.fundId!, credit: abs, description: "Suspense cleared" },
                  ...moveCash(suspense.fundId!, fundId),
                ],
        },
        input.actorId,
      );
      await tx.orm.public.SuspenseItem.where((s) => s.id.eq(item.id)).update(cleared(entry.id));
      return entry.id;
    });
  }

  await logActivity({
    schemeId: input.schemeId,
    actorId: input.actorId,
    action: "SUSPENSE_CLEARED",
    entityType: "BankTransaction",
    entityId: item.bankTransactionId,
    metadata: { suspenseItemId: item.id, target: input.target.kind, journalEntryId: clearedJournalEntryId },
  });
}
