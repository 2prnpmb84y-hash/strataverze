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
import { getNextEntryNumber } from "@/lib/queries/journal-entries";
import { addNumberedJournal, numberedTransaction, type Tx } from "@/lib/queries/journal-numbering";
import { logActivity } from "@/lib/queries/activity-log";
import { leviesInAdvanceAccountId } from "./owner-credits";
import { receiptJournalLines, type ReceiptPart } from "./levy-reversal";
import { recordLevyPaymentIn } from "@/lib/queries/levy-schedules";
import { createPostedJournalEntryIn, validatePeriodForPosting } from "@/lib/queries/journal-entries";
import type { StatutoryRules } from "@/config/statutory";
import { todayIn } from "@/lib/jurisdiction/time-zone";
import { capitalise } from "@/lib/jurisdiction/wording";
import { getSchemeInterestSetting, lateChargeFirstRules } from "./interest-setting";
import { chargeLockedNotice, lateChargeAccounts, lockJournalNumbering, lockLateCharge, logLateChargeCharged, type LateChargeCharged } from "@/lib/queries/interest";

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

interface ReceiptInput {
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
}

/** Refuse a payment above what a notice owes unless the overpayment is confirmed. */
function checkOverpayment(noticeNumber: string, owedCents: number, amountCents: number, confirmOverpayment?: boolean) {
  const excessCents = Math.max(0, amountCents - Math.max(0, owedCents));
  if (excessCents > 0 && !confirmOverpayment) {
    throw new LevyReceiptError(
      owedCents <= 0
        ? `Notice ${noticeNumber} is already paid. Confirm that the whole payment is to be held as the owner's credit.`
        : `This payment is $${fromCents(excessCents).toFixed(2)} more than notice ${noticeNumber} owes. Confirm that the extra is to be held as the owner's credit.`,
      { overpayment: true, excess: fromCents(excessCents) },
    );
  }
}

type NoticeRow = Awaited<ReturnType<typeof loadNotices>>[number];
const loadNotices = (ids: string[]) => db.orm.public.LevyNotice.where((ln) => ln.id.in(ids)).include("fund").limit(500).all();

/**
 * A receipt where the building applies payments to the late charge first, as
 * one transaction, so it is all written or none of it is. The periods of the
 * payment date are checked first, and a payment date after the building's
 * today is refused. Then, in the transaction:
 * 1. lock the building's journal numbering (lockJournalNumbering), then each
 *    notice in id order (lockLateCharge), so two receipts or a receipt and the
 *    penalty run never deadlock or take the same entry number;
 * 2. work out under the locks the late charge to the payment date and what
 *    earlier payments paid, and check for an overpayment;
 * 3. charge the late charge, with its journal dated the payment date;
 * 4. record each payment with its late charge part;
 * 5. post the receipt journal (late charge and levy lines), linked to the
 *    payments and any credit.
 * The activity is logged once the transaction has committed.
 */
async function prepareLateChargeFirst(input: ReceiptInput, notices: NoticeRow[], pack: { rules: StatutoryRules; label: string }): Promise<PreparedLevyReceipt> {
  const setting = await getSchemeInterestSetting(input.schemeId);
  const today = todayIn(setting.timeZone);
  if (input.paymentDate > today) {
    throw new LevyReceiptError(`The payment date ${input.paymentDate} is after today (${today}). Enter the day the money was received.`);
  }
  // Both journals are dated the payment date: refuse before anything is written if its period is closed or locked.
  try {
    await validatePeriodForPosting(input.schemeId, input.paymentDate, "INTEREST");
    await validatePeriodForPosting(input.schemeId, input.paymentDate, "AUTO");
  } catch (err) {
    throw new LevyReceiptError(err instanceof Error ? err.message : String(err));
  }
  // The accounts the receipt posts from, found (or set up for an older scheme) before the transaction.
  const debitFrom = input.debitFrom ?? "BANK";
  const debitAccount = debitFrom === "BANK" ? await getSystemAccountBySubType(input.schemeId, "BANK", "ADMINISTRATIVE") : await suspenseAccount(input.schemeId);
  const bank = debitFrom === "SUSPENSE" ? await getSystemAccountBySubType(input.schemeId, "BANK", "ADMINISTRATIVE") : null;
  const receivableByFund: Record<string, string> = {};
  const fundTypeOf = (fundId: string) => String(notices.find((n) => n.fundId === fundId)?.fund?.fundType ?? "ADMINISTRATIVE");
  for (const fundId of new Set(notices.map((n) => n.fundId))) {
    const ar = await getSystemAccountBySubType(input.schemeId, "ACCOUNTS_RECEIVABLE", fundTypeOf(fundId) as "ADMINISTRATIVE" | "CAPITAL_WORKS");
    if (ar) receivableByFund[fundId] = ar.id;
  }
  // Levies paid in advance, needed only when an overpayment is confirmed (one not confirmed is refused).
  const advanceIdByFund: Record<string, string | null> = {};
  if (input.confirmOverpayment) for (const fundId of new Set(notices.map((n) => n.fundId))) advanceIdByFund[fundId] = await leviesInAdvanceAccountId(input.schemeId, fundId);
  // The late charge accounts, by fund type.
  const chargeAccounts = await lateChargeAccounts(input.schemeId, notices.map((n) => fundTypeOf(n.fundId)));

  let charges: LateChargeCharged[] = [];
  const run = async (tx: Tx): Promise<LevyReceiptsResult> => {
    charges = [];
    await lockJournalNumbering(tx, input.schemeId);
    const ids = input.receipts.map((r) => r.levyNoticeId);
    const locked = new Map<string, Awaited<ReturnType<typeof lockLateCharge>>>();
    for (const id of [...ids].sort()) locked.set(id, await lockLateCharge(tx, { schemeId: input.schemeId, noticeId: id, asAt: input.paymentDate, setting }));

    // Check every notice, as it stands under the lock, before anything is written.
    for (const r of input.receipts) {
      const l = locked.get(r.levyNoticeId);
      if (!l) throw new LevyReceiptError("Levy notice not found.");
      const n = l.notice;
      if (n.status === "DRAFT" || n.status === "WRITTEN_OFF") throw new LevyReceiptError(`Notice ${String(n.noticeNumber)} is not an issued notice.`);
      const owedCents = toCents(String(n.amountDue)) + toCents(String(n.interestCharged ?? 0)) - toCents(String(n.amountPaid)) + l.position.additionalCents;
      checkOverpayment(String(n.noticeNumber), owedCents, r.amountCents, input.confirmOverpayment);
    }

    // The late charge to the payment date, charged before the payment is applied to it.
    for (const id of [...ids].sort()) {
      const l = locked.get(id)!;
      if (l.position.additionalCents <= 0) continue;
      charges.push(
        await chargeLockedNotice(tx, {
          schemeId: input.schemeId,
          notice: l.notice,
          amountCents: l.position.additionalCents,
          date: input.paymentDate,
          actorId: input.actorId,
          rulePack: pack.label,
          terms: pack.rules.TERMINOLOGY,
          accounts: chargeAccounts.get(fundTypeOf(l.notice.fundId)),
        }),
      );
    }

    const parts: ReceiptPart[] = [];
    const paymentIds: string[] = [];
    const creditTxIds: string[] = [];
    for (const [i, r] of input.receipts.entries()) {
      const { position } = locked.get(r.levyNoticeId)!;
      const notice = notices.find((n) => n.id === r.levyNoticeId)!;
      const result = await recordLevyPaymentIn(tx, r.levyNoticeId, fromCents(r.amountCents), {
        paymentDate: input.paymentDate,
        recordedBy: input.actorId,
        reference: input.reference ?? null,
        feeConfirmedCents: input.feeConfirmedCents ?? null,
        captureFee: (input.captureFee ?? true) && input.receipts.length === 1 && i === 0,
        lateChargeFirst: { chargePaidCents: position.chargePaidCents, accruedByDateCents: position.accruedByDateCents, chargePaidByDateCents: position.chargePaidByDateCents },
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
        lateChargeCents: result.lateChargeCents ?? 0,
      });
    }

    // The receipt journal, in the same transaction. Without the accounts (a scheme whose chart is
    // not seeded) the payments are recorded with no journal, as for any building.
    const advanceByFund: Record<string, string | null> = {};
    for (const fundId of new Set(parts.map((p) => p.fundId))) {
      advanceByFund[fundId] = parts.some((p) => p.fundId === fundId && p.excessCents > 0) ? (advanceIdByFund[fundId] ?? null) : null;
    }
    const canPost =
      !!debitAccount && parts.every((p) => (p.appliedCents === 0 || receivableByFund[p.fundId]) && (p.excessCents === 0 || advanceByFund[p.fundId]));
    let journalEntryId: string | null = null;
    if (canPost) {
      // From suspense: the suspense account is kept in one fund, so a payment
      // for the other fund moves the money there in the bank (review B1).
      const holding = debitFrom === "SUSPENSE" && debitAccount!.fundId && bank ? { fundId: debitAccount!.fundId, bankAccountId: bank.id } : undefined;
      const lines = receiptJournalLines(
        parts,
        { debitAccountId: debitAccount!.id, receivableByFund, advanceByFund, holding, terms: pack.rules.TERMINOLOGY },
        debitFrom === "SUSPENSE" ? "Suspense cleared, payment identified" : "Bank receipt",
      );
      const numbers = parts.map((p) => p.noticeNumber).join(", ");
      const entry = await createPostedJournalEntryIn(
        tx.orm,
        {
          schemeId: input.schemeId,
          entryNumber: await getNextEntryNumber(input.schemeId, tx.orm),
          transactionDate: input.paymentDate,
          description: `${capitalise(pack.rules.TERMINOLOGY.levy)} payment received, ${parts.length === 1 ? "notice" : "notices"} ${numbers}`.slice(0, 500),
          entryType: "AUTO",
          sourceType: "PAYMENT",
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
        },
        input.actorId,
      );
      journalEntryId = entry.id;
      if (paymentIds.length) await tx.orm.public.LevyPayment.where((p) => p.id.in(paymentIds)).updateAndCount({ journalEntryId: entry.id });
      if (creditTxIds.length) await tx.orm.public.OwnerCreditTransaction.where((t) => t.id.in(creditTxIds)).updateAndCount({ journalEntryId: entry.id });
    }
    return { journalEntryId, parts, paymentIds };
  };

  const log = async (out: LevyReceiptsResult) => {
    for (const c of charges) await logLateChargeCharged(input.schemeId, input.actorId, pack.label, c);
    for (const p of out.parts) {
      await logActivity({
        schemeId: input.schemeId,
        actorId: input.actorId,
        action: "LEVY_PAYMENT_RECORDED",
        entityType: "LevyNotice",
        entityId: p.levyNoticeId,
        metadata: {
          amount: fromCents(p.appliedCents + p.excessCents),
          paymentDate: input.paymentDate,
          creditHeld: fromCents(p.excessCents),
          journalEntryId: out.journalEntryId,
          lateChargePaid: fromCents(p.lateChargeCents ?? 0),
        },
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
  };
  return { run, log };
}

/**
 * A receipt checked and ready to write: `run` writes it in the caller's
 * transaction and `log` records the activity once that has committed. `run`
 * takes the building's numbering lock first (a no-op when the caller holds
 * it, as numberedTransaction does), then each notice in id order, and makes
 * no call through the global db, so a caller can write more in the same
 * transaction (a bank deposit's fee and allocation, a cleared suspense item).
 */
export interface PreparedLevyReceipt {
  run: (tx: Tx) => Promise<LevyReceiptsResult>;
  log: (out: LevyReceiptsResult) => Promise<void>;
}

/** Check a receipt and find everything it needs from outside its transaction. See receiptLevyPayments. */
export async function prepareLevyReceipt(input: ReceiptInput): Promise<PreparedLevyReceipt> {
  if (input.receipts.length === 0) throw new LevyReceiptError("Choose a notice for the payment.");
  if (input.receipts.some((r) => !(r.amountCents > 0))) throw new LevyReceiptError("Payment amount must be greater than zero.");
  if (new Set(input.receipts.map((r) => r.levyNoticeId)).size !== input.receipts.length) throw new LevyReceiptError("The same notice is listed twice.");
  const notices = await loadNotices(input.receipts.map((r) => r.levyNoticeId));
  // Late charge first (Queensland) only; null for NSW (levy first).
  const chargeFirst = await lateChargeFirstRules(input.schemeId);
  if (chargeFirst) return prepareLateChargeFirst(input, notices, chargeFirst);
  return prepareLevyFirst(input, notices);
}

/** The part of a payment a notice takes, and the part above what it owes, from what it owes (cents). */
const splitAgainst = (owedCents: number, amountCents: number) => {
  const excessCents = Math.max(0, amountCents - Math.max(0, owedCents));
  return { appliedCents: amountCents - excessCents, excessCents };
};
const lockedNotice = (tx: Tx, id: string) => tx.orm.public.LevyNotice.where((n) => n.id.eq(id)).forNoKeyUpdate().first();
const owedOf = (n: { amountDue: unknown; interestCharged?: unknown; amountPaid: unknown }) =>
  toCents(String(n.amountDue)) + toCents(String(n.interestCharged ?? 0)) - toCents(String(n.amountPaid));

/**
 * A receipt for a building that applies payments to the levy first (NSW).
 * Everything is checked, and the accounts and the period found, before
 * anything is written. Then, in one transaction: the building's numbering
 * lock, each notice locked in id order and checked again as it stands, the
 * payments (and any credit and fee), and the receipt journal, numbered under
 * the lock and posted, linked to the payments. All of it is written or none.
 * The amounts, lines, words, order and statuses are those NSW always had.
 */
async function prepareLevyFirst(input: ReceiptInput, notices: NoticeRow[]): Promise<PreparedLevyReceipt> {
  // Check every notice before recording anything, so a problem does not leave a receipt half done.
  for (const r of input.receipts) {
    const notice = notices.find((n) => n.id === r.levyNoticeId);
    if (!notice || notice.schemeId !== input.schemeId) throw new LevyReceiptError("Levy notice not found.");
    if (notice.status === "DRAFT" || notice.status === "WRITTEN_OFF") throw new LevyReceiptError(`Notice ${String(notice.noticeNumber)} is not an issued notice.`);
    checkOverpayment(String(notice.noticeNumber), owedOf(notice), r.amountCents, input.confirmOverpayment);
  }

  // The accounts the receipt posts to, found (or set up for an older scheme) before the transaction.
  // Without them (a scheme whose chart is not seeded) the payments are recorded with no journal, as before.
  const debitFrom = input.debitFrom ?? "BANK";
  const debitAccount = debitFrom === "BANK" ? await getSystemAccountBySubType(input.schemeId, "BANK", "ADMINISTRATIVE") : await suspenseAccount(input.schemeId);
  const bank = input.debitFrom === "SUSPENSE" ? await getSystemAccountBySubType(input.schemeId, "BANK", "ADMINISTRATIVE") : null;
  const expected = input.receipts.map((r) => {
    const notice = notices.find((n) => n.id === r.levyNoticeId)!;
    return { fundId: notice.fundId, ...splitAgainst(owedOf(notice), r.amountCents) };
  });
  const receivableByFund: Record<string, string> = {};
  const advanceByFund: Record<string, string | null> = {};
  for (const fundId of new Set(expected.map((p) => p.fundId))) {
    const notice = notices.find((n) => n.fundId === fundId)!;
    const fundType = (notice.fund?.fundType ?? "ADMINISTRATIVE") as "ADMINISTRATIVE" | "CAPITAL_WORKS";
    const ar = await getSystemAccountBySubType(input.schemeId, "ACCOUNTS_RECEIVABLE", fundType);
    if (ar) receivableByFund[fundId] = ar.id;
    advanceByFund[fundId] = expected.some((p) => p.fundId === fundId && p.excessCents > 0) ? await leviesInAdvanceAccountId(input.schemeId, fundId) : null;
  }
  const canPostFor = (parts: Array<{ fundId: string; appliedCents: number; excessCents: number }>) =>
    !!debitAccount && parts.every((p) => (p.appliedCents === 0 || receivableByFund[p.fundId]) && (p.excessCents === 0 || advanceByFund[p.fundId]));
  // The journal is dated the payment date: refuse before anything is written if its period is closed or locked.
  const willPost = canPostFor(expected);
  if (willPost) await validatePeriodForPosting(input.schemeId, input.paymentDate, "AUTO");

  const run = async (tx: Tx): Promise<LevyReceiptsResult> => {
    await lockJournalNumbering(tx, input.schemeId);
    // Each notice in id order, read again under its lock: a receipt at the same moment has been written, or waits for this one.
    const locked = new Map<string, Awaited<ReturnType<typeof lockedNotice>>>();
    for (const id of input.receipts.map((r) => r.levyNoticeId).sort()) locked.set(id, await lockedNotice(tx, id));
    for (const r of input.receipts) {
      const n = locked.get(r.levyNoticeId);
      if (!n || n.schemeId !== input.schemeId) throw new LevyReceiptError("Levy notice not found.");
      if (n.status === "DRAFT" || n.status === "WRITTEN_OFF") throw new LevyReceiptError(`Notice ${String(n.noticeNumber)} is not an issued notice.`);
      const owed = owedOf(n);
      checkOverpayment(String(n.noticeNumber), owed, r.amountCents, input.confirmOverpayment);
      // Paid in the meantime, so part is now held as credit: its account was not found before the lock.
      if (willPost && splitAgainst(owed, r.amountCents).excessCents > 0 && !advanceByFund[n.fundId]) {
        throw new LevyReceiptError(`A payment was recorded on notice ${String(n.noticeNumber)} at the same time. Check the notice and try again.`);
      }
    }

    const parts: ReceiptPart[] = [];
    const paymentIds: string[] = [];
    const creditTxIds: string[] = [];
    for (const [i, r] of input.receipts.entries()) {
      const notice = notices.find((n) => n.id === r.levyNoticeId)!;
      const result = await recordLevyPaymentIn(tx, r.levyNoticeId, fromCents(r.amountCents), {
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

    let journalEntryId: string | null = null;
    if (canPostFor(parts)) {
      // From suspense: the suspense account is kept in one fund, so a payment
      // for the other fund moves the money there in the bank (review B1).
      const holding = input.debitFrom === "SUSPENSE" && debitAccount!.fundId && bank ? { fundId: debitAccount!.fundId, bankAccountId: bank.id } : undefined;
      const lines = receiptJournalLines(
        parts,
        { debitAccountId: debitAccount!.id, receivableByFund, advanceByFund, holding },
        input.debitFrom === "SUSPENSE" ? "Suspense cleared — levy payment identified" : "Bank receipt — levy payment",
      );
      const numbers = parts.map((p) => p.noticeNumber).join(", ");
      // Numbered, written and posted in this transaction, under the building's lock.
      const { entry } = await addNumberedJournal(
        tx,
        {
          schemeId: input.schemeId,
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
        },
        input.actorId,
      );
      journalEntryId = entry.id;
      if (paymentIds.length) await tx.orm.public.LevyPayment.where((p) => p.id.in(paymentIds)).updateAndCount({ journalEntryId: entry.id });
      if (creditTxIds.length) await tx.orm.public.OwnerCreditTransaction.where((t) => t.id.in(creditTxIds)).updateAndCount({ journalEntryId: entry.id });
    }
    return { journalEntryId, parts, paymentIds };
  };

  const log = async ({ journalEntryId, parts }: LevyReceiptsResult) => {
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
  };
  return { run, log };
}

/**
 * Receipt one payment across one or more levy notices, as one journal entry
 * (TC-004): DR bank (or suspense when clearing a suspense item) for each
 * fund, CR levies receivable for each notice with its lot, and CR levies paid
 * in advance for any part above what a notice owes. An overpayment needs
 * `confirmOverpayment`. Each payment is linked to the journal so the receipt
 * can be reversed later with its notices.
 *
 * The payments and the receipt journal are one transaction, numbered under
 * the building's lock (src/lib/queries/journal-numbering.ts): all of it is
 * written or none. Where the building's order applies a payment to the late
 * charge first (Queensland's penalty, SM s 166(5)), see
 * prepareLateChargeFirst; otherwise prepareLevyFirst (NSW).
 */
export async function receiptLevyPayments(input: ReceiptInput): Promise<LevyReceiptsResult> {
  const prepared = await prepareLevyReceipt(input);
  const out = await numberedTransaction(input.schemeId, (tx) => prepared.run(tx));
  await prepared.log(out);
  return out;
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
