/**
 * Fee capture from application actions (server side). Pass the transaction's
 * `orm` so the fee event is written in the same transaction as the action.
 *
 * Capture is switched off unless PLATFORM_BILLING_CAPTURE=on, so no charge is
 * recorded before the disclosure screens exist (hard rule 6).
 * PLATFORM_TXN_FEE_MODE=FLAT selects the flat pilot transaction fee.
 */
import { db } from "@/prisma/db";
import type { Numeric, TimestampString } from "@prisma/orm-postgres/target/codec-types";
import { toCents, fromCents } from "./money";
import type { PayerType, PriceBookEntry, PriceUnit } from "./price-book";
import {
  transactionFee,
  usageFee,
  type MoneyMovement,
  type TransactionFeeMode,
  type UsageFeeCode,
} from "./fee-engine";
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

export function billingCaptureEnabled(): boolean {
  return process.env.PLATFORM_BILLING_CAPTURE === "on";
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

const today = () => new Date().toISOString().slice(0, 10);

interface CaptureCommon {
  schemeId: string;
  sourceType: string;
  sourceId: string;
  actorId?: string | null;
  payerProfileId?: string | null;
  disclosure?: Disclosure | null;
  date?: string;
}

/** Record the transaction service fee for a money movement (no-op for internal transfers). */
export async function captureTransactionFee(
  orm: Orm,
  input: CaptureCommon & { movement: MoneyMovement; paymentCents: number },
) {
  if (!billingCaptureEnabled()) return null;
  const date = input.date ?? today();
  const quote = transactionFee({
    movement: input.movement,
    paymentCents: input.paymentCents,
    mode: transactionFeeMode(),
    priceBook: await loadPriceBook(orm),
    date,
  });
  if (!quote) return null;
  return recordFeeEvent(ormFeeEventStore(orm), { ...input, quote });
}

/** Record a usage fee (no-op when the fee is switched off in the price book). */
export async function captureUsageFee(
  orm: Orm,
  input: CaptureCommon & { code: UsageFeeCode; variant?: string | null; bandValue?: number; quantity?: number },
) {
  if (!billingCaptureEnabled()) return null;
  const quote = usageFee({
    code: input.code,
    variant: input.variant,
    bandValue: input.bandValue,
    quantity: input.quantity,
    priceBook: await loadPriceBook(orm),
    date: input.date ?? today(),
  });
  if (!quote) return null;
  return recordFeeEvent(ormFeeEventStore(orm), { ...input, quote });
}

/** Reverse the fee for a source (keeps the original, adds a REVERSED event). */
export async function reverseCapturedFee(
  orm: Orm,
  input: { code: string; variant?: string | null; sourceType: string; sourceId: string; actorId?: string | null },
) {
  return reverseFeeEvent(ormFeeEventStore(orm), input);
}

