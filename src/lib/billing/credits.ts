/**
 * Scheme credit ledger (pure). Data model and maths only: no action consumes
 * credits yet.
 *
 * Rules:
 * - Credits are whole numbers. The balance can never go below zero.
 * - Credits never expire while the scheme account is active, so there is no
 *   expiry transaction.
 * - Credits can only ever pay StrataVerze charges: a consumption must name the
 *   fee event it pays, and there is no way to cash credits out.
 * - A REFUND returns credits to the balance when a charge they paid is
 *   reversed. It must point at that consumption and cannot return more than
 *   was consumed.
 */

export type CreditTransactionType = "PURCHASE" | "ALLOCATION" | "CONSUMPTION" | "ADJUSTMENT" | "REFUND";

export const CREDIT_TRANSACTION_TYPES: readonly CreditTransactionType[] = [
  "PURCHASE",
  "ALLOCATION",
  "CONSUMPTION",
  "ADJUSTMENT",
  "REFUND",
];

export interface CreditTransaction {
  id: string;
  type: CreditTransactionType;
  /** Signed: positive adds to the balance, negative takes from it. */
  credits: number;
  /** For CONSUMPTION: the StrataVerze fee event the credits pay. */
  feeEventId?: string | null;
  /** For REFUND: the CONSUMPTION being returned. */
  refundOfId?: string | null;
}

export class CreditLedgerError extends Error {}

/** The balance after a set of transactions. */
export function creditBalance(history: CreditTransaction[]): number {
  return history.reduce((sum, t) => sum + t.credits, 0);
}

/** Why a transaction cannot be added to the ledger, or null when it can. */
export function creditTransactionProblem(history: CreditTransaction[], txn: CreditTransaction): string | null {
  if (!Number.isInteger(txn.credits) || txn.credits === 0) return "Credits must be a whole number other than zero.";
  if (!CREDIT_TRANSACTION_TYPES.includes(txn.type)) return `Unknown credit transaction type ${String(txn.type)}.`;
  if (history.some((t) => t.id === txn.id)) return "This transaction is already in the ledger.";

  switch (txn.type) {
    case "PURCHASE":
    case "ALLOCATION":
      if (txn.credits < 0) return `A ${txn.type.toLowerCase()} must add credits.`;
      break;
    case "CONSUMPTION": {
      if (txn.credits > 0) return "A consumption must take credits.";
      if (!txn.feeEventId) return "Credits can only pay a StrataVerze charge: name the fee event.";
      const already = history.some((t) => t.type === "CONSUMPTION" && t.feeEventId === txn.feeEventId);
      if (already) return "This charge has already been paid with credits.";
      break;
    }
    case "REFUND": {
      if (txn.credits < 0) return "A refund must return credits.";
      const original = history.find((t) => t.id === txn.refundOfId);
      if (!original || original.type !== "CONSUMPTION") return "A refund must point at the consumption it returns.";
      const refunded = history
        .filter((t) => t.type === "REFUND" && t.refundOfId === original.id)
        .reduce((s, t) => s + t.credits, 0);
      if (refunded + txn.credits > -original.credits) return "A refund cannot return more credits than were used.";
      break;
    }
    case "ADJUSTMENT":
      break;
  }

  if (creditBalance(history) + txn.credits < 0) return "The credit balance cannot go below zero.";
  return null;
}

/** Add a transaction, or throw CreditLedgerError. Returns the new history and balance. */
export function applyCreditTransaction(history: CreditTransaction[], txn: CreditTransaction) {
  const problem = creditTransactionProblem(history, txn);
  if (problem) throw new CreditLedgerError(problem);
  const next = [...history, txn];
  return { history: next, balance: creditBalance(next) };
}

/** A credit pack on the rate card: a number of credits for a flat price. */
export interface CreditRateCardEntry {
  code: string;
  credits: number;
  priceCents: number;
  gstInclusive: boolean;
  effectiveFrom: string;
  effectiveTo?: string | null;
  isActive: boolean;
}

/** Rate card packs on sale on `date` (YYYY-MM-DD). */
export function creditPacksOnSale(card: CreditRateCardEntry[], date: string): CreditRateCardEntry[] {
  return card.filter(
    (e) => e.isActive && e.effectiveFrom <= date && (!e.effectiveTo || date < e.effectiveTo) && e.credits > 0 && e.priceCents >= 0,
  );
}
