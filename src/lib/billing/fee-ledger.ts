/**
 * Fee event recording rules (no database code): one fee event per source,
 * replays are no-ops, and reversals add a REVERSED event that points at the
 * original instead of deleting anything. The store is injected so the rules
 * can be tested without a database.
 */
import { feeIdempotencyKey, reversalIdempotencyKey, type FeeQuote } from "./fee-engine";

export type FeeEventStatus = "ACCRUED" | "INVOICED" | "EXTRACTED" | "WAIVED" | "REVERSED";

export interface FeeEventRecord {
  id: string;
  /** Null for a charge to a contractor business. */
  schemeId: string | null;
  code: string;
  variant: string | null;
  description: string;
  sourceType: string;
  sourceId: string;
  quantity: number;
  amountExGstCents: number;
  gstCents: number;
  payerType: string;
  payerProfileId: string | null;
  recoverableFromOwner: boolean;
  status: FeeEventStatus;
  reversalOfId: string | null;
  disclosureShownToId: string | null;
  disclosureShownAt: string | null;
  disclosedAmountCents: number | null;
  createdById: string | null;
  idempotencyKey: string;
}

export type NewFeeEvent = Omit<FeeEventRecord, "id">;

export interface FeeEventStore {
  findByKey(key: string): Promise<FeeEventRecord | null>;
  /** Insert, or return the existing row if the key is already taken. */
  insert(event: NewFeeEvent): Promise<{ event: FeeEventRecord; created: boolean }>;
}

export interface Disclosure {
  shownToId: string;
  shownAt: string;
  /** The amount shown to the user, including GST, in cents. */
  amountCents: number;
}

export interface RecordFeeInput {
  schemeId: string;
  quote: FeeQuote;
  sourceType: string;
  sourceId: string;
  quantity?: number;
  payerProfileId?: string | null;
  actorId?: string | null;
  disclosure?: Disclosure | null;
}

export type RecordResult =
  | { outcome: "CREATED"; event: FeeEventRecord }
  | { outcome: "DUPLICATE"; event: FeeEventRecord };

/** Record the fee for a source action. Replaying the same action returns the existing event. */
export async function recordFeeEvent(store: FeeEventStore, input: RecordFeeInput): Promise<RecordResult> {
  const key = feeIdempotencyKey({
    code: input.quote.code,
    variant: input.quote.variant,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
  });
  const existing = await store.findByKey(key);
  if (existing) return { outcome: "DUPLICATE", event: existing };

  if (input.disclosure && input.disclosure.amountCents !== input.quote.totalCents) {
    throw new Error("The amount disclosed does not match the fee being charged.");
  }

  const { event, created } = await store.insert({
    schemeId: input.schemeId,
    code: input.quote.code,
    variant: input.quote.variant,
    description: input.quote.description,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    quantity: input.quantity ?? 1,
    amountExGstCents: input.quote.exGstCents,
    gstCents: input.quote.gstCents,
    payerType: input.quote.payerType,
    payerProfileId: input.payerProfileId ?? null,
    recoverableFromOwner: input.quote.recoverableFromOwner,
    status: "ACCRUED",
    reversalOfId: null,
    disclosureShownToId: input.disclosure?.shownToId ?? null,
    disclosureShownAt: input.disclosure?.shownAt ?? null,
    disclosedAmountCents: input.disclosure?.amountCents ?? null,
    createdById: input.actorId ?? null,
    idempotencyKey: key,
  });
  return created ? { outcome: "CREATED", event } : { outcome: "DUPLICATE", event };
}

export type ReverseResult =
  | { outcome: "REVERSED"; event: FeeEventRecord }
  | { outcome: "ALREADY_REVERSED"; event: FeeEventRecord }
  | { outcome: "NOTHING_TO_REVERSE" };

/**
 * Reverse the fee for a source action (for example a cancelled claim). The
 * original event is kept; a REVERSED event with negative amounts offsets it.
 */
export async function reverseFeeEvent(
  store: FeeEventStore,
  input: { code: string; variant?: string | null; sourceType: string; sourceId: string; actorId?: string | null },
): Promise<ReverseResult> {
  const key = feeIdempotencyKey(input);
  const original = await store.findByKey(key);
  if (!original) return { outcome: "NOTHING_TO_REVERSE" };

  const reversalKey = reversalIdempotencyKey(key);
  const existing = await store.findByKey(reversalKey);
  if (existing) return { outcome: "ALREADY_REVERSED", event: existing };

  const { event, created } = await store.insert({
    ...original,
    description: `Reversal: ${original.description}`,
    amountExGstCents: -original.amountExGstCents,
    gstCents: -original.gstCents,
    status: "REVERSED",
    reversalOfId: original.id,
    disclosureShownToId: null,
    disclosureShownAt: null,
    disclosedAmountCents: null,
    createdById: input.actorId ?? null,
    idempotencyKey: reversalKey,
  });
  return created ? { outcome: "REVERSED", event } : { outcome: "ALREADY_REVERSED", event };
}

/** An in-memory store, for tests and previews. */
export function memoryFeeEventStore(): FeeEventStore & { rows: FeeEventRecord[] } {
  const rows: FeeEventRecord[] = [];
  let n = 0;
  return {
    rows,
    async findByKey(key) {
      return rows.find((r) => r.idempotencyKey === key) ?? null;
    },
    async insert(event) {
      const existing = rows.find((r) => r.idempotencyKey === event.idempotencyKey);
      if (existing) return { event: existing, created: false };
      const row = { ...event, id: `fee-${++n}` };
      rows.push(row);
      return { event: row, created: true };
    },
  };
}
