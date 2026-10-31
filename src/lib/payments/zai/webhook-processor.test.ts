/**
 * Storing and processing Zai webhooks on the fake database: stored once,
 * applied in order (older payloads discarded), a payin receipted once at
 * most, the unmatched and review queues, and nothing at all while switched off.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));

const { sharedFake } = await import("@/test/fake-orm");
const { processWebhookEvent, storeWebhookEvent } = await import("./webhook-processor");
const { parseZaiWebhook } = await import("./webhook-payload");
const { ZaiDisabledError } = await import("./config");
const { TEST_ENV } = await import("./__fixtures__/test-env");
const { BPAY_PAYIN_EXAMPLE, DISBURSEMENT_EXAMPLE, NPP_PAYIN_EXAMPLE, WEBHOOK_TEST_EXAMPLE } = await import("./__fixtures__/zai-doc-examples");

type Deps = Parameters<typeof processWebhookEvent>[1];
const orm = sharedFake.db.orm as unknown as Deps["orm"];
const WALLET = NPP_PAYIN_EXAMPLE.transactions.account_id;
const ACTOR = "00000000-0000-4000-8000-000000000001";

const notices = [
  { id: "n1", schemeId: "s1", noticeNumber: "L-0001", lotId: "lot-7", fundId: "fund-admin", dueDate: "2026-04-01", status: "OVERDUE", amountDue: "60000.00", amountPaid: "0", interestCharged: "0" },
  { id: "n2", schemeId: "s1", noticeNumber: "L-0002", lotId: "lot-7", fundId: "fund-cw", dueDate: "2026-07-01", status: "ISSUED", amountDue: "50000.00", amountPaid: "0", interestCharged: "0" },
];

const receipt = vi.fn(async (r: Parameters<Deps["receipt"]>[0]) => {
  // As receiptInLedger does: the row is marked RECEIPTED with its journal in the receipt's transaction.
  await orm.public.ZaiTransaction.where((x) => x.id.eq(r.zaiTransactionRowId)).update({ matchStatus: "RECEIPTED", journalEntryId: "je-1", matchReason: null });
  return { journalEntryId: "je-1" };
});

const deps = (over: Partial<Deps> = {}): Deps => ({
  orm,
  loadNotices: async () => notices,
  timeZoneOf: async () => "Australia/Sydney",
  receipt,
  receiptActorId: ACTOR,
  ...over,
});

/** A delivery of `object` under `key`, with the given changes to the object. */
const body = (example: Record<string, Record<string, unknown>>, change: Record<string, unknown> = {}) => {
  const [key] = Object.keys(example);
  return JSON.stringify({ [key]: { ...example[key], ...change } });
};
const deliver = async (rawBody: string, d: Deps = deps()) => {
  const stored = await storeWebhookEvent(orm, { rawBody, parsed: parseZaiWebhook(rawBody), signedAt: new Date("2019-12-16T07:20:00Z") });
  return { stored, outcome: await processWebhookEvent(stored.id, d) };
};
const rows = (t: string) => sharedFake.tables[t] ?? [];

beforeEach(() => {
  for (const [k, v] of Object.entries(TEST_ENV)) vi.stubEnv(k, v);
  receipt.mockClear();
  sharedFake.reset({
    ZaiWalletAccount: [{ id: "w-row", schemeId: "s1", zaiUserRowId: "u-row", kind: "MAIN", fundId: null, zaiAccountId: WALLET, active: true }, { id: "w-bpay", schemeId: "s1", zaiUserRowId: "u-row", kind: "MAIN", fundId: null, zaiAccountId: BPAY_PAYIN_EXAMPLE.transactions.account_id, active: true }],
    ZaiPaymentReference: [{ id: "r1", schemeId: "s1", lotId: "lot-7", method: "PAYID", value: "lot7.payid@example.com", zaiWalletAccountId: WALLET, status: "active" }],
  });
  sharedFake.setUniqueKeys({ ZaiWebhookEvent: [["dedupeKey"]], ZaiTransaction: [["zaiObjectType", "zaiObjectId"]] });
});
afterEach(() => vi.unstubAllEnvs());

describe("storing", () => {
  it("stores a delivery once: a repeat, even at the same moment, is the same row", async () => {
    const raw = body(NPP_PAYIN_EXAMPLE);
    const parsed = parseZaiWebhook(raw);
    const signedAt = new Date();
    const [a, b] = await Promise.all([storeWebhookEvent(orm, { rawBody: raw, parsed, signedAt }), storeWebhookEvent(orm, { rawBody: raw, parsed, signedAt })]);
    const c = await storeWebhookEvent(orm, { rawBody: raw, parsed, signedAt });
    expect(rows("ZaiWebhookEvent")).toHaveLength(1);
    expect([a.duplicate, b.duplicate].sort()).toEqual([false, true]);
    expect(c).toEqual({ id: a.id, duplicate: true, status: "RECEIVED" });
    expect(rows("ZaiWebhookEvent")[0]).toMatchObject({ objectType: "transactions", objectId: NPP_PAYIN_EXAMPLE.transactions.id, rawBody: raw, status: "RECEIVED" });
  });

  it("stores the test payload and unrecognised bodies as IGNORED, with nothing processed", async () => {
    const { stored, outcome } = await deliver(JSON.stringify(WEBHOOK_TEST_EXAMPLE));
    expect(stored.status).toBe("IGNORED");
    expect(outcome).toBe("ALREADY_DONE");
    expect(rows("ZaiTransaction")).toHaveLength(0);
  });
});

describe("a payin matched to a lot", () => {
  it("is receipted once, oldest notice first, on the building's day it was paid", async () => {
    const { outcome } = await deliver(body(NPP_PAYIN_EXAMPLE, { amount: 70000 }));
    expect(outcome).toBe("PROCESSED");
    expect(receipt).toHaveBeenCalledTimes(1);
    expect(receipt.mock.calls[0][0]).toEqual({
      zaiTransactionRowId: rows("ZaiTransaction")[0].id,
      schemeId: "s1",
      receipts: [{ levyNoticeId: "n1", amountCents: 70000 }],
      paymentDate: "2019-12-16",
      actorId: ACTOR,
      reference: `Zai npp_payin ${NPP_PAYIN_EXAMPLE.transactions.id}`,
    });
    expect(rows("ZaiTransaction")[0]).toMatchObject({ direction: "IN", schemeId: "s1", lotId: "lot-7", matchStatus: "RECEIPTED", journalEntryId: "je-1", amount: "700.00", currency: "AUD", referenceValue: "lot7.payid@example.com", zaiState: "successful" });
  });

  it("is never receipted twice: a repeated delivery, or the same update in another body, changes nothing", async () => {
    const raw = body(NPP_PAYIN_EXAMPLE, { amount: 70000 });
    await deliver(raw);
    expect((await deliver(raw)).outcome).toBe("ALREADY_DONE");
    // The same updated_at in a body that differs (e.g. a field Zai added): stale.
    expect((await deliver(body(NPP_PAYIN_EXAMPLE, { amount: 70000, description: "again" }))).outcome).toBe("STALE");
    expect(receipt).toHaveBeenCalledTimes(1);
    expect(rows("ZaiTransaction")).toHaveLength(1);
  });

  it("waits for a person when overpaid, or when the lot owes nothing", async () => {
    await deliver(body(NPP_PAYIN_EXAMPLE, { amount: 12000000 }));
    expect(rows("ZaiTransaction")[0]).toMatchObject({ matchStatus: "NEEDS_REVIEW", matchReason: "Overpaid by $10000.00: confirm the owner's credit.", lotId: "lot-7" });
    await deliver(body(NPP_PAYIN_EXAMPLE, { id: "other-1", amount: 5000 }), deps({ loadNotices: async () => [] }));
    expect(rows("ZaiTransaction")[1]).toMatchObject({ matchStatus: "NEEDS_REVIEW", matchReason: "The lot has no notice owing: confirm the owner's credit." });
    expect(receipt).not.toHaveBeenCalled();
  });

  it("waits for a person when automatic receipts are off (no ZAI_RECEIPT_ACTOR_ID)", async () => {
    await deliver(body(NPP_PAYIN_EXAMPLE, { amount: 70000 }), deps({ receiptActorId: null }));
    expect(rows("ZaiTransaction")[0]).toMatchObject({ matchStatus: "NEEDS_REVIEW", matchReason: "Ready to receipt (automatic receipts are off)." });
    expect(receipt).not.toHaveBeenCalled();
  });

  it("goes to review with the reason when receipting refuses it", async () => {
    const refusing = vi.fn(async () => {
      throw new Error("The period for 2019-12-16 is closed.");
    });
    const { outcome } = await deliver(body(NPP_PAYIN_EXAMPLE, { amount: 70000 }), deps({ receipt: refusing }));
    expect(outcome).toBe("PROCESSED");
    expect(rows("ZaiTransaction")[0]).toMatchObject({ matchStatus: "NEEDS_REVIEW", matchReason: "The period for 2019-12-16 is closed." });
    expect(rows("ZaiTransaction")[0].journalEntryId ?? null).toBeNull();
  });
});

describe("out of order", () => {
  const T1 = "2019-12-16T07:19:14.968Z";
  const T2 = "2019-12-16T07:25:00.000Z";

  it("discards an older update delivered after a newer one", async () => {
    await deliver(body(NPP_PAYIN_EXAMPLE, { amount: 70000, state: "successful", updated_at: T2 }));
    const older = await deliver(body(NPP_PAYIN_EXAMPLE, { amount: 70000, state: "pending", updated_at: T1 }));
    expect(older.outcome).toBe("STALE");
    expect(rows("ZaiTransaction")).toHaveLength(1);
    expect(rows("ZaiTransaction")[0]).toMatchObject({ zaiState: "successful", zaiUpdatedAt: T2, matchStatus: "RECEIPTED" });
    expect(rows("ZaiWebhookEvent").map((e) => e.status)).toEqual(["PROCESSED", "STALE"]);
    expect(receipt).toHaveBeenCalledTimes(1);
  });

  it("applies updates in order: not settled first, then receipted when it settles", async () => {
    await deliver(body(NPP_PAYIN_EXAMPLE, { amount: 70000, state: "pending", updated_at: T1 }));
    expect(rows("ZaiTransaction")[0]).toMatchObject({ zaiState: "pending", matchStatus: "NEEDS_REVIEW", matchReason: "Not settled yet (pending)." });
    expect(receipt).not.toHaveBeenCalled();
    await deliver(body(NPP_PAYIN_EXAMPLE, { amount: 70000, state: "successful", updated_at: T2 }));
    expect(rows("ZaiTransaction")[0]).toMatchObject({ zaiState: "successful", matchStatus: "RECEIPTED" });
    expect(receipt).toHaveBeenCalledTimes(1);
  });

  it("sends a receipted payin that Zai later shows in another state to reversal review, reversing nothing", async () => {
    await deliver(body(NPP_PAYIN_EXAMPLE, { amount: 70000, updated_at: T1 }));
    await deliver(body(NPP_PAYIN_EXAMPLE, { amount: 70000, state: "returned", updated_at: T2 }));
    expect(rows("ZaiTransaction")[0]).toMatchObject({ matchStatus: "REVERSAL_REVIEW", journalEntryId: "je-1", lotId: "lot-7", matchReason: "Receipted, and Zai now shows the payment as returned." });
    expect(receipt).toHaveBeenCalledTimes(1);
  });
});

describe("the unmatched queue", () => {
  it("holds a payment whose reference no lot has", async () => {
    await deliver(body(NPP_PAYIN_EXAMPLE, { payin_details: { ...NPP_PAYIN_EXAMPLE.transactions.payin_details, pay_id: "nobody@example.com" } }));
    expect(rows("ZaiTransaction")[0]).toMatchObject({ schemeId: "s1", lotId: null, matchStatus: "UNMATCHED", referenceValue: "nobody@example.com" });
    expect(receipt).not.toHaveBeenCalled();
  });

  it("holds a BPAY payin, which carries no lot reference", async () => {
    await deliver(body(BPAY_PAYIN_EXAMPLE));
    expect(rows("ZaiTransaction")[0]).toMatchObject({ schemeId: "s1", lotId: null, matchStatus: "UNMATCHED", zaiTypeMethod: "bpay", amount: "1153.46" });
  });

  it("holds a payment into a wallet that is no building's", async () => {
    await deliver(body(NPP_PAYIN_EXAMPLE, { account_id: "unknown-wallet" }));
    expect(rows("ZaiTransaction")[0]).toMatchObject({ schemeId: null, matchStatus: "UNMATCHED", matchReason: "The wallet is not a building's Zai wallet." });
  });

  it("ignores objects not processed at this stage", async () => {
    const { outcome } = await deliver(body(DISBURSEMENT_EXAMPLE));
    expect(outcome).toBe("IGNORED");
    expect(rows("ZaiWebhookEvent")[0]).toMatchObject({ status: "IGNORED", error: "disbursements are not processed at this stage" });
    expect(rows("ZaiTransaction")).toHaveLength(0);
  });
});

describe("switched off", () => {
  it("stores and processes nothing", async () => {
    vi.stubEnv("ZAI_PAYMENTS", "");
    const raw = body(NPP_PAYIN_EXAMPLE);
    await expect(storeWebhookEvent(orm, { rawBody: raw, parsed: parseZaiWebhook(raw), signedAt: new Date() })).rejects.toBeInstanceOf(ZaiDisabledError);
    await expect(processWebhookEvent("any", deps())).rejects.toBeInstanceOf(ZaiDisabledError);
    expect(rows("ZaiWebhookEvent")).toHaveLength(0);
    expect(rows("ZaiTransaction")).toHaveLength(0);
  });
});
