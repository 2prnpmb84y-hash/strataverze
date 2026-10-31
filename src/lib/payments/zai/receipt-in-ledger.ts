/**
 * The processor's real dependencies: receipting a Zai payin with the
 * existing receipting code, unchanged (prepareLevyReceipt and
 * numberedTransaction, as bank reconciliation uses them), so a Zai receipt
 * posts the same payments, credits and journal as any other receipt, and
 * NSW, Queensland and the draft packs keep their own payment order.
 *
 * The receipt and the Zai row's RECEIPTED mark are one transaction: the row
 * is locked and checked first, so a payin is receipted once at most, and a
 * receipt that posts no journal (a building whose chart is not set up) is
 * rolled back and left for a person. Under the lock the row must also still
 * be the one the delivery assessed (its updated_at, Zai's state successful,
 * NEEDS_REVIEW, the lot and the amount), so a newer delivery that landed in
 * between is never receipted over (second review, MEDIUM-1).
 *
 * Not decided yet (design D3, D4). The account debited is never assumed:
 * it is the one ZAI_RECEIPT_DEBIT_ACCOUNT names (only BANK, the building's
 * administrative bank account, is accepted), and with it unset nothing is
 * receipted automatically (review M5). No StrataVerze fee is captured on a
 * Zai payin (captureFee false), since a payin to a wallet is not an Item and
 * the docs show no fee on it.
 */
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";
import { LevyReceiptError, prepareLevyReceipt } from "@/lib/finance/levy-receipts";
import { toCents } from "@/lib/billing/money";
import { numberedTransaction } from "@/lib/queries/journal-numbering";
import { schemeTimeZone } from "@/lib/jurisdiction/scheme-time";
import { requireZaiConfig } from "./config";
import { isReceiptedRow, type ProcessorDeps, type ReceiptRequest } from "./webhook-processor";

/** The row changed after it was assessed: a newer delivery landed, so this receipt is stale (second review, MEDIUM-1). */
export class ZaiStaleReceiptError extends Error {
  constructor(what: string) {
    super(`This Zai payment changed after it was assessed (${what}), so it was not receipted.`);
    this.name = "ZaiStaleReceiptError";
  }
}

const sameInstant = (stored: unknown, expected: string) => {
  const a = new Date(stored instanceof Date ? stored.getTime() : String(stored ?? "")).getTime();
  return Number.isFinite(a) && a === new Date(expected).getTime();
};

/** Why the locked row is not the one the delivery assessed, or null (second review, MEDIUM-1). */
function staleness(row: Record<string, unknown>, request: ReceiptRequest): string | null {
  if (row.direction !== "IN") return "not a payment received";
  if (row.matchStatus !== "NEEDS_REVIEW") return `now ${String(row.matchStatus)}`;
  if (row.zaiState !== "successful") return `Zai now shows ${String(row.zaiState)}`;
  if (!sameInstant(row.zaiUpdatedAt, request.expectedZaiUpdatedAt)) return "a newer update from Zai";
  if (String(row.lotId ?? "") !== request.lotId) return "another lot";
  if (toCents(String(row.amount ?? "")) !== request.amountCents) return "another amount";
  return null;
}

export class ZaiAlreadyReceiptedError extends Error {
  constructor() {
    super("This Zai payment is already receipted.");
    this.name = "ZaiAlreadyReceiptedError";
  }
}

export async function receiptInLedger(request: ReceiptRequest): Promise<{ journalEntryId: string }> {
  requireZaiConfig();
  if (request.debitFrom !== "BANK") throw new LevyReceiptError("The account a Zai receipt debits is not set (ZAI_RECEIPT_DEBIT_ACCOUNT, decision D3).");
  if (request.receipts.reduce((sum, r) => sum + r.amountCents, 0) !== request.amountCents) throw new LevyReceiptError("The receipts do not add up to the Zai payment.");
  const prepared = await prepareLevyReceipt({
    schemeId: request.schemeId,
    receipts: request.receipts,
    paymentDate: request.paymentDate,
    actorId: request.actorId,
    reference: request.reference,
    captureFee: false,
    debitFrom: request.debitFrom,
  });
  const out = await numberedTransaction(request.schemeId, async (tx) => {
    const row = await tx.orm.public.ZaiTransaction.where((r) => r.id.eq(request.zaiTransactionRowId)).forNoKeyUpdate().first();
    if (!row || isReceiptedRow(row)) throw new ZaiAlreadyReceiptedError();
    // Still the row this delivery assessed: a newer delivery in between makes the receipt stale.
    const stale = staleness(row as unknown as Record<string, unknown>, request);
    if (stale) throw new ZaiStaleReceiptError(stale);
    const result = await prepared.run(tx);
    if (!result.journalEntryId) throw new LevyReceiptError("No receipt journal could be posted: the building's chart of accounts is not set up.");
    await tx.orm.public.ZaiTransaction.where((r) => r.id.eq(request.zaiTransactionRowId)).update({
      matchStatus: "RECEIPTED",
      matchReason: null,
      journalEntryId: result.journalEntryId,
      updatedAt: new Date().toISOString() as unknown as TimestampString<3>,
    });
    return result;
  });
  await prepared.log(out);
  return { journalEntryId: out.journalEntryId! };
}

/** The lot's notices, as receipting reads them. */
async function loadNotices(schemeId: string, lotId: string) {
  return db.orm.public.LevyNotice.where((n) => and(n.schemeId.eq(schemeId), n.lotId.eq(lotId))).limit(500).all();
}

/** The processor's dependencies, for the webhook route. Refuses while switched off. */
export function ledgerProcessorDeps(): ProcessorDeps {
  const config = requireZaiConfig();
  return {
    orm: db.orm,
    transaction: (fn) => db.transaction((tx) => fn(tx as unknown as { orm: typeof db.orm })),
    loadNotices,
    timeZoneOf: (schemeId) => schemeTimeZone(schemeId),
    receipt: receiptInLedger,
    receiptActorId: config.receiptActorId,
    receiptDebitFrom: config.receiptDebitFrom,
  };
}
