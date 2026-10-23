/**
 * Owner credit (pure): payments above what a levy notice owes, and applying
 * that credit to later notices. Money is in whole cents. Nothing here reads
 * the database.
 */

/** Split a payment on a notice into what the notice takes and the excess held as credit. */
export function splitLevyPayment(paymentCents: number, owingCents: number): { appliedCents: number; excessCents: number } {
  const owing = Math.max(0, owingCents);
  const applied = Math.min(Math.max(0, paymentCents), owing);
  return { appliedCents: applied, excessCents: Math.max(0, paymentCents - applied) };
}

export interface NoticeForCredit {
  id: string;
  dueDate: string;
  owingCents: number;
}

/**
 * Apply available credit to notices, earliest due date first, until the
 * credit runs out. Returns one application per notice that receives credit.
 */
export function planCreditApplication(availableCents: number, notices: NoticeForCredit[]): { noticeId: string; amountCents: number }[] {
  let left = Math.max(0, availableCents);
  const out: { noticeId: string; amountCents: number }[] = [];
  for (const n of [...notices].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id))) {
    if (left <= 0) break;
    const take = Math.min(left, Math.max(0, n.owingCents));
    if (take <= 0) continue;
    out.push({ noticeId: n.id, amountCents: take });
    left -= take;
  }
  return out;
}

/** Credit that can still be applied or refunded: the balance less refunds already requested. */
export function availableCredit(balanceCents: number, pendingRefundsCents: number): number {
  return Math.max(0, balanceCents - Math.max(0, pendingRefundsCents));
}

/** Why a refund request cannot go ahead, or null. */
export function refundProblem(input: {
  amountCents: number;
  balanceCents: number;
  pendingRefundsCents: number;
  bsb: string;
  accountNumber: string;
  payeeName: string;
  verificationMethod: string;
}): string | null {
  if (!(input.amountCents > 0)) return "Enter the amount to refund.";
  const available = availableCredit(input.balanceCents, input.pendingRefundsCents);
  if (input.amountCents > available) {
    return `The refund is more than the credit available ($${(available / 100).toFixed(2)}).`;
  }
  if (!input.payeeName.trim()) return "Enter the name on the owner's bank account.";
  if (!/^\d{3}-?\d{3}$/.test(input.bsb.trim())) return "Enter a six digit BSB.";
  if (!/^\d{5,10}$/.test(input.accountNumber.replace(/\s/g, ""))) return "Enter the owner's account number (5 to 10 digits).";
  if (input.verificationMethod !== "CALLBACK" && input.verificationMethod !== "DOCUMENT") {
    return "Record how the owner's bank details were confirmed.";
  }
  return null;
}

export type CreditJournalKind = "HELD" | "APPLIED" | "REFUNDED";

/**
 * Which accounts a credit movement debits and credits. Credit held is a
 * liability of the owners corporation (levies paid in advance):
 * - HELD: money received above what was owed. DR bank, CR levies paid in advance.
 * - APPLIED: credit used against a notice. DR levies paid in advance, CR levies receivable.
 * - REFUNDED: credit paid back to the owner. DR levies paid in advance, CR bank.
 */
export function creditJournalAccounts(
  kind: CreditJournalKind,
  accounts: { bankId: string; receivableId: string; advanceId: string },
): { debitAccountId: string; creditAccountId: string } {
  switch (kind) {
    case "HELD":
      return { debitAccountId: accounts.bankId, creditAccountId: accounts.advanceId };
    case "APPLIED":
      return { debitAccountId: accounts.advanceId, creditAccountId: accounts.receivableId };
    case "REFUNDED":
      return { debitAccountId: accounts.advanceId, creditAccountId: accounts.bankId };
  }
}
