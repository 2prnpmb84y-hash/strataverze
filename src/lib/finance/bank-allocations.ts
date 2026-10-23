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
import { createJournalEntry, getNextEntryNumber, postJournalEntry } from "@/lib/queries/journal-entries";
import { logActivity } from "@/lib/queries/activity-log";
import {
  allocationProblem,
  bankSideCents,
  statusAfterAllocation,
  unallocatedCents,
  type AllocationRequest,
} from "./reconciliation";
import { LevyReceiptError, receiptLevyPayment, receiptLevyPayments, suspenseAccount } from "./levy-receipts";

export class ReconciliationError extends Error {}

const num = (cents: number) => String(fromCents(cents)) as unknown as Numeric<12, 2>;
const ts = (v: string) => v as unknown as TimestampString<3>;
const isoDay = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").slice(0, 10));
const cents = (v: unknown) => toCents(String(v ?? 0));

// ─── Reading ────────────────────────────────────────────────────────────────

async function loadTransaction(schemeId: string, transactionId: string) {
  const txn = await db.orm.public.BankTransaction.where((t) => t.id.eq(transactionId)).first();
  if (!txn || txn.schemeId !== schemeId) throw new ReconciliationError("Bank transaction not found.");
  return txn;
}

/** Allocations per transaction (cents allocated). */
export async function allocatedByTransaction(transactionIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (transactionIds.length === 0) return map;
  const rows = await db.orm.public.BankTransactionAllocation.where((a) => a.bankTransactionId.in(transactionIds)).limit(20000).all();
  for (const r of rows) map.set(r.bankTransactionId, (map.get(r.bankTransactionId) ?? 0) + cents(r.amount));
  return map;
}

/** Allocations per journal entry (cents allocated). */
export async function allocatedByEntry(entryIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (entryIds.length === 0) return map;
  const rows = await db.orm.public.BankTransactionAllocation.where((a) => a.journalEntryId.in(entryIds)).limit(20000).all();
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

/** Allocate a bank transaction to one or more posted journal entries. */
export async function allocateBankTransaction(input: {
  schemeId: string;
  transactionId: string;
  requests: AllocationRequest[];
  actorId: string;
}) {
  const txn = await loadTransaction(input.schemeId, input.transactionId);
  const already = (await allocatedByTransaction([txn.id])).get(txn.id) ?? 0;
  const entryIds = input.requests.map((r) => r.journalEntryId);
  const entries = await db.orm.public.JournalEntry
    .where((je) => and(je.schemeId.eq(input.schemeId), je.status.eq("POSTED"), je.id.in(entryIds.length ? entryIds : ["00000000-0000-0000-0000-000000000000"])))
    .include("lines", (l) => l.include("accountCode"))
    .limit(500)
    .all();
  const entryAllocated = await allocatedByEntry(entries.map((e) => e.id));
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

  await db.transaction(async (tx) => {
    for (const r of input.requests) {
      const existing = await tx.orm.public.BankTransactionAllocation
        .where((a) => and(a.bankTransactionId.eq(txn.id), a.journalEntryId.eq(r.journalEntryId)))
        .first();
      if (existing) {
        await tx.orm.public.BankTransactionAllocation.where((a) => a.id.eq(existing.id)).update({ amount: num(cents(existing.amount) + r.amountCents) });
      } else {
        await tx.orm.public.BankTransactionAllocation.create({
          schemeId: input.schemeId,
          bankTransactionId: txn.id,
          journalEntryId: r.journalEntryId,
          amount: num(r.amountCents),
          createdBy: input.actorId,
        });
      }
    }
    await syncTransaction(tx.orm, txn.id, input.actorId);
  });

  await logActivity({
    schemeId: input.schemeId,
    actorId: input.actorId,
    action: "BANK_TRANSACTION_MATCHED",
    entityType: "BankTransaction",
    entityId: txn.id,
    metadata: { allocations: input.requests.map((r) => ({ journalEntryId: r.journalEntryId, amount: fromCents(r.amountCents) })) },
  });
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
    await tx.orm.public.BankTransactionAllocation.where((a) => a.bankTransactionId.eq(txn.id)).delete();
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
  if (amount <= 0) throw new ReconciliationError("Only a deposit can be receipted to levy notices.");
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

  // One fee for the deposit (deduplicated by source, so it is never charged twice).
  await db.transaction(async (tx) => {
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
  });

  // One receipt journal for the whole deposit, with a line for each notice (TC-004).
  const result = await receiptLevyPayments({
    schemeId: input.schemeId,
    receipts: input.receipts,
    paymentDate: isoDay(txn.transactionDate),
    actorId: input.actorId,
    reference: String(txn.reference ?? txn.description).slice(0, 100),
    confirmOverpayment: input.confirmOverpayment,
    captureFee: false,
  });
  if (!result.journalEntryId) {
    throw new ReconciliationError(
      "The notices were receipted but no journal could be posted. Check the chart of accounts has the bank, levies receivable and levies paid in advance accounts.",
    );
  }
  await allocateBankTransaction({ schemeId: input.schemeId, transactionId: txn.id, requests: [{ journalEntryId: result.journalEntryId, amountCents: total }], actorId: input.actorId });
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

  const entryNumber = await getNextEntryNumber(input.schemeId);
  const entry = await createJournalEntry({
    schemeId: input.schemeId,
    entryNumber,
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
  });
  await postJournalEntry(entry.id, input.actorId);

  await db.orm.public.SuspenseItem.create({
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
  await allocateBankTransaction({ schemeId: input.schemeId, transactionId: txn.id, requests: [{ journalEntryId: entry.id, amountCents: left }], actorId: input.actorId });
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

  let clearedJournalEntryId: string;
  if (input.target.kind === "LEVY_NOTICE") {
    if (amount <= 0) throw new ReconciliationError("Only money received can be cleared to a levy notice.");
    try {
      const result = await receiptLevyPayment({
        schemeId: input.schemeId,
        levyNoticeId: input.target.levyNoticeId,
        amountCents: amount,
        paymentDate: date,
        actorId: input.actorId,
        reference: "Cleared from suspense",
        confirmOverpayment: input.target.confirmOverpayment,
        // The fee, if any, belongs to the deposit and is charged once for it.
        captureFee: false,
        debitFrom: "SUSPENSE",
      });
      if (!result.journalEntryId) throw new ReconciliationError("The levy payment was recorded but no journal could be posted.");
      clearedJournalEntryId = result.journalEntryId;
    } catch (err) {
      if (err instanceof LevyReceiptError) throw new ReconciliationError(err.message);
      throw err;
    }
  } else {
    const accountCodeId = input.target.accountCodeId;
    const account = await db.orm.public.AccountCode.where((a) => a.id.eq(accountCodeId)).first();
    if (!account || account.schemeId !== input.schemeId || !account.isActive) throw new ReconciliationError("Choose an account of this scheme.");
    if (account.accountSubType === "SUSPENSE" || account.accountSubType === "BANK") {
      throw new ReconciliationError("Choose the account the amount belongs to, not the bank or suspense account.");
    }
    const fundId = account.fundId ?? suspense.fundId;
    const abs = fromCents(Math.abs(amount));
    const entryNumber = await getNextEntryNumber(input.schemeId);
    const entry = await createJournalEntry({
      schemeId: input.schemeId,
      entryNumber,
      transactionDate: date,
      description: `Suspense cleared — ${item.description.slice(0, 200)}`,
      entryType: "AUTO",
      sourceType: "SUSPENSE",
      sourceId: item.id,
      createdBy: input.actorId,
      lines:
        amount > 0
          ? [
              { accountCodeId: suspense.id, fundId: suspense.fundId, debit: abs, description: "Suspense cleared" },
              { accountCodeId: account.id, fundId, credit: abs, description: input.note ?? "Identified receipt" },
            ]
          : [
              { accountCodeId: account.id, fundId, debit: abs, description: input.note ?? "Identified payment" },
              { accountCodeId: suspense.id, fundId: suspense.fundId, credit: abs, description: "Suspense cleared" },
            ],
    });
    await postJournalEntry(entry.id, input.actorId);
    clearedJournalEntryId = entry.id;
  }

  await db.orm.public.SuspenseItem.where((s) => s.id.eq(item.id)).update({
    status: "CLEARED",
    clearedJournalEntryId,
    clearedNote: input.note,
    clearedBy: input.actorId,
    clearedAt: ts(new Date().toISOString()),
  });
  await logActivity({
    schemeId: input.schemeId,
    actorId: input.actorId,
    action: "SUSPENSE_CLEARED",
    entityType: "BankTransaction",
    entityId: item.bankTransactionId,
    metadata: { suspenseItemId: item.id, target: input.target.kind, journalEntryId: clearedJournalEntryId },
  });
}
