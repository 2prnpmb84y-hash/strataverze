/**
 * Receipting a levy payment (server side): the payment record, any owner
 * credit for an overpayment, and the journal. Used when a payment is
 * recorded against a notice, when a bank deposit is split across notices in
 * reconciliation, and when a suspense item is cleared to a notice.
 */
import { db } from "@/prisma/db";
import { fromCents, toCents } from "@/lib/billing/money";
import { getSystemAccountBySubType } from "@/lib/queries/account-codes";
import { ensureSystemAccount } from "@/lib/queries/seed-chart-of-accounts";
import { createJournalEntry, getNextEntryNumber, postJournalEntry } from "@/lib/queries/journal-entries";
import { recordLevyPayment } from "@/lib/queries/levy-schedules";
import { logActivity } from "@/lib/queries/activity-log";
import { leviesInAdvanceAccountId } from "./owner-credits";
import { receiptJournalLines, type ReceiptPart } from "./levy-reversal";

export class LevyReceiptError extends Error {
  constructor(
    message: string,
    readonly data?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export interface LevyReceiptResult {
  appliedCents: number;
  excessCents: number;
  journalEntryId: string | null;
  noticeNumber: string;
}

export interface LevyReceiptsResult {
  journalEntryId: string | null;
  parts: ReceiptPart[];
  paymentIds: string[];
}

/**
 * Receipt one payment across one or more levy notices, as one journal entry
 * (TC-004): DR bank (or suspense when clearing a suspense item) for each
 * fund, CR levies receivable for each notice with its lot, and CR levies paid
 * in advance for any part above what a notice owes. An overpayment needs
 * `confirmOverpayment`. Each payment is linked to the journal so the receipt
 * can be reversed later with its notices.
 */
export async function receiptLevyPayments(input: {
  schemeId: string;
  receipts: Array<{ levyNoticeId: string; amountCents: number }>;
  paymentDate: string;
  actorId: string;
  reference?: string | null;
  feeConfirmedCents?: number | null;
  confirmOverpayment?: boolean;
  /** False when the fee is captured once for the bank deposit instead. Only one notice is ever charged. */
  captureFee?: boolean;
  /** The account the money is debited to: the bank, or suspense when clearing a suspense item. */
  debitFrom?: "BANK" | "SUSPENSE";
}): Promise<LevyReceiptsResult> {
  if (input.receipts.length === 0) throw new LevyReceiptError("Choose a notice for the payment.");
  if (input.receipts.some((r) => !(r.amountCents > 0))) throw new LevyReceiptError("Payment amount must be greater than zero.");
  if (new Set(input.receipts.map((r) => r.levyNoticeId)).size !== input.receipts.length) throw new LevyReceiptError("The same notice is listed twice.");
  const notices = await db.orm.public.LevyNotice.where((ln) => ln.id.in(input.receipts.map((r) => r.levyNoticeId))).include("fund").limit(500).all();

  // Check every notice before recording anything, so a problem does not leave a receipt half done.
  for (const r of input.receipts) {
    const notice = notices.find((n) => n.id === r.levyNoticeId);
    if (!notice || notice.schemeId !== input.schemeId) throw new LevyReceiptError("Levy notice not found.");
    if (notice.status === "DRAFT" || notice.status === "WRITTEN_OFF") throw new LevyReceiptError(`Notice ${String(notice.noticeNumber)} is not an issued notice.`);
    const owedCents = toCents(String(notice.amountDue)) + toCents(String(notice.interestCharged ?? 0)) - toCents(String(notice.amountPaid));
    const excessCents = Math.max(0, r.amountCents - Math.max(0, owedCents));
    if (excessCents > 0 && !input.confirmOverpayment) {
      throw new LevyReceiptError(
        owedCents <= 0
          ? `Notice ${String(notice.noticeNumber)} is already paid. Confirm that the whole payment is to be held as the owner's credit.`
          : `This payment is $${fromCents(excessCents).toFixed(2)} more than notice ${String(notice.noticeNumber)} owes. Confirm that the extra is to be held as the owner's credit.`,
        { overpayment: true, excess: fromCents(excessCents) },
      );
    }
  }

  const parts: ReceiptPart[] = [];
  const paymentIds: string[] = [];
  const creditTxIds: string[] = [];
  for (const [i, r] of input.receipts.entries()) {
    const notice = notices.find((n) => n.id === r.levyNoticeId)!;
    const result = await recordLevyPayment(r.levyNoticeId, fromCents(r.amountCents), {
      paymentDate: input.paymentDate,
      recordedBy: input.actorId,
      reference: input.reference ?? null,
      feeConfirmedCents: input.feeConfirmedCents ?? null,
      captureFee: (input.captureFee ?? true) && input.receipts.length === 1 && i === 0,
    });
    if (result.receiptId) paymentIds.push(result.receiptId);
    if (result.creditTxId) creditTxIds.push(result.creditTxId);
    parts.push({
      levyNoticeId: notice.id,
      noticeNumber: String(notice.noticeNumber),
      lotId: notice.lotId,
      fundId: notice.fundId,
      appliedCents: result.appliedCents,
      excessCents: result.excessCents,
    });
  }

  // The accounts the receipt posts to. Without them (a scheme whose chart is not seeded) the
  // payments are recorded with no journal, as before.
  const debitAccount =
    (input.debitFrom ?? "BANK") === "BANK" ? await getSystemAccountBySubType(input.schemeId, "BANK", "ADMINISTRATIVE") : await suspenseAccount(input.schemeId);
  const receivableByFund: Record<string, string> = {};
  const advanceByFund: Record<string, string | null> = {};
  for (const fundId of new Set(parts.map((p) => p.fundId))) {
    const notice = notices.find((n) => n.fundId === fundId)!;
    const fundType = (notice.fund?.fundType ?? "ADMINISTRATIVE") as "ADMINISTRATIVE" | "CAPITAL_WORKS";
    const ar = await getSystemAccountBySubType(input.schemeId, "ACCOUNTS_RECEIVABLE", fundType);
    if (ar) receivableByFund[fundId] = ar.id;
    advanceByFund[fundId] = parts.some((p) => p.fundId === fundId && p.excessCents > 0) ? await leviesInAdvanceAccountId(input.schemeId, fundId) : null;
  }
  const canPost =
    !!debitAccount &&
    parts.every((p) => (p.appliedCents === 0 || receivableByFund[p.fundId]) && (p.excessCents === 0 || advanceByFund[p.fundId]));

  let journalEntryId: string | null = null;
  if (canPost) {
    const lines = receiptJournalLines(
      parts,
      { debitAccountId: debitAccount!.id, receivableByFund, advanceByFund },
      input.debitFrom === "SUSPENSE" ? "Suspense cleared — levy payment identified" : "Bank receipt — levy payment",
    );
    const entryNumber = await getNextEntryNumber(input.schemeId);
    const numbers = parts.map((p) => p.noticeNumber).join(", ");
    const entry = await createJournalEntry({
      schemeId: input.schemeId,
      entryNumber,
      transactionDate: input.paymentDate,
      description: `Levy payment received — ${parts.length === 1 ? "notice" : "notices"} ${numbers}`.slice(0, 500),
      entryType: "AUTO",
      sourceType: "PAYMENT",
      // One notice: the notice. Several: the payments are linked through levy_payments.journal_entry_id.
      sourceId: parts.length === 1 ? parts[0].levyNoticeId : undefined,
      createdBy: input.actorId,
      lines: lines.map((l) => ({
        accountCodeId: l.accountCodeId,
        fundId: l.fundId,
        debit: l.debitCents ? fromCents(l.debitCents) : undefined,
        credit: l.creditCents ? fromCents(l.creditCents) : undefined,
        description: l.description,
        lotId: l.lotId,
      })),
    });
    await postJournalEntry(entry.id, input.actorId);
    journalEntryId = entry.id;
    if (paymentIds.length) await db.orm.public.LevyPayment.where((p) => p.id.in(paymentIds)).update({ journalEntryId: entry.id });
    if (creditTxIds.length) await db.orm.public.OwnerCreditTransaction.where((t) => t.id.in(creditTxIds)).update({ journalEntryId: entry.id });
  }

  for (const p of parts) {
    await logActivity({
      schemeId: input.schemeId,
      actorId: input.actorId,
      action: "LEVY_PAYMENT_RECORDED",
      entityType: "LevyNotice",
      entityId: p.levyNoticeId,
      metadata: { amount: fromCents(p.appliedCents + p.excessCents), paymentDate: input.paymentDate, creditHeld: fromCents(p.excessCents), journalEntryId },
    });
    if (p.excessCents > 0) {
      await logActivity({
        schemeId: input.schemeId,
        actorId: input.actorId,
        action: "OWNER_CREDIT_RECEIVED",
        entityType: "Lot",
        entityId: p.lotId,
        metadata: { amount: fromCents(p.excessCents), levyNoticeId: p.levyNoticeId },
      });
    }
  }
  return { journalEntryId, parts, paymentIds };
}

/** Receipt a payment against one levy notice. See receiptLevyPayments. */
export async function receiptLevyPayment(input: {
  schemeId: string;
  levyNoticeId: string;
  amountCents: number;
  paymentDate: string;
  actorId: string;
  reference?: string | null;
  feeConfirmedCents?: number | null;
  confirmOverpayment?: boolean;
  captureFee?: boolean;
  debitFrom?: "BANK" | "SUSPENSE";
}): Promise<LevyReceiptResult> {
  const { levyNoticeId, amountCents, ...rest } = input;
  const r = await receiptLevyPayments({ ...rest, receipts: [{ levyNoticeId, amountCents }] });
  return { appliedCents: r.parts[0].appliedCents, excessCents: r.parts[0].excessCents, journalEntryId: r.journalEntryId, noticeNumber: r.parts[0].noticeNumber };
}

/** The scheme's suspense account (administrative fund), created for older schemes if missing. */
export async function suspenseAccount(schemeId: string) {
  const existing = await getSystemAccountBySubType(schemeId, "SUSPENSE");
  if (existing) return existing;
  const admin = await db.orm.public.Fund.where((f) => f.schemeId.eq(schemeId)).limit(10).all();
  const fund = admin.find((f) => f.fundType === "ADMINISTRATIVE");
  return fund ? ensureSystemAccount(schemeId, "SUSPENSE", fund.id) : null;
}
