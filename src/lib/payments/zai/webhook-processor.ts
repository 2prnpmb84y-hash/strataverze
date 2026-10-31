/**
 * Storing and processing Zai webhooks (server side). Called only by the
 * webhook route once the switch is on and the signature has verified; every
 * entry point checks the switch again, so nothing here runs while it is off.
 *
 * Storing is idempotent: one zai_webhook_events row for each raw body (its
 * SHA-256, unique). A repeated delivery finds the row and is processed again
 * only if it did not finish (RECEIVED or FAILED), so a delivery Zai retries
 * after a failure is picked up, and a finished one is never applied twice.
 *
 * Processing is order safe. Zai does not guarantee the order of delivery
 * (webhooks guide, read 31 Oct 2026), so an object's row is written only if
 * the payload's updated_at is newer than the one applied (a conditional
 * update in the database, so two deliveries at once cannot both win); an
 * older payload is marked STALE and discarded, as the best practices page
 * says. A payin is receipted once at most: under a row lock, in the same
 * transaction as the receipt, and never again once RECEIPTED. A receipted
 * payin that later shows another state goes to REVERSAL_REVIEW for a person;
 * nothing is reversed automatically.
 *
 * This stage processes payins (transactions objects that are deposits to a
 * wallet). Every other object type is stored and marked IGNORED, for the
 * later PRs in the design (users for KYB, items and disbursements for
 * payouts, batch transactions for BPAY settlement).
 */
import type { Numeric, TimestampString } from "@prisma/orm-postgres/target/codec-types";
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "@/prisma/db";
import { fromCents } from "@/lib/billing/money";
import { dayIn } from "@/lib/jurisdiction/time-zone";
import { requireZaiConfig } from "./config";
import { allocatePayment, matchPayinToLot, openNotices, type OpenNotice, type RegisteredReference } from "./payment-mapping";
import { isSuccessful, isWalletPayin, parseZaiWebhook, readZaiTransaction, webhookDedupeKey, type ParsedZaiWebhook } from "./webhook-payload";

type Orm = typeof db.orm;

const ts = (d: Date) => d.toISOString() as unknown as TimestampString<3>;
const money = (cents: number) => fromCents(cents).toFixed(2) as unknown as Numeric<14, 2>;
const isUniqueViolation = (err: unknown) => !!err && typeof err === "object" && (err as { code?: unknown }).code === "23505";
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// ─── Storing ────────────────────────────────────────────────────────────────

export interface StoredEvent {
  id: string;
  duplicate: boolean;
  status: string;
}

/** Store a verified webhook once. A repeat of the same body returns the row already stored. */
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
      objectType: p.kind === "OBJECT" ? p.objectType : p.kind === "TEST" ? "test" : "unrecognised",
      objectId: p.kind === "OBJECT" ? p.objectId : null,
      objectUpdatedAt: p.kind === "OBJECT" && p.updatedAt ? ts(p.updatedAt) : null,
      signedAt: ts(input.signedAt),
      rawBody: input.rawBody,
      status: p.kind === "OBJECT" ? "RECEIVED" : "IGNORED",
      error: p.kind === "UNRECOGNISED" ? clip(p.reason, 500) : null,
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
}

export interface ProcessorDeps {
  orm: Orm;
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
    const parsed = parseZaiWebhook(String(event.rawBody));
    if (parsed.kind !== "OBJECT") return mark("IGNORED", parsed.kind === "TEST" ? "test payload" : parsed.reason);
    if (parsed.objectType !== "transactions") return mark("IGNORED", `${parsed.objectType} are not processed at this stage`);
    const t = readZaiTransaction(parsed.object);
    if (!t) return mark("IGNORED", "the transaction does not have the documented fields");
    if (!isWalletPayin(t)) return mark("IGNORED", `not a payin to a wallet (${t.type}, ${t.typeMethod})`);
    return await applyPayin(t, deps, mark);
  } catch (err) {
    await mark("FAILED", err instanceof Error ? err.message : "failed");
    return "FAILED";
  }
}

type Payin = NonNullable<ReturnType<typeof readZaiTransaction>>;
type Mark = (status: "PROCESSED" | "STALE" | "IGNORED" | "FAILED", error?: string | null) => Promise<ProcessOutcome>;

async function applyPayin(t: Payin, deps: ProcessorDeps, mark: Mark): Promise<ProcessOutcome> {
  const { orm } = deps;
  const wallet = await orm.public.ZaiWalletAccount.where((w) => w.zaiAccountId.eq(t.accountId)).first();
  const schemeId = wallet ? String(wallet.schemeId) : null;
  const existingOf = () => orm.public.ZaiTransaction.where((x) => and(x.zaiObjectType.eq("transactions"), x.zaiObjectId.eq(t.id))).first();
  const existing = await existingOf();
  const receipted = existing?.matchStatus === "RECEIPTED";

  // What the row says now, before any receipt.
  let matchStatus: "UNMATCHED" | "NEEDS_REVIEW" | "RECEIPTED" | "REVERSAL_REVIEW";
  let matchReason: string | null = null;
  let lotId: string | null = existing?.lotId ? String(existing.lotId) : null;
  let referenceValue: string | null = t.payId;
  let toReceipt: { receipts: Array<{ levyNoticeId: string; amountCents: number }> } | null = null;

  if (receipted) {
    // Receipted once; never again. Another state later is for a person to look at.
    matchStatus = isSuccessful(t) ? "RECEIPTED" : "REVERSAL_REVIEW";
    if (!isSuccessful(t)) matchReason = `Receipted, and Zai now shows the payment as ${t.state}.`;
  } else if (!schemeId) {
    matchStatus = "UNMATCHED";
    matchReason = "The wallet is not a building's Zai wallet.";
  } else if (t.currency !== "AUD") {
    matchStatus = "NEEDS_REVIEW";
    matchReason = `The payment is in ${t.currency}.`;
  } else {
    const refs = await orm.public.ZaiPaymentReference.where((r) => r.schemeId.eq(schemeId)).limit(5000).all();
    const match = matchPayinToLot(t, refs.map((r) => ({ lotId: String(r.lotId), method: r.method as RegisteredReference["method"], value: String(r.value), zaiWalletAccountId: String(r.zaiWalletAccountId), status: String(r.status) })));
    referenceValue = match.referenceValue;
    if (!match.matched) {
      matchStatus = "UNMATCHED";
      matchReason = match.reason;
      lotId = null;
    } else {
      lotId = match.lotId;
      if (!isSuccessful(t)) {
        matchStatus = "NEEDS_REVIEW";
        matchReason = `Not settled yet (${t.state}).`;
      } else {
        const notices: OpenNotice[] = openNotices(await deps.loadNotices(schemeId, lotId));
        const allocation = allocatePayment(notices, t.amountCents);
        matchStatus = "NEEDS_REVIEW";
        if (allocation.kind === "OVERPAID") matchReason = `Overpaid by $${fromCents(allocation.excessCents).toFixed(2)}: confirm the owner's credit.`;
        else if (allocation.kind === "NO_OPEN_NOTICES") matchReason = "The lot has no notice owing: confirm the owner's credit.";
        else if (!deps.receiptActorId) matchReason = "Ready to receipt (automatic receipts are off).";
        else toReceipt = { receipts: allocation.receipts };
      }
    }
  }

  const fields = {
    schemeId,
    zaiState: t.state,
    zaiUpdatedAt: ts(t.updatedAt),
    zaiType: t.type,
    zaiTypeMethod: t.typeMethod,
    zaiAccountId: t.accountId,
    amount: money(t.amountCents),
    currency: t.currency,
    referenceValue: referenceValue ? clip(referenceValue, 200) : null,
    lotId: receipted ? (existing?.lotId ?? null) : lotId,
    matchStatus,
    matchReason: matchReason ? clip(matchReason, 200) : null,
    updatedAt: ts(new Date()),
  };

  // Written only if newer than what is applied: an older payload changes nothing.
  let rowId: string;
  if (existing) {
    const n = await orm.public.ZaiTransaction.where((x) => and(x.id.eq(existing.id), x.zaiUpdatedAt.lt(ts(t.updatedAt)))).updateAndCount(fields);
    if (n === 0) return mark("STALE", "an update as new or newer is already applied");
    rowId = String(existing.id);
  } else {
    try {
      const row = await orm.public.ZaiTransaction.create({ direction: "IN", zaiObjectType: "transactions", zaiObjectId: t.id, ...fields });
      rowId = String(row.id);
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Another delivery of this object was stored at the same moment: let Zai's retry apply this one in order.
      return mark("FAILED", "the transaction was being stored by another delivery; it is applied on Zai's retry");
    }
  }

  if (toReceipt && schemeId && lotId && deps.receiptActorId) {
    try {
      const timeZone = await deps.timeZoneOf(schemeId);
      await deps.receipt({
        zaiTransactionRowId: rowId,
        schemeId,
        receipts: toReceipt.receipts,
        paymentDate: dayIn(timeZone, t.createdAt),
        actorId: deps.receiptActorId,
        reference: clip(`Zai ${t.typeMethod} ${t.id}`, 200),
      });
    } catch (err) {
      // Receipting refused (a period closed, a notice paid meanwhile, the chart not set up): a person looks at it.
      const reason = err instanceof Error ? err.message : "The receipt could not be written.";
      await orm.public.ZaiTransaction.where((x) => and(x.id.eq(rowId), x.matchStatus.neq("RECEIPTED"))).updateAndCount({ matchStatus: "NEEDS_REVIEW", matchReason: clip(reason, 200), updatedAt: ts(new Date()) });
    }
  }
  return mark("PROCESSED");
}
