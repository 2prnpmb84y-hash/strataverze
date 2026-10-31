/**
 * Storing and processing Zai webhooks (server side). Called only by the
 * webhook route once the switch is on and the signature has verified; every
 * entry point checks the switch again, so nothing here runs while it is off.
 *
 * Storing is idempotent: one zai_webhook_events row for each body received
 * (the SHA-256 of the raw bytes, unique). The copy stored has the payer's
 * name and bank details removed (bodyToStore, review M6). A repeated delivery
 * finds the row and is processed again only if it did not finish (RECEIVED
 * or FAILED), so a delivery Zai retries after a failure is picked up, and a
 * finished one is never applied twice.
 *
 * Processing is order safe. Zai does not guarantee the order of delivery
 * (webhooks guide, read 31 Oct 2026), so an object's row is written only if
 * the payload's updated_at is newer than the one applied (a conditional
 * update), and an older payload is marked STALE and discarded, as the best
 * practices page says.
 *
 * A payin is receipted once at most, and a receipted payin stays receipted
 * (review H2). A row is receipted when it has a journal or is RECEIPTED or
 * REVERSAL_REVIEW. Its next status is decided with the row locked
 * (forNoKeyUpdate) in a transaction, so it cannot be receipted between the
 * read and the write; a receipted row only ever moves between RECEIPTED and
 * REVERSAL_REVIEW (another state, or another amount, later), keeping its lot
 * and journal; and every write of a non-receipted status also requires
 * journal_entry_id IS NULL. The database checks the same (migration 20261128,
 * zai_transactions_journal_status_check). Nothing is reversed automatically:
 * REVERSAL_REVIEW is for a person, and stays until a person clears it.
 *
 * This stage processes payins (transactions objects that are deposits to a
 * wallet). Every other object type is stored and marked IGNORED, for the
 * later PRs in the design (users for KYB, items and disbursements for
 * payouts, batch transactions for BPAY settlement).
 */
import type { Numeric, TimestampString } from "@prisma/orm-postgres/target/codec-types";
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import { fromCents, toCents } from "@/lib/billing/money";
import { dayIn } from "@/lib/jurisdiction/time-zone";
import { requireZaiConfig } from "./config";
import { allocatePayment, matchPayinToLot, openNotices, type RegisteredReference } from "./payment-mapping";
import { bodyToStore, isSuccessful, isWalletPayin, parseZaiWebhook, readZaiTransaction, webhookDedupeKey, type ParsedZaiWebhook } from "./webhook-payload";

type Orm = typeof db.orm;

const ts = (d: Date) => d.toISOString() as unknown as TimestampString<3>;
const money = (cents: number) => fromCents(cents).toFixed(2) as unknown as Numeric<14, 2>;
const isUniqueViolation = (err: unknown) => !!err && typeof err === "object" && (err as { code?: unknown }).code === "23505";
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The statuses of a receipted payin. A row in one of them, or with a journal, is receipted. */
export const RECEIPTED_STATUSES = ["RECEIPTED", "REVERSAL_REVIEW"] as const;

/** Whether a zai_transactions row is receipted: it has a journal, or a receipted status. */
export function isReceiptedRow(row: { journalEntryId?: unknown; matchStatus?: unknown }): boolean {
  return row.journalEntryId != null || (RECEIPTED_STATUSES as readonly string[]).includes(String(row.matchStatus));
}

// ─── Storing ────────────────────────────────────────────────────────────────

export interface StoredEvent {
  id: string;
  duplicate: boolean;
  status: string;
}

/**
 * Store a verified webhook once: keyed by the SHA-256 of the raw body as
 * received, stored without the payer's details. A repeat of the same body
 * returns the row already stored.
 */
export async function storeWebhookEvent(orm: Orm, input: { rawBody: string; parsed: ParsedZaiWebhook; signedAt: Date }): Promise<StoredEvent> {
  requireZaiConfig();
  const dedupeKey = webhookDedupeKey(input.rawBody);
  const find = () => orm.public.ZaiWebhookEvent.where((e) => e.dedupeKey.eq(dedupeKey)).first();
  const existing = await find();
  if (existing) return { id: String(existing.id), duplicate: true, status: String(existing.status) };
  const p = input.parsed;
  try {
    const row = await orm.public.ZaiWebhookEvent.create({
      dedupeKey,
      objectType: p.kind === "OBJECT" || p.kind === "KNOWN_IGNORED" ? p.objectType : p.kind === "TEST" ? "test" : "unrecognised",
      objectId: p.kind === "OBJECT" ? p.objectId : null,
      objectUpdatedAt: p.kind === "OBJECT" && p.updatedAt ? ts(p.updatedAt) : null,
      signedAt: ts(input.signedAt),
      storedBody: bodyToStore(input.rawBody),
      status: p.kind === "OBJECT" ? "RECEIVED" : "IGNORED",
      error: p.kind === "UNRECOGNISED" || p.kind === "KNOWN_IGNORED" ? clip(p.reason, 500) : null,
    });
    return { id: String(row.id), duplicate: false, status: String(row.status) };
  } catch (err) {
    // The same body stored at the same moment by another delivery.
    if (!isUniqueViolation(err)) throw err;
    const again = await find();
    if (!again) throw err;
    return { id: String(again.id), duplicate: true, status: String(again.status) };
  }
}

// ─── Processing ─────────────────────────────────────────────────────────────

export interface ReceiptRequest {
  zaiTransactionRowId: string;
  schemeId: string;
  receipts: Array<{ levyNoticeId: string; amountCents: number }>;
  paymentDate: string;
  actorId: string;
  reference: string;
  /** The account the receipt debits, as set explicitly (ZAI_RECEIPT_DEBIT_ACCOUNT). */
  debitFrom: "BANK";
}

export interface ProcessorDeps {
  orm: Orm;
  /** Run `fn` in a database transaction (db.transaction). */
  transaction: <T>(fn: (tx: { orm: Orm }) => Promise<T>) => Promise<T>;
  /** The lot's notices as the database holds them (any status; openNotices picks the open ones). */
  loadNotices: (schemeId: string, lotId: string) => Promise<Parameters<typeof openNotices>[0]>;
  /** The building's time zone, for the payment date. */
  timeZoneOf: (schemeId: string) => Promise<string>;
  /**
   * Write the receipt and mark the Zai row RECEIPTED with its journal, in one
   * transaction, refusing if the row is already receipted. See
   * receiptInLedger (./receipt-in-ledger.ts).
   */
  receipt: (request: ReceiptRequest) => Promise<{ journalEntryId: string }>;
  /**
   * The profile automatic receipts are recorded by (ZAI_RECEIPT_ACTOR_ID).
   * Without one nothing is receipted automatically: matched payments wait in
   * NEEDS_REVIEW for a person.
   */
  receiptActorId: string | null;
  /**
   * The account automatic receipts debit (ZAI_RECEIPT_DEBIT_ACCOUNT, no
   * default). Null while decision D3 is open: nothing is receipted
   * automatically (review M5).
   */
  receiptDebitFrom: "BANK" | null;
}

export type ProcessOutcome = "PROCESSED" | "STALE" | "IGNORED" | "FAILED" | "ALREADY_DONE";

const FINISHED = new Set(["PROCESSED", "STALE", "IGNORED"]);

/** Process one stored event. Never throws for a problem with the payment: it is recorded on the rows. */
export async function processWebhookEvent(eventId: string, deps: ProcessorDeps): Promise<ProcessOutcome> {
  requireZaiConfig();
  const { orm } = deps;
  const event = await orm.public.ZaiWebhookEvent.where((e) => e.id.eq(eventId)).first();
  if (!event) throw new Error("Zai webhook event not found.");
  if (FINISHED.has(String(event.status))) return "ALREADY_DONE";
  const mark = async (status: "PROCESSED" | "STALE" | "IGNORED" | "FAILED", error: string | null = null) => {
    await orm.public.ZaiWebhookEvent.where((e) => e.id.eq(eventId)).update({ status, error: error ? clip(error, 500) : null, processedAt: ts(new Date()) });
    return status;
  };
  try {
    const parsed = parseZaiWebhook(String(event.storedBody));
    if (parsed.kind !== "OBJECT") return mark("IGNORED", parsed.kind === "TEST" ? "test payload" : parsed.reason);
    if (parsed.objectType !== "transactions") return mark("IGNORED", `${parsed.objectType} are not processed at this stage`);
    const t = readZaiTransaction(parsed.object);
    if (!t) return mark("IGNORED", "the transaction does not have the documented fields");
    if (!isWalletPayin(t)) return mark("IGNORED", `not a payin to a wallet (${t.type}, ${t.typeMethod})`);
    return await applyPayin(t, deps, mark);
  } catch (err) {
    // Only what may pass on a retry (a database error, a race) ends here; see applyPayin.
    await mark("FAILED", err instanceof Error ? err.message : "failed");
    return "FAILED";
  }
}

type Payin = NonNullable<ReturnType<typeof readZaiTransaction>>;
type Mark = (status: "PROCESSED" | "STALE" | "IGNORED" | "FAILED", error?: string | null) => Promise<ProcessOutcome>;
type InStatus = "UNMATCHED" | "NEEDS_REVIEW" | "RECEIPTED" | "REVERSAL_REVIEW";

/** What a payin not yet receipted should become, from what the database holds now (read without locks). */
interface Assessment {
  schemeId: string | null;
  lotId: string | null;
  referenceValue: string | null;
  matchStatus: "UNMATCHED" | "NEEDS_REVIEW";
  matchReason: string;
  receipts: Array<{ levyNoticeId: string; amountCents: number }> | null;
}

async function assess(t: Payin, deps: ProcessorDeps): Promise<Assessment> {
  const { orm } = deps;
  const wallet = await orm.public.ZaiWalletAccount.where((w) => w.zaiAccountId.eq(t.accountId)).first();
  const schemeId = wallet ? String(wallet.schemeId) : null;
  const base = { schemeId, lotId: null, referenceValue: t.payId, receipts: null };
  if (!schemeId) return { ...base, matchStatus: "UNMATCHED", matchReason: "The wallet is not a building's Zai wallet." };
  // Review L7: never receipt into a wallet StrataVerze has marked inactive.
  if (wallet && wallet.active === false) return { ...base, matchStatus: "NEEDS_REVIEW", matchReason: "The wallet is marked inactive." };
  if (t.currency !== "AUD") return { ...base, matchStatus: "NEEDS_REVIEW", matchReason: `The payment is in ${t.currency}.` };
  // Review L6: a payload that can never be receipted goes to a person, not FAILED on every retry.
  if (t.amountCents <= 0) return { ...base, matchStatus: "NEEDS_REVIEW", matchReason: "The payment's amount is zero." };
  const refs = await orm.public.ZaiPaymentReference.where((r) => r.schemeId.eq(schemeId)).limit(5000).all();
  const match = matchPayinToLot(
    t,
    refs.map((r) => ({ lotId: String(r.lotId), method: r.method as RegisteredReference["method"], value: String(r.value), zaiWalletAccountId: String(r.zaiWalletAccountId), status: String(r.status) })),
  );
  if (!match.matched) return { ...base, referenceValue: match.referenceValue, matchStatus: "UNMATCHED", matchReason: match.reason };
  const matched = { ...base, lotId: match.lotId, referenceValue: match.referenceValue };
  if (!isSuccessful(t)) return { ...matched, matchStatus: "NEEDS_REVIEW", matchReason: `Not settled yet (${t.state}).` };
  let allocation;
  try {
    allocation = allocatePayment(openNotices(await deps.loadNotices(schemeId, match.lotId)), t.amountCents);
  } catch (err) {
    // A notice whose amounts cannot be read: the same on every retry, so a person looks at it.
    return { ...matched, matchStatus: "NEEDS_REVIEW", matchReason: err instanceof Error ? err.message : "The lot's notices could not be read." };
  }
  if (allocation.kind === "OVERPAID") return { ...matched, matchStatus: "NEEDS_REVIEW", matchReason: `Overpaid by $${fromCents(allocation.excessCents).toFixed(2)}: confirm the owner's credit.` };
  if (allocation.kind === "NO_OPEN_NOTICES") return { ...matched, matchStatus: "NEEDS_REVIEW", matchReason: "The lot has no notice owing: confirm the owner's credit." };
  if (!deps.receiptActorId) return { ...matched, matchStatus: "NEEDS_REVIEW", matchReason: "Ready to receipt (automatic receipts are off)." };
  if (!deps.receiptDebitFrom) return { ...matched, matchStatus: "NEEDS_REVIEW", matchReason: "Ready to receipt: the account a Zai receipt debits is not decided (D3)." };
  return { ...matched, matchStatus: "NEEDS_REVIEW", matchReason: "Being receipted (if it stays here, the receipt did not finish: receipt it by hand).", receipts: allocation.receipts };
}

/** The next status of a receipted row: receipted stays receipted; another state or amount goes to a person (review H2, L8). */
function receiptedNext(row: { matchStatus: unknown; amount: unknown }, t: Payin): { matchStatus: InStatus; matchReason: string | null } {
  if (row.matchStatus === "REVERSAL_REVIEW") return { matchStatus: "REVERSAL_REVIEW", matchReason: `Under reversal review; Zai now shows the payment as ${t.state}.` };
  if (!isSuccessful(t)) return { matchStatus: "REVERSAL_REVIEW", matchReason: `Receipted, and Zai now shows the payment as ${t.state}.` };
  const receiptedCents = toCents(String(row.amount ?? 0));
  if (receiptedCents !== t.amountCents) {
    return { matchStatus: "REVERSAL_REVIEW", matchReason: `Receipted for $${fromCents(receiptedCents).toFixed(2)}, and Zai now shows $${fromCents(t.amountCents).toFixed(2)}.` };
  }
  return { matchStatus: "RECEIPTED", matchReason: null };
}

async function applyPayin(t: Payin, deps: ProcessorDeps, mark: Mark): Promise<ProcessOutcome> {
  // Read what the payin would become if it is not receipted (no locks held while reading).
  const assessment = await assess(t, deps);

  // Decide and write with the row locked, so it cannot be receipted between the read and the write.
  const written = await deps.transaction(async (tx) => {
    const existing = await tx.orm.public.ZaiTransaction.where((x) => and(x.zaiObjectType.eq("transactions"), x.zaiObjectId.eq(t.id))).forNoKeyUpdate().first();
    const common = { zaiState: t.state, zaiUpdatedAt: ts(t.updatedAt), zaiType: t.type, zaiTypeMethod: t.typeMethod, zaiAccountId: t.accountId, currency: t.currency, updatedAt: ts(new Date()) };
    if (existing && isReceiptedRow(existing)) {
      // Receipted: keep the scheme, lot, reference, amount receipted and journal; only the status may move to review.
      const next = receiptedNext(existing, t);
      const n = await tx.orm.public.ZaiTransaction.where((x) => and(x.id.eq(existing.id), x.zaiUpdatedAt.lt(ts(t.updatedAt)))).updateAndCount({
        ...common,
        matchStatus: next.matchStatus,
        matchReason: next.matchReason ? clip(next.matchReason, 200) : null,
      });
      return n === 0 ? null : { rowId: String(existing.id), receipts: null };
    }
    const fields = {
      ...common,
      schemeId: assessment.schemeId,
      amount: money(t.amountCents),
      referenceValue: assessment.referenceValue ? clip(assessment.referenceValue, 200) : null,
      lotId: assessment.lotId,
      matchStatus: assessment.matchStatus,
      matchReason: clip(assessment.matchReason, 200),
    };
    if (existing) {
      // Newer, and never over a row with a journal or a receipted status.
      const n = await tx.orm.public.ZaiTransaction.where((x) => and(x.id.eq(existing.id), x.zaiUpdatedAt.lt(ts(t.updatedAt)), x.journalEntryId.isNull(), x.matchStatus.notIn([...RECEIPTED_STATUSES]))).updateAndCount(fields);
      return n === 0 ? null : { rowId: String(existing.id), receipts: assessment.receipts };
    }
    const row = await tx.orm.public.ZaiTransaction.create({ direction: "IN", zaiObjectType: "transactions", zaiObjectId: t.id, ...fields });
    return { rowId: String(row.id), receipts: assessment.receipts };
  }).catch((err: unknown) => {
    // Another delivery of this object was stored at the same moment: Zai's retry applies this one in order.
    if (isUniqueViolation(err)) return "RACE" as const;
    throw err;
  });
  if (written === "RACE") return mark("FAILED", "the transaction was being stored by another delivery; it is applied on Zai's retry");
  if (!written) return mark("STALE", "an update as new or newer is already applied");

  if (written.receipts && assessment.schemeId && deps.receiptActorId && deps.receiptDebitFrom) {
    try {
      const timeZone = await deps.timeZoneOf(assessment.schemeId);
      await deps.receipt({
        zaiTransactionRowId: written.rowId,
        schemeId: assessment.schemeId,
        receipts: written.receipts,
        paymentDate: dayIn(timeZone, t.createdAt),
        actorId: deps.receiptActorId,
        reference: clip(`Zai ${t.typeMethod} ${t.id}`, 200),
        debitFrom: deps.receiptDebitFrom,
      });
    } catch (err) {
      // Receipting refused (a period closed, a notice paid meanwhile, the chart not set up, already
      // receipted by another delivery): a person looks at it. Never over a receipted row.
      const reason = err instanceof Error ? err.message : "The receipt could not be written.";
      await deps.orm.public.ZaiTransaction.where((x) => and(x.id.eq(written.rowId), x.journalEntryId.isNull(), x.matchStatus.notIn([...RECEIPTED_STATUSES]))).updateAndCount({
        matchStatus: "NEEDS_REVIEW",
        matchReason: clip(reason, 200),
        updatedAt: ts(new Date()),
      });
    }
  }
  return mark("PROCESSED");
}
