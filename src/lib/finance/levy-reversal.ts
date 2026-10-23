/**
 * Levy receipts and their reversal (pure).
 *
 * A receipt is one journal entry, however many notices it pays (TC-004):
 * a debit to the bank (or suspense) for each fund, and a credit to levies
 * receivable for each notice, with the lot on the line. Any part above what a
 * notice owes is credited to levies paid in advance as the owner's credit.
 *
 * Reversing a receipt (wrong lot TC-003, dishonoured TC-008, or entered in
 * error) reverses the journal and also puts each notice back: the payment is
 * marked reversed, the notice's amount paid and balance are restored, and
 * any credit the receipt created is taken back out.
 */

export type ReversalReason = "WRONG_LOT" | "DISHONOURED" | "ENTERED_IN_ERROR";

export const REVERSAL_LABELS: Record<ReversalReason, string> = {
  WRONG_LOT: "Allocated to the wrong lot",
  DISHONOURED: "Dishonoured by the bank",
  ENTERED_IN_ERROR: "Entered in error",
};

export interface ReceiptPart {
  levyNoticeId: string;
  noticeNumber: string;
  lotId: string;
  fundId: string;
  /** Applied to what the notice owes. */
  appliedCents: number;
  /** Above what the notice owes, held as the owner's credit. */
  excessCents: number;
}

export interface ReceiptLine {
  accountCodeId: string;
  fundId: string;
  debitCents?: number;
  creditCents?: number;
  description: string;
  lotId?: string;
}

/** The lines of a single receipt journal for one or more notices. */
export function receiptJournalLines(
  parts: ReceiptPart[],
  accounts: { debitAccountId: string; receivableByFund: Record<string, string>; advanceByFund: Record<string, string | null> },
  debitDescription: string,
): ReceiptLine[] {
  const lines: ReceiptLine[] = [];
  const byFund = new Map<string, number>();
  for (const p of parts) byFund.set(p.fundId, (byFund.get(p.fundId) ?? 0) + p.appliedCents + p.excessCents);
  for (const [fundId, total] of byFund) {
    if (total > 0) lines.push({ accountCodeId: accounts.debitAccountId, fundId, debitCents: total, description: debitDescription });
  }
  for (const p of parts) {
    if (p.appliedCents > 0) {
      const receivable = accounts.receivableByFund[p.fundId];
      if (!receivable) throw new Error("No levies receivable account for the notice's fund.");
      lines.push({ accountCodeId: receivable, fundId: p.fundId, creditCents: p.appliedCents, description: `Levies receivable reduced, notice ${p.noticeNumber}`, lotId: p.lotId });
    }
    if (p.excessCents > 0) {
      const advance = accounts.advanceByFund[p.fundId];
      if (!advance) throw new Error("No levies paid in advance account for the notice's fund.");
      lines.push({ accountCodeId: advance, fundId: p.fundId, creditCents: p.excessCents, description: `Overpayment held as owner credit, notice ${p.noticeNumber}`, lotId: p.lotId });
    }
  }
  return lines;
}

/** A notice after a payment on it is reversed. */
export function noticeAfterReversal(
  notice: { owedCents: number; paidCents: number },
  reversedCents: number,
): { paidCents: number; balanceCents: number; status: "ISSUED" | "PARTIALLY_PAID" | "PAID" } {
  const paidCents = Math.max(0, notice.paidCents - reversedCents);
  const balanceCents = Math.max(0, notice.owedCents - paidCents);
  // OVERDUE is worked out from the due date when the notice is shown (effectiveStatus).
  const status = balanceCents <= 0 ? "PAID" : paidCents > 0 ? "PARTIALLY_PAID" : "ISSUED";
  return { paidCents, balanceCents, status };
}

export interface ReversalCheck {
  entryStatus: string;
  sourceType: string | null;
  payments: Array<{ id: string; reversedAt: unknown }>;
  /** Credit each receipt created, and how much of that lot and fund's credit is still available. */
  credits: Array<{ amountCents: number; availableCents: number; lotNumber: string }>;
  bankTransactions: Array<{ status: string }>;
  reason: ReversalReason;
}

/** Why a receipt cannot be reversed, or null. */
export function reversalProblem(c: ReversalCheck): string | null {
  if (c.sourceType !== "PAYMENT") return "This entry is not a levy receipt.";
  if (c.entryStatus !== "POSTED") return "Only a posted receipt can be reversed.";
  if (c.payments.length === 0) return "No levy payments are linked to this entry, so it cannot be reversed as a receipt.";
  if (c.payments.some((p) => p.reversedAt)) return "This receipt has already been reversed.";
  const short = c.credits.find((x) => x.amountCents > x.availableCents);
  if (short) return `Lot ${short.lotNumber}'s credit from this receipt has already been used or refunded. Reverse that first.`;
  // Moving a receipt (wrong lot, error) takes it off the bank transaction. A
  // reconciled transaction stays as it is: reverse it as dishonoured, or reopen the reconciliation.
  if (c.reason !== "DISHONOURED" && c.bankTransactions.some((t) => t.status === "RECONCILED")) {
    return "The bank transaction for this receipt is reconciled. Reopen the reconciliation before moving the receipt.";
  }
  return null;
}

/** For a reallocation, the new receipts must add up to the receipt being moved. */
export function reallocationProblem(originalCents: number, receipts: Array<{ levyNoticeId: string; amountCents: number }>): string | null {
  if (receipts.length === 0) return "Choose the notice the payment belongs to.";
  if (receipts.some((r) => !(r.amountCents > 0))) return "Enter an amount for each notice.";
  if (new Set(receipts.map((r) => r.levyNoticeId)).size !== receipts.length) return "The same notice is listed twice.";
  const total = receipts.reduce((s, r) => s + r.amountCents, 0);
  if (total !== originalCents) return `The new receipts add up to $${(total / 100).toFixed(2)}. They must add up to the $${(originalCents / 100).toFixed(2)} being moved.`;
  return null;
}

/** Payments still counted: those not reversed by the given date (or not reversed at all, with no date). */
export function livePayments<T extends { reversalDate?: unknown; reversedAt?: unknown }>(payments: T[], asAt?: string): T[] {
  return payments.filter((p) => {
    if (!p.reversedAt && !p.reversalDate) return true;
    if (!asAt) return false;
    const d = String(p.reversalDate ?? p.reversedAt ?? "").slice(0, 10);
    return d > asAt;
  });
}
