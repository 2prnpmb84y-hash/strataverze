/**
 * Fee capture from application actions (server side). Pass the transaction's
 * `orm` so the fee event is written in the same transaction as the action.
 *
 * Capture is switched off unless PLATFORM_BILLING_CAPTURE=on, so no charge is
 * recorded before the disclosure screens exist (hard rule 6).
 * PLATFORM_TXN_FEE_MODE=FLAT selects the flat pilot transaction fee.
 */
import { db } from "@/prisma/db";
import { rulePackFor } from "@/config/statutory";
import { platformToday } from "@/lib/jurisdiction/time-zone";
import type { Numeric, TimestampString } from "@prisma/orm-postgres/target/codec-types";
import { toCents, fromCents } from "./money";
import type { PayerType, PriceBookEntry, PriceUnit } from "./price-book";
import {
  transactionFee,
  usageFee,
  type MoneyMovement,
  type TransactionFeeMode,
  type UsageFeeCode,
  feeIdempotencyKey,
} from "./fee-engine";
import { resolveDisclosure, toFeeView, type FeeView, type FeeWording } from "./disclosure";
import { platformFeeProvider } from "./fee-provider";
import { strataVerzeGstRegistered } from "./strataverze-supplier";
import {
  recordFeeEvent,
  reverseFeeEvent,
  type Disclosure,
  type FeeEventRecord,
  type FeeEventStatus,
  type FeeEventStore,
} from "./fee-ledger";

type Orm = typeof db.orm;

const numeric = (cents: number) => String(fromCents(cents)) as unknown as Numeric<12, 2>;
const ts = (iso: string) => iso as unknown as TimestampString<3>;
const isoDay = (v: unknown) => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v ?? "").slice(0, 10);
};

/**
 * Whether StrataVerze charges are recorded. Needs PLATFORM_BILLING_CAPTURE=on
 * and StrataVerze to be registered for GST (every price adds GST), so a
 * charge can never be raised before the registration takes effect.
 */
export function billingCaptureEnabled(): boolean {
  if (process.env.PLATFORM_BILLING_CAPTURE !== "on") return false;
  if (!strataVerzeGstRegistered()) {
    console.warn("[billing] PLATFORM_BILLING_CAPTURE is on but STRATAVERZE_GST_REGISTERED is not, so no charges are recorded.");
    return false;
  }
  return true;
}

export function transactionFeeMode(): TransactionFeeMode {
  return process.env.PLATFORM_TXN_FEE_MODE === "FLAT" ? "FLAT" : "TIERED";
}

/** The price book rows, as the fee engine expects them. */
export async function loadPriceBook(orm: Orm = db.orm): Promise<PriceBookEntry[]> {
  const rows = await orm.public.PlatformPriceBook.limit(1000).all();
  return rows.map((r) => ({
    code: r.code,
    variant: r.variant ?? null,
    description: r.description,
    amountCents: r.amount == null ? null : toCents(String(r.amount)),
    gstInclusive: r.gstInclusive,
    unit: r.unit as PriceUnit,
    payerType: r.payerType as PayerType,
    effectiveFrom: isoDay(r.effectiveFrom),
    effectiveTo: r.effectiveTo ? isoDay(r.effectiveTo) : null,
    isActive: r.isActive,
    recoverableFromOwner: r.recoverableFromOwner,
    bandMin: r.bandMin ?? null,
    bandMax: r.bandMax ?? null,
  }));
}

function toRecord(r: Awaited<ReturnType<Orm["public"]["PlatformFeeEvent"]["first"]>>): FeeEventRecord | null {
  if (!r) return null;
  return {
    id: r.id,
    schemeId: r.schemeId,
    code: r.code,
    variant: r.variant ?? null,
    description: r.description,
    sourceType: r.sourceType,
    sourceId: r.sourceId,
    quantity: r.quantity,
    amountExGstCents: toCents(String(r.amountExGst)),
    gstCents: toCents(String(r.gstAmount)),
    payerType: r.payerType,
    payerProfileId: r.payerProfileId ?? null,
    recoverableFromOwner: r.recoverableFromOwner,
    status: r.status as FeeEventStatus,
    reversalOfId: r.reversalOfId ?? null,
    disclosureShownToId: r.disclosureShownToId ?? null,
    disclosureShownAt: r.disclosureShownAt ? String(r.disclosureShownAt) : null,
    disclosedAmountCents: r.disclosedAmount == null ? null : toCents(String(r.disclosedAmount)),
    createdById: r.createdById ?? null,
    idempotencyKey: r.idempotencyKey,
  };
}

/** Fee event store backed by the database (or a transaction's orm). */
export function ormFeeEventStore(orm: Orm = db.orm): FeeEventStore {
  const findByKey = async (key: string) =>
    toRecord(await orm.public.PlatformFeeEvent.where((e) => e.idempotencyKey.eq(key)).first());
  return {
    findByKey,
    async insert(e) {
      const existing = await findByKey(e.idempotencyKey);
      if (existing) return { event: existing, created: false };
      const row = await orm.public.PlatformFeeEvent.create({
        schemeId: e.schemeId,
        code: e.code,
        variant: e.variant,
        description: e.description,
        sourceType: e.sourceType,
        sourceId: e.sourceId,
        quantity: e.quantity,
        amountExGst: numeric(e.amountExGstCents),
        gstAmount: numeric(e.gstCents),
        payerType: e.payerType,
        payerProfileId: e.payerProfileId,
        recoverableFromOwner: e.recoverableFromOwner,
        status: e.status,
        reversalOfId: e.reversalOfId,
        disclosureShownToId: e.disclosureShownToId,
        disclosureShownAt: e.disclosureShownAt ? ts(e.disclosureShownAt) : null,
        disclosedAmount: e.disclosedAmountCents == null ? null : numeric(e.disclosedAmountCents),
        createdById: e.createdById,
        idempotencyKey: e.idempotencyKey,
      });
      return { event: toRecord(row)!, created: true };
    },
  };
}

// StrataVerze's own billing day (not UTC).
const today = () => platformToday();

interface CaptureCommon {
  schemeId: string;
  sourceType: string;
  sourceId: string;
  actorId?: string | null;
  payerProfileId?: string | null;
  /** The fee amount (incl. GST, cents) the actor saw and confirmed. */
  confirmedCents?: number | null;
  /**
   * Use when the disclosure happened at an earlier step (for example, an
   * adviser confirmed the accountant seat fee when sending the invitation).
   */
  disclosure?: Disclosure | null;
  date?: string;
}

/**
 * A charge already recorded for this source. Repeating an action (re-issuing
 * a notice, say) is never charged twice, so it needs no new confirmation.
 */
async function existingEvent(
  store: FeeEventStore,
  quote: { code: string; variant: string | null },
  input: { sourceType: string; sourceId: string },
) {
  const key = feeIdempotencyKey({ code: quote.code, variant: quote.variant, sourceType: input.sourceType, sourceId: input.sourceId });
  const event = await store.findByKey(key);
  return event ? ({ outcome: "DUPLICATE", event } as const) : null;
}

/** Whether a charge has already been recorded for this source. */
export async function hasFeeEvent(input: { code: string; variant?: string | null; sourceType: string; sourceId: string }) {
  const key = feeIdempotencyKey(input);
  return (await ormFeeEventStore().findByKey(key)) != null;
}

/**
 * Check, before any writes, that the user confirmed the usage fee this action
 * will attract. Throws FeeConfirmationError when they did not.
 */
export async function assertUsageFeeConfirmed(
  input: { code: UsageFeeCode; variant?: string | null; bandValue?: number; confirmedCents?: number | null; actorId?: string | null },
) {
  const quote = await quoteUsageFee(input);
  resolveDisclosure(quote, input.confirmedCents, input.actorId ?? "unknown");
}

function disclosureFor(input: CaptureCommon, quote: Parameters<typeof resolveDisclosure>[0]) {
  if (input.disclosure) return input.disclosure;
  return resolveDisclosure(quote, input.confirmedCents, input.actorId ?? "unknown");
}

/** The transaction fee for a payment, or null when no fee applies or capture is off. */
export async function quoteTransactionFee(
  input: { movement: MoneyMovement; paymentCents: number; date?: string },
  orm: Orm = db.orm,
) {
  if (!billingCaptureEnabled()) return null;
  return transactionFee({
    movement: input.movement,
    paymentCents: input.paymentCents,
    mode: transactionFeeMode(),
    priceBook: await loadPriceBook(orm),
    date: input.date ?? today(),
  });
}

/**
 * The fees never passed to an owner of a building in `state`: its pack's
 * NEVER_RECOVERABLE_FEE_VARIANTS (none when the pack has no list). With no
 * state, or a state with no active pack, the fee engine's default (the NSW
 * list) applies.
 */
export function neverRecoverableFor(state: string | null | undefined) {
  if (state == null) return undefined;
  const pack = rulePackFor(state);
  return pack ? (pack.rules.NEVER_RECOVERABLE_FEE_VARIANTS ?? []) : undefined;
}

/**
 * The usage fee for an action, or null when it is switched off or capture is
 * off. `state` is the building's, for which fees can be passed to its owners.
 */
export async function quoteUsageFee(
  input: { code: UsageFeeCode; variant?: string | null; bandValue?: number; quantity?: number; date?: string; state?: string | null },
  orm: Orm = db.orm,
) {
  if (!billingCaptureEnabled()) return null;
  return usageFee({
    code: input.code,
    variant: input.variant,
    bandValue: input.bandValue,
    quantity: input.quantity,
    neverRecoverableFromOwner: neverRecoverableFor(input.state),
    priceBook: await loadPriceBook(orm),
    date: input.date ?? today(),
  });
}

/** Disclosure view of a usage fee for a page to pass to its form. */
export async function previewUsageFee(
  input: Parameters<typeof quoteUsageFee>[0],
  wording?: FeeWording,
): Promise<FeeView | null> {
  const quote = await quoteUsageFee(input);
  return quote ? toFeeView(quote, wording) : null;
}

/**
 * What a payment form needs to show the transaction fee as the amount is
 * typed: the transaction fee rows and the mode, and the building's words for
 * the disclosure where given (feeWordingFor). Null when capture is off.
 */
export async function transactionFeeTable(
  wording?: FeeWording,
): Promise<{ mode: TransactionFeeMode; priceBook: PriceBookEntry[]; wording?: FeeWording } | null> {
  if (!billingCaptureEnabled()) return null;
  const book = await loadPriceBook();
  return {
    mode: transactionFeeMode(),
    priceBook: book.filter((e) => e.code === "TXN_FEE" || e.code === "TXN_FEE_FLAT"),
    ...(wording ? { wording } : {}),
  };
}

/** Record the transaction service fee for a money movement (no-op for internal transfers). */
export async function captureTransactionFee(
  orm: Orm,
  input: CaptureCommon & { movement: MoneyMovement; paymentCents: number },
) {
  const quote = await quoteTransactionFee(input, orm);
  if (!quote) return null;
  const store = ormFeeEventStore(orm);
  const existing = await existingEvent(store, quote, input);
  if (existing) return existing;
  // The provider decides how the fee is settled (accrued today, Zai later).
  return platformFeeProvider().recordTransactionFee(store, {
    schemeId: input.schemeId,
    quote,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    payerProfileId: input.payerProfileId ?? null,
    actorId: input.actorId ?? null,
    disclosure: disclosureFor(input, quote),
  });
}

/** Record a usage fee (no-op when the fee is switched off in the price book). */
export async function captureUsageFee(
  orm: Orm,
  input: CaptureCommon & { code: UsageFeeCode; variant?: string | null; bandValue?: number; quantity?: number; state?: string | null },
) {
  const quote = await quoteUsageFee(input, orm);
  if (!quote) return null;
  const store = ormFeeEventStore(orm);
  const existing = await existingEvent(store, quote, input);
  if (existing) return existing;
  return recordFeeEvent(store, { ...input, quote, disclosure: disclosureFor(input, quote) });
}

/** Reverse the fee for a source (keeps the original, adds a REVERSED event). */
export async function reverseCapturedFee(
  orm: Orm,
  input: { code: string; variant?: string | null; sourceType: string; sourceId: string; actorId?: string | null },
) {
  return reverseFeeEvent(ormFeeEventStore(orm), input);
}


/**
 * Disclosure views for every debt recovery fee, keyed by price variant. Pass
 * the building (its state and fee wording) where it is at hand.
 */
export async function previewRecoveryFees(building?: { state: string; wording: FeeWording }): Promise<Record<string, FeeView | null>> {
  const variants = ["REMINDER", "FINAL_NOTICE", "REFERRAL", "PAYMENT_PLAN"];
  const views = await Promise.all(variants.map((variant) => previewUsageFee({ code: "RECOVERY_STEP", variant, state: building?.state }, building?.wording)));
  return Object.fromEntries(variants.map((v, i) => [v, views[i]]));
}
