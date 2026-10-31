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
 * rolled back and left for a person.
 *
 * Not decided yet (design D3, D4): the account debited is the building's
 * administrative bank account, as for any receipt, until the ledger has an
 * account for the Zai wallet; and no StrataVerze fee is captured on a Zai
 * payin (captureFee false), since a payin to a wallet is not an Item and the
 * docs show no fee on it.
 */
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";
import { LevyReceiptError, prepareLevyReceipt } from "@/lib/finance/levy-receipts";
import { numberedTransaction } from "@/lib/queries/journal-numbering";
import { schemeTimeZone } from "@/lib/jurisdiction/scheme-time";
import { requireZaiConfig } from "./config";
import type { ProcessorDeps, ReceiptRequest } from "./webhook-processor";

export class ZaiAlreadyReceiptedError extends Error {
  constructor() {
    super("This Zai payment is already receipted.");
    this.name = "ZaiAlreadyReceiptedError";
  }
}

export async function receiptInLedger(request: ReceiptRequest): Promise<{ journalEntryId: string }> {
  requireZaiConfig();
  const prepared = await prepareLevyReceipt({
    schemeId: request.schemeId,
    receipts: request.receipts,
    paymentDate: request.paymentDate,
    actorId: request.actorId,
    reference: request.reference,
    captureFee: false,
    debitFrom: "BANK",
  });
  const out = await numberedTransaction(request.schemeId, async (tx) => {
    const row = await tx.orm.public.ZaiTransaction.where((r) => r.id.eq(request.zaiTransactionRowId)).forNoKeyUpdate().first();
    if (!row || row.matchStatus === "RECEIPTED" || row.journalEntryId) throw new ZaiAlreadyReceiptedError();
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
    loadNotices,
    timeZoneOf: (schemeId) => schemeTimeZone(schemeId),
    receipt: receiptInLedger,
    receiptActorId: config.receiptActorId,
  };
}
