/**
 * Reversing a levy receipt (server). TC-003 (allocated to the wrong lot) and
 * TC-008 (dishonoured). The receipt journal is reversed, and in the same
 * transaction each payment is marked reversed, each notice gets back its
 * balance, any credit the receipt created is taken back out, and (except for
 * a dishonour) the receipt is taken off its bank transaction.
 */
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { Numeric, TimestampString, Varchar } from "@prisma/orm-postgres/target/codec-types";
import { toCents, fromCents } from "@/lib/billing/money";
import { createJournalEntry, getNextEntryNumber, postJournalEntry, validatePeriodForPosting } from "@/lib/queries/journal-entries";
import { getSystemAccountBySubType } from "@/lib/queries/account-codes";
import { logActivity } from "@/lib/queries/activity-log";
import { sydneyToday } from "./interest-setting";
import { creditBalanceCents, recordCreditMovement } from "./owner-credits";
import { allocateBankTransaction, syncTransaction } from "./bank-allocations";
import { receiptLevyPayments } from "./levy-receipts";
import { noticeAfterReversal, reallocationProblem, REVERSAL_LABELS, reversalProblem, type ReversalReason } from "./levy-reversal";

const ts = (v: string) => v as unknown as TimestampString<3>;
const varchar = <N extends number>(v: string) => v as unknown as Varchar<N>;
const money = (cents: number) => String(cents / 100) as unknown as Numeric<12, 2>;
const isoDay = (v: unknown) => String(v ?? "").slice(0, 10);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export class ReceiptReversalError extends Error {}

/** A levy receipt journal with its payments, notices, credits and bank transactions. */
export async function getLevyReceipt(schemeId: string, journalEntryId: string) {
  const entry = await db.orm.public.JournalEntry.where((je) => and(je.id.eq(journalEntryId), je.schemeId.eq(schemeId))).include("lines").first();
  if (!entry) return null;
  const payments = await db.orm.public.LevyPayment.where((p) => and(p.schemeId.eq(schemeId), p.journalEntryId.eq(entry.id))).limit(500).all();
  const noticeIds = [...new Set(payments.map((p) => p.levyNoticeId))];
  const [notices, credits, allocations, matched] = await Promise.all([
    noticeIds.length ? db.orm.public.LevyNotice.where((n) => n.id.in(noticeIds)).include("lot").limit(500).all() : Promise.resolve([]),
    db.orm.public.OwnerCreditTransaction.where((t) => and(t.schemeId.eq(schemeId), t.journalEntryId.eq(entry.id), t.type.eq("OVERPAYMENT"))).limit(500).all(),
    db.orm.public.BankTransactionAllocation.where((a) => and(a.schemeId.eq(schemeId), a.journalEntryId.eq(entry.id))).limit(100).all(),
    db.orm.public.BankTransaction.where((t) => and(t.schemeId.eq(schemeId), t.matchedJournalEntryId.eq(entry.id))).limit(100).all(),
  ]);
  const txnIds = [...new Set([...allocations.map((a) => a.bankTransactionId), ...matched.map((t) => t.id)])];
  const bankTransactions = txnIds.length ? await db.orm.public.BankTransaction.where((t) => t.id.in(txnIds)).limit(100).all() : [];
  const lots = await db.orm.public.Lot.where((l) => l.id.in(credits.length ? credits.map((c) => c.lotId) : ["00000000-0000-0000-0000-000000000000"])).limit(500).all();
  const creditChecks = await Promise.all(
    credits.map(async (c) => ({
      id: c.id,
      lotId: c.lotId,
      fundId: c.fundId,
      ownerId: c.ownerId ?? null,
      amountCents: toCents(String(c.amount)),
      availableCents: await creditBalanceCents(db.orm, { schemeId, lotId: c.lotId, fundId: c.fundId }),
      lotNumber: String(lots.find((l) => l.id === c.lotId)?.lotNumber ?? "?"),
    })),
  );
  return { entry, payments, notices, credits: creditChecks, allocations, bankTransactions };
}

export type LevyReceipt = NonNullable<Awaited<ReturnType<typeof getLevyReceipt>>>;

/** Why a receipt cannot be reversed for this reason, or null. */
export function receiptReversalProblem(r: LevyReceipt, reason: ReversalReason): string | null {
  return reversalProblem({
    entryStatus: String(r.entry.status),
    sourceType: r.entry.sourceType,
    payments: r.payments.map((p) => ({ id: p.id, reversedAt: p.reversedAt })),
    credits: r.credits,
    bankTransactions: r.bankTransactions.map((t) => ({ status: String(t.reconciliationStatus) })),
    reason,
  });
}

/**
 * Reverse a levy receipt. For a dishonour, `fee` records the bank's
 * dishonour fee as a separate expense (DR the chosen expense account, CR
 * bank), and the receipt stays on its deposit so the reversal can be
 * matched to the bank's reversing debit.
 */
export async function reverseLevyReceipt(input: {
  schemeId: string;
  journalEntryId: string;
  reason: ReversalReason;
  note?: string | null;
  /** The date the reversal takes effect (the dishonour date). Defaults to today. */
  reversalDate?: string | null;
  fee?: { amountCents: number; accountCodeId: string } | null;
  actorId: string;
}): Promise<{ reversalEntryId: string; feeEntryId: string | null; bankTransactionIds: string[] }> {
  const r = await getLevyReceipt(input.schemeId, input.journalEntryId);
  if (!r) throw new ReceiptReversalError("Journal entry not found.");
  const problem = receiptReversalProblem(r, input.reason);
  if (problem) throw new ReceiptReversalError(problem);
  const date = input.reversalDate || sydneyToday();
  if (!ISO.test(date)) throw new ReceiptReversalError("The reversal date is not a date.");
  if (date < isoDay(r.entry.transactionDate)) throw new ReceiptReversalError("The reversal cannot be dated before the receipt.");
  await validatePeriodForPosting(input.schemeId, date, "REVERSAL");
  if (input.fee) {
    if (!(input.fee.amountCents > 0)) throw new ReceiptReversalError("Enter the dishonour fee, or leave it out.");
    const account = await db.orm.public.AccountCode.where((a) => and(a.id.eq(input.fee!.accountCodeId), a.schemeId.eq(input.schemeId))).first();
    if (!account || account.accountType !== "EXPENSE") throw new ReceiptReversalError("Choose an expense account for the dishonour fee.");
  }

  const entryNumber = await getNextEntryNumber(input.schemeId);
  const now = new Date().toISOString();
  const label = REVERSAL_LABELS[input.reason];
  const note = input.note?.trim().slice(0, 500) || null;
  const removeFromBank = input.reason !== "DISHONOURED";
  const txnIds = r.bankTransactions.map((t) => t.id);

  const reversalEntryId = await db.transaction(async (tx) => {
    // 1. The reversal journal, mirroring the receipt.
    const reversal = await tx.orm.public.JournalEntry.create({
      schemeId: input.schemeId,
      entryNumber: varchar<20>(entryNumber),
      transactionDate: ts(date),
      description: varchar<500>(`Receipt ${String(r.entry.entryNumber)} reversed: ${label}${note ? ` (${note})` : ""}`.slice(0, 500)),
      entryType: "REVERSAL",
      sourceType: "REVERSAL",
      sourceId: r.entry.id,
      status: "POSTED",
      reversalOfId: r.entry.id,
      postedAt: ts(now),
      postedBy: input.actorId,
      createdBy: input.actorId,
    });
    for (const line of r.entry.lines ?? []) {
      await tx.orm.public.JournalLine.create({
        journalEntryId: reversal.id,
        accountCodeId: line.accountCodeId,
        fundId: line.fundId,
        debit: line.credit,
        credit: line.debit,
        description: line.description ? varchar<500>(`Reversal: ${String(line.description)}`.slice(0, 500)) : null,
        lotId: line.lotId ?? null,
        supplierId: line.supplierId ?? null,
        gstAmount: line.gstAmount,
      });
    }
    await tx.orm.public.JournalEntry.where({ id: r.entry.id }).update({ status: "REVERSED" });

    // 2. Each payment marked reversed, and its notice put back.
    for (const p of r.payments) {
      await tx.orm.public.LevyPayment.where((x) => x.id.eq(p.id)).update({
        reversedAt: ts(now),
        reversalDate: ts(date),
        reversalReason: input.reason,
        reversalNote: note,
        reversalJournalEntryId: reversal.id,
      });
      const n = await tx.orm.public.LevyNotice.where((x) => x.id.eq(p.levyNoticeId)).first();
      if (!n) continue;
      const after = noticeAfterReversal(
        { owedCents: toCents(String(n.amountDue)) + toCents(String(n.interestCharged ?? 0)), paidCents: toCents(String(n.amountPaid)) },
        toCents(String(p.amount)),
      );
      await tx.orm.public.LevyNotice.where((x) => x.id.eq(n.id)).update({
        amountPaid: money(after.paidCents),
        balanceOutstanding: money(after.balanceCents),
        status: after.status,
        paidInFullAt: after.status === "PAID" ? n.paidInFullAt : null,
      });
    }

    // 3. Any credit the receipt created, taken back out.
    for (const c of r.credits) {
      await recordCreditMovement(tx.orm, {
        schemeId: input.schemeId,
        lotId: c.lotId,
        fundId: c.fundId,
        ownerId: c.ownerId,
        type: "REVERSED",
        amountCents: c.amountCents,
        note: `Receipt ${String(r.entry.entryNumber)} reversed: ${label}`,
        createdBy: input.actorId,
        effectiveDate: date,
      });
    }

    // 4. Moving the receipt (wrong lot, error) takes it off the bank transaction.
    if (removeFromBank) {
      await tx.orm.public.BankTransactionAllocation.where((a) => a.journalEntryId.eq(r.entry.id)).deleteAndCount();
      for (const id of txnIds) await syncTransaction(tx.orm, id, input.actorId);
    }
    return reversal.id;
  });

  // 5. The dishonour fee, as its own expense entry.
  let feeEntryId: string | null = null;
  if (input.fee) {
    const bank = await getSystemAccountBySubType(input.schemeId, "BANK", "ADMINISTRATIVE");
    const account = await db.orm.public.AccountCode.where((a) => a.id.eq(input.fee!.accountCodeId)).first();
    if (bank && account) {
      const fundId = account.fundId ?? bank.fundId!;
      const feeEntry = await createJournalEntry({
        schemeId: input.schemeId,
        entryNumber: await getNextEntryNumber(input.schemeId),
        transactionDate: date,
        description: `Dishonour fee on receipt ${String(r.entry.entryNumber)}`,
        entryType: "BANK_FEE",
        sourceType: "MANUAL",
        sourceId: r.entry.id,
        createdBy: input.actorId,
        lines: [
          { accountCodeId: account.id, fundId, debit: fromCents(input.fee.amountCents), description: "Bank dishonour fee" },
          { accountCodeId: bank.id, fundId, credit: fromCents(input.fee.amountCents), description: "Bank dishonour fee" },
        ],
      });
      await postJournalEntry(feeEntry.id, input.actorId);
      feeEntryId = feeEntry.id;
    }
  }

  await logActivity({
    schemeId: input.schemeId,
    actorId: input.actorId,
    action: "LEVY_RECEIPT_REVERSED",
    entityType: "JournalEntry",
    entityId: r.entry.id,
    metadata: {
      reason: input.reason,
      note,
      reversalDate: date,
      reversalEntryId,
      feeEntryId,
      payments: r.payments.map((p) => ({ id: p.id, levyNoticeId: p.levyNoticeId, amount: String(p.amount) })),
      creditsReversed: r.credits.map((c) => ({ lotId: c.lotId, amountCents: c.amountCents })),
      removedFromBankTransactions: removeFromBank ? txnIds : [],
    },
  });
  return { reversalEntryId, feeEntryId, bankTransactionIds: txnIds };
}

/**
 * Move a receipt to the right notices (TC-003): reverse it as allocated to
 * the wrong lot, receipt the same amount on the same date to the right
 * notices as one journal, and put that journal on the same bank transaction.
 */
export async function reallocateLevyReceipt(input: {
  schemeId: string;
  journalEntryId: string;
  receipts: Array<{ levyNoticeId: string; amountCents: number }>;
  confirmOverpayment: boolean;
  note?: string | null;
  actorId: string;
}): Promise<{ reversalEntryId: string; newJournalEntryId: string | null }> {
  const r = await getLevyReceipt(input.schemeId, input.journalEntryId);
  if (!r) throw new ReceiptReversalError("Journal entry not found.");
  const problem = receiptReversalProblem(r, "WRONG_LOT");
  if (problem) throw new ReceiptReversalError(problem);
  const totalCents = r.payments.reduce((s, p) => s + toCents(String(p.amount)), 0) + r.credits.reduce((s, c) => s + c.amountCents, 0);
  const moveProblem = reallocationProblem(totalCents, input.receipts);
  if (moveProblem) throw new ReceiptReversalError(moveProblem);
  if (input.receipts.some((x) => r.payments.some((p) => p.levyNoticeId === x.levyNoticeId))) {
    throw new ReceiptReversalError("Choose a different notice from the one the receipt is on now.");
  }
  // The allocation of the receipt to each bank transaction, so the new receipt takes its place.
  const allocations = r.allocations.map((a) => ({ bankTransactionId: a.bankTransactionId, amountCents: toCents(String(a.amount)) }));
  const paymentDate = isoDay(r.entry.transactionDate);
  const reference = r.payments[0]?.reference ? String(r.payments[0].reference) : null;

  const { reversalEntryId } = await reverseLevyReceipt({
    schemeId: input.schemeId,
    journalEntryId: input.journalEntryId,
    reason: "WRONG_LOT",
    note: input.note ?? null,
    actorId: input.actorId,
  });
  const result = await receiptLevyPayments({
    schemeId: input.schemeId,
    receipts: input.receipts,
    paymentDate,
    actorId: input.actorId,
    reference,
    confirmOverpayment: input.confirmOverpayment,
    // The fee, if any, was charged on the original receipt.
    captureFee: false,
  });
  if (result.journalEntryId) {
    for (const a of allocations) {
      await allocateBankTransaction({
        schemeId: input.schemeId,
        transactionId: a.bankTransactionId,
        requests: [{ journalEntryId: result.journalEntryId, amountCents: a.amountCents }],
        actorId: input.actorId,
      });
    }
  }
  await logActivity({
    schemeId: input.schemeId,
    actorId: input.actorId,
    action: "LEVY_RECEIPT_REALLOCATED",
    entityType: "JournalEntry",
    entityId: input.journalEntryId,
    metadata: { reversalEntryId, newJournalEntryId: result.journalEntryId, receipts: input.receipts },
  });
  return { reversalEntryId, newJournalEntryId: result.journalEntryId };
}
