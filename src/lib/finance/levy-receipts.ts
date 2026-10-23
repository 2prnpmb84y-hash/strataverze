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

/**
 * Receipt a payment against a levy notice and post DR bank (or suspense when
 * clearing a suspense item), CR levies receivable, and CR levies paid in
 * advance for any part above what the notice owes. An overpayment needs
 * `confirmOverpayment`.
 */
export async function receiptLevyPayment(input: {
  schemeId: string;
  levyNoticeId: string;
  amountCents: number;
  paymentDate: string;
  actorId: string;
  reference?: string | null;
  feeConfirmedCents?: number | null;
  confirmOverpayment?: boolean;
  /** False when the fee is captured once for the bank deposit instead. */
  captureFee?: boolean;
  /** The account the money is debited to: the bank, or suspense when clearing a suspense item. */
  debitFrom?: "BANK" | "SUSPENSE";
}): Promise<LevyReceiptResult> {
  if (!(input.amountCents > 0)) throw new LevyReceiptError("Payment amount must be greater than zero.");
  const notice = await db.orm.public.LevyNotice.where((ln) => ln.id.eq(input.levyNoticeId)).include("fund").first();
  if (!notice || notice.schemeId !== input.schemeId) throw new LevyReceiptError("Levy notice not found.");

  const owedCents = toCents(String(notice.amountDue)) + toCents(String(notice.interestCharged ?? 0)) - toCents(String(notice.amountPaid));
  const excessCents = Math.max(0, input.amountCents - Math.max(0, owedCents));
  if (excessCents > 0 && !input.confirmOverpayment) {
    throw new LevyReceiptError(
      owedCents <= 0
        ? `Notice ${String(notice.noticeNumber)} is already paid. Confirm that the whole payment is to be held as the owner's credit.`
        : `This payment is $${fromCents(excessCents).toFixed(2)} more than notice ${String(notice.noticeNumber)} owes. Confirm that the extra is to be held as the owner's credit.`,
      { overpayment: true, excess: fromCents(excessCents) },
    );
  }

  const result = await recordLevyPayment(input.levyNoticeId, fromCents(input.amountCents), {
    paymentDate: input.paymentDate,
    recordedBy: input.actorId,
    reference: input.reference ?? null,
    feeConfirmedCents: input.feeConfirmedCents ?? null,
    captureFee: input.captureFee ?? true,
  });

  const fundType = (notice.fund?.fundType ?? "ADMINISTRATIVE") as "ADMINISTRATIVE" | "CAPITAL_WORKS";
  const debitAccount =
    (input.debitFrom ?? "BANK") === "BANK"
      ? await getSystemAccountBySubType(input.schemeId, "BANK", "ADMINISTRATIVE")
      : await suspenseAccount(input.schemeId);
  const receivableAccount = await getSystemAccountBySubType(input.schemeId, "ACCOUNTS_RECEIVABLE", fundType);
  const advanceAccountId = result.excessCents > 0 ? await leviesInAdvanceAccountId(input.schemeId, notice.fundId) : null;

  let journalEntryId: string | null = null;
  if (debitAccount && receivableAccount && (result.excessCents === 0 || advanceAccountId)) {
    const lines: Array<{ accountCodeId: string; fundId: string; debit?: number; credit?: number; description?: string; lotId?: string }> = [
      {
        accountCodeId: debitAccount.id,
        fundId: notice.fundId,
        debit: fromCents(input.amountCents),
        description: input.debitFrom === "SUSPENSE" ? "Suspense cleared — levy payment identified" : "Bank receipt — levy payment",
      },
    ];
    if (result.appliedCents > 0) {
      lines.push({
        accountCodeId: receivableAccount.id,
        fundId: notice.fundId,
        credit: fromCents(result.appliedCents),
        description: "Levies receivable reduced",
        lotId: notice.lotId,
      });
    }
    if (result.excessCents > 0 && advanceAccountId) {
      lines.push({
        accountCodeId: advanceAccountId,
        fundId: notice.fundId,
        credit: fromCents(result.excessCents),
        description: "Overpayment held as owner credit",
        lotId: notice.lotId,
      });
    }
    const entryNumber = await getNextEntryNumber(input.schemeId);
    const entry = await createJournalEntry({
      schemeId: input.schemeId,
      entryNumber,
      transactionDate: input.paymentDate,
      description: `Levy payment received — notice ${String(notice.noticeNumber)}`,
      entryType: "AUTO",
      sourceType: "PAYMENT",
      sourceId: input.levyNoticeId,
      createdBy: input.actorId,
      lines,
    });
    await postJournalEntry(entry.id, input.actorId);
    journalEntryId = entry.id;
    if (result.creditTxId) {
      await db.orm.public.OwnerCreditTransaction.where((t) => t.id.eq(result.creditTxId!)).update({ journalEntryId: entry.id });
    }
  }

  await logActivity({
    schemeId: input.schemeId,
    actorId: input.actorId,
    action: "LEVY_PAYMENT_RECORDED",
    entityType: "LevyNotice",
    entityId: input.levyNoticeId,
    metadata: { amount: fromCents(input.amountCents), paymentDate: input.paymentDate, creditHeld: fromCents(result.excessCents) },
  });
  if (result.excessCents > 0) {
    await logActivity({
      schemeId: input.schemeId,
      actorId: input.actorId,
      action: "OWNER_CREDIT_RECEIVED",
      entityType: "Lot",
      entityId: notice.lotId,
      metadata: { amount: fromCents(result.excessCents), levyNoticeId: input.levyNoticeId },
    });
  }
  return { appliedCents: result.appliedCents, excessCents: result.excessCents, journalEntryId, noticeNumber: String(notice.noticeNumber) };
}

/** The scheme's suspense account (administrative fund), created for older schemes if missing. */
export async function suspenseAccount(schemeId: string) {
  const existing = await getSystemAccountBySubType(schemeId, "SUSPENSE");
  if (existing) return existing;
  const admin = await db.orm.public.Fund.where((f) => f.schemeId.eq(schemeId)).limit(10).all();
  const fund = admin.find((f) => f.fundType === "ADMINISTRATIVE");
  return fund ? ensureSystemAccount(schemeId, "SUSPENSE", fund.id) : null;
}
