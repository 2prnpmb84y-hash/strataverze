/**
 * Platform fee engine (pure). Works out the StrataVerze charge for a fee event
 * from the price book. Fees are always flat amounts looked up from the price
 * book, never a percentage of what the scheme spends or collects.
 *
 * The scheme (owners corporation) pays transaction fees. A fee is never added
 * to the amount on an owner's levy notice.
 */
import { resolvePrice, type PayerType, type PriceBookEntry } from "./price-book";
import { splitGst } from "./money";

// ─── Transaction service fees ────────────────────────────────────────────────

/** Money movements that attract a transaction service fee. */
export const TRANSACTION_FEE_EVENTS = [
  "LEVY_RECEIPT",
  "SPECIAL_LEVY_RECEIPT",
  "SUPPLIER_DISBURSEMENT",
  "STRATA_MANAGER_DISBURSEMENT",
  "INSURANCE_PREMIUM_DISBURSEMENT",
  "OWNER_REFUND",
  "RECOVERY_RECEIPT",
  "TERM_DEPOSIT_TRANSFER",
] as const;
export type TransactionFeeEvent = (typeof TRANSACTION_FEE_EVENTS)[number];

/** Money movements that are never fee events. */
export const NON_FEE_MOVEMENTS = ["INTERNAL_FUND_TRANSFER"] as const;
export type NonFeeMovement = (typeof NON_FEE_MOVEMENTS)[number];

export type MoneyMovement = TransactionFeeEvent | NonFeeMovement;

/**
 * TIERED: price by payment amount band (code TXN_FEE, banded in cents).
 * FLAT: one price for every event (code TXN_FEE_FLAT), selectable for pilots.
 */
export type TransactionFeeMode = "TIERED" | "FLAT";

export const TXN_FEE_CODE = "TXN_FEE";
export const TXN_FEE_FLAT_CODE = "TXN_FEE_FLAT";

export interface FeeQuote {
  code: string;
  variant: string | null;
  description: string;
  exGstCents: number;
  gstCents: number;
  totalCents: number;
  payerType: PayerType;
  recoverableFromOwner: boolean;
}

export class FeeConfigError extends Error {}

/**
 * Fees that are never passed to an owner, whatever the price book says: no
 * fee can be charged for a payment plan request (NSW Government guide to
 * strata law changes, from 27 Oct 2025). StrataVerze charges the owners corporation only (decided
 * 26 Oct 2026).
 *
 * Each rule pack holds its own list (NEVER_RECOVERABLE_FEE_VARIANTS, stage 2,
 * step 8), which capture.ts passes for the building. This is the NSW pack's
 * list, the default for a caller without a building, kept here so the
 * browser bundle has no pack (a test checks it equals the NSW pack's).
 */
export const NEVER_RECOVERABLE_FROM_OWNER: ReadonlyArray<{ code: string; variant: string }> = [{ code: "RECOVERY_STEP", variant: "PAYMENT_PLAN" }];

function quoteFrom(
  entry: PriceBookEntry,
  quantity = 1,
  neverRecoverable: ReadonlyArray<{ code: string; variant: string }> = NEVER_RECOVERABLE_FROM_OWNER,
): FeeQuote {
  if (entry.amountCents == null) {
    throw new FeeConfigError(`${entry.code} has no price and needs a manual quote.`);
  }
  const split = splitGst(entry.amountCents * quantity, entry.gstInclusive);
  const ocOnly = neverRecoverable.some((f) => f.code === entry.code && f.variant === (entry.variant ?? null));
  return {
    code: entry.code,
    variant: entry.variant ?? null,
    description: entry.description,
    ...split,
    payerType: ocOnly ? "OC" : entry.payerType,
    recoverableFromOwner: ocOnly ? false : (entry.recoverableFromOwner ?? false),
  };
}

/**
 * The transaction service fee for a money movement, or null when the movement
 * is not a fee event (internal transfers between the scheme's own funds).
 */
export function transactionFee(input: {
  movement: MoneyMovement;
  paymentCents: number;
  mode: TransactionFeeMode;
  priceBook: PriceBookEntry[];
  date: string;
}): FeeQuote | null {
  if ((NON_FEE_MOVEMENTS as readonly string[]).includes(input.movement)) return null;
  if (!(TRANSACTION_FEE_EVENTS as readonly string[]).includes(input.movement)) {
    throw new FeeConfigError(`Unknown money movement ${input.movement}.`);
  }
  if (!Number.isInteger(input.paymentCents) || input.paymentCents <= 0) {
    throw new FeeConfigError("Payment amount must be whole cents above zero.");
  }
  const entry =
    input.mode === "FLAT"
      ? resolvePrice(input.priceBook, { code: TXN_FEE_FLAT_CODE, date: input.date })
      : resolvePrice(input.priceBook, { code: TXN_FEE_CODE, date: input.date, bandValue: input.paymentCents });
  if (!entry) {
    throw new FeeConfigError(`No ${input.mode === "FLAT" ? TXN_FEE_FLAT_CODE : TXN_FEE_CODE} price applies on ${input.date}.`);
  }
  return quoteFrom(entry);
}

// ─── Usage fees ──────────────────────────────────────────────────────────────

/** Usage fee codes. Each is priced (and can be switched off) in the price book. */
export const USAGE_FEE_CODES = [
  "MEETING_EGM",
  "BALLOT",
  "RECOVERY_STEP",
  "S184_CERTIFICATE",
  "S182_INSPECTION",
  "TRANSFER",
  "YEAR_END_PACK",
  "ACCOUNTANT_SEAT",
  "CLAIM_HANDLING",
  "WORKS_CONTRACT",
  "WORKS_VARIATION",
  "PAPER_NOTICE",
  "DEVELOPER_SETUP",
  "EDUCATION",
  "COMPLIANCE_VERIFICATION",
] as const;
export type UsageFeeCode = (typeof USAGE_FEE_CODES)[number];

/**
 * The usage fee for an event, or null when the fee is switched off (no active
 * price row). `variant` selects a priced option (e.g. a recovery step type).
 * `bandValue` selects a band (contract value in cents, or lot count).
 * `quantity` multiplies per-unit prices (e.g. accountant seats).
 */
export function usageFee(input: {
  code: UsageFeeCode;
  priceBook: PriceBookEntry[];
  date: string;
  variant?: string | null;
  bandValue?: number;
  quantity?: number;
  /** The building's pack's NEVER_RECOVERABLE_FEE_VARIANTS. Without it, the NSW list applies. */
  neverRecoverableFromOwner?: ReadonlyArray<{ code: string; variant: string }>;
}): FeeQuote | null {
  const entry = resolvePrice(input.priceBook, {
    code: input.code,
    variant: input.variant ?? null,
    date: input.date,
    bandValue: input.bandValue,
  });
  if (!entry) return null;
  const quantity = input.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new FeeConfigError("Quantity must be a whole number of one or more.");
  }
  return quoteFrom(entry, quantity, input.neverRecoverableFromOwner);
}

/**
 * A paper notice: the mail house cost plus the configured margin. The margin
 * is a flat amount per notice (price book code PAPER_NOTICE), never a
 * percentage of the cost.
 */
export function paperNoticeFee(input: {
  mailCostCents: number;
  priceBook: PriceBookEntry[];
  date: string;
}): FeeQuote | null {
  const margin = usageFee({ code: "PAPER_NOTICE", priceBook: input.priceBook, date: input.date });
  if (!margin) return null;
  if (!Number.isInteger(input.mailCostCents) || input.mailCostCents < 0) {
    throw new FeeConfigError("Mail cost must be whole cents.");
  }
  // The mail cost is passed through ex GST and GST is applied on the total.
  const split = splitGst(input.mailCostCents + margin.exGstCents, false);
  return { ...margin, ...split };
}

// ─── Idempotency ─────────────────────────────────────────────────────────────

/**
 * Deterministic key for a fee event, so replaying the triggering action never
 * charges twice. One fee per code and variant per source record.
 */
export function feeIdempotencyKey(input: {
  code: string;
  sourceType: string;
  sourceId: string;
  variant?: string | null;
}): string {
  for (const [name, value] of Object.entries({ code: input.code, sourceType: input.sourceType, sourceId: input.sourceId })) {
    if (!value || /[:\s]/.test(value)) throw new Error(`${name} must be non-empty with no spaces or colons.`);
  }
  if (input.variant != null && /[:\s]/.test(input.variant)) {
    throw new Error("variant must have no spaces or colons.");
  }
  return [input.code, input.variant ?? "-", input.sourceType, input.sourceId].join(":");
}

/** Key for the reversal of a fee event (the original is kept, never deleted). */
export function reversalIdempotencyKey(originalKey: string): string {
  return `${originalKey}:REVERSAL`;
}
