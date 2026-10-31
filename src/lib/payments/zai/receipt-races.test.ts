/**
 * Races between deliveries of the same Zai payin (second review, MEDIUM-1
 * and LOW-2), with the real processor and receiptInLedger on the fake
 * database. The receipting code itself is mocked; the races are about the
 * Zai row.
 *
 * - A stale receipt: delivery A (successful, T1) writes its row and then
 *   receipts it; a newer delivery B (returned, T2) lands between the two. A's
 *   receipt must be refused, since the row is no longer the one A assessed.
 *   Before the fix the row ended RECEIPTED with Zai's state "returned".
 * - A receipt that commits between the processor's unlocked read (assess)
 *   and its locked write is kept, never undone. On f79f5e5 (before H2) the
 *   row was put back to NEEDS_REVIEW with its journal.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
const prepareLevyReceipt = vi.fn();
vi.mock("@/lib/finance/levy-receipts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/finance/levy-receipts")>()),
  prepareLevyReceipt: (...a: unknown[]) => prepareLevyReceipt(...a),
}));
vi.mock("@/lib/queries/journal-numbering", async () => {
  const { sharedFake } = await import("@/test/fake-orm");
  return { numberedTransaction: (_s: string, fn: (tx: unknown) => unknown) => sharedFake.db.transaction(fn as never) };
});

const { sharedFake } = await import("@/test/fake-orm");
const { processWebhookEvent, storeWebhookEvent } = await import("./webhook-processor");
const { receiptInLedger } = await import("./receipt-in-ledger");
const { parseZaiWebhook } = await import("./webhook-payload");
const { TEST_ENV } = await import("./__fixtures__/test-env");
const { NPP_PAYIN_EXAMPLE } = await import("./__fixtures__/zai-doc-examples");

type Deps = Parameters<typeof processWebhookEvent>[1];
const orm = sharedFake.db.orm as unknown as Deps["orm"];
const WALLET = NPP_PAYIN_EXAMPLE.transactions.account_id;
const ACTOR = "00000000-0000-4000-8000-000000000001";
const T1 = "2019-12-16T07:19:14.968Z";
const T2 = "2019-12-16T07:25:00.000Z";
const notices = [{ id: "n1", schemeId: "s1", noticeNumber: "L-0001", lotId: "lot-7", fundId: "f", dueDate: "2026-04-01", status: "OVERDUE", amountDue: "60000.00", amountPaid: "0", interestCharged: "0" }];
const body = (change: Record<string, unknown>) => JSON.stringify({ transactions: { ...NPP_PAYIN_EXAMPLE.transactions, amount: 70000, ...change } });
const posted = vi.fn();

const deps = (over: Partial<Deps> = {}): Deps => ({
  orm,
  transaction: (fn) => sharedFake.db.transaction((tx) => fn(tx as unknown as { orm: Deps["orm"] })),
  loadNotices: async () => notices,
  timeZoneOf: async () => "Australia/Sydney",
  receipt: receiptInLedger,
  receiptActorId: ACTOR,
  receiptDebitFrom: "BANK",
  ...over,
});
const deliver = async (raw: string, d: Deps) => {
  const s = await storeWebhookEvent(orm, { rawBody: raw, parsed: parseZaiWebhook(raw), signedAt: new Date() });
  return processWebhookEvent(s.id, d);
};
const row = () => sharedFake.tables.ZaiTransaction[0];

beforeEach(() => {
  for (const [k, v] of Object.entries(TEST_ENV)) vi.stubEnv(k, v);
  posted.mockClear();
  prepareLevyReceipt.mockResolvedValue({
    run: vi.fn(async () => {
      posted();
      return { journalEntryId: "je-1", parts: [], paymentIds: [] };
    }),
    log: vi.fn(async () => undefined),
  });
  sharedFake.reset({
    ZaiWalletAccount: [{ id: "w", schemeId: "s1", zaiUserRowId: "u", kind: "MAIN", fundId: null, zaiAccountId: WALLET, active: true }],
    ZaiPaymentReference: [{ id: "r1", schemeId: "s1", lotId: "lot-7", method: "PAYID", value: "lot7.payid@example.com", zaiWalletAccountId: WALLET, status: "active" }],
  });
  sharedFake.setUniqueKeys({ ZaiWebhookEvent: [["dedupeKey"]], ZaiTransaction: [["zaiObjectType", "zaiObjectId"]] });
});
afterEach(() => vi.unstubAllEnvs());

describe("a stale receipt (MEDIUM-1)", () => {
  it("is refused when a newer delivery (returned) lands between A's write and A's receipt", async () => {
    let release!: () => void;
    const paused = new Promise<void>((r) => (release = r));
    let first = true;
    // A's receipt starts once the building's time zone is read: hold it there.
    const held = deps({
      timeZoneOf: async () => {
        if (first) {
          first = false;
          await paused;
        }
        return "Australia/Sydney";
      },
    });
    const a = deliver(body({ updated_at: T1 }), held);
    await new Promise((r) => setTimeout(r, 20));
    expect(await deliver(body({ state: "returned", updated_at: T2 }), held)).toBe("PROCESSED");
    expect(row()).toMatchObject({ zaiState: "returned", matchStatus: "NEEDS_REVIEW" });
    release();
    expect(await a).toBe("PROCESSED");
    expect(posted).not.toHaveBeenCalled();
    expect(row()).toMatchObject({ zaiState: "returned", matchStatus: "NEEDS_REVIEW", zaiUpdatedAt: T2 });
    expect(row().journalEntryId ?? null).toBeNull();
    // A's refusal did not overwrite B's reason (LOW-4).
    expect(row().matchReason).toBe("Not settled yet (returned).");
  });

  it("is refused when a newer delivery with another amount lands in between", async () => {
    let release!: () => void;
    const paused = new Promise<void>((r) => (release = r));
    let first = true;
    const held = deps({ timeZoneOf: async () => (first ? ((first = false), await paused, "Australia/Sydney") : "Australia/Sydney") });
    const a = deliver(body({ updated_at: T1 }), held);
    await new Promise((r) => setTimeout(r, 20));
    // B is a different amount, held for a person (automatic receipts off for B).
    await deliver(body({ amount: 80000, updated_at: T2 }), deps({ receiptActorId: null }));
    release();
    await a;
    expect(posted).not.toHaveBeenCalled();
    expect(row()).toMatchObject({ amount: "800.00", matchStatus: "NEEDS_REVIEW", zaiUpdatedAt: T2 });
    expect(row().journalEntryId ?? null).toBeNull();
  });

  it("still receipts when nothing changed in between", async () => {
    expect(await deliver(body({ updated_at: T1 }), deps())).toBe("PROCESSED");
    expect(posted).toHaveBeenCalledTimes(1);
    expect(row()).toMatchObject({ matchStatus: "RECEIPTED", journalEntryId: "je-1", zaiState: "successful" });
  });
});

describe("a receipt committed between assess and the locked write (LOW-2)", () => {
  it("is kept: the locked re-read sees it receipted", async () => {
    sharedFake.reset({
      ...sharedFake.tables,
      ZaiTransaction: [{ id: "zt", direction: "IN", zaiObjectType: "transactions", zaiObjectId: NPP_PAYIN_EXAMPLE.transactions.id, schemeId: "s1", lotId: "lot-7", amount: "700.00", zaiState: "successful", matchStatus: "NEEDS_REVIEW", journalEntryId: null, zaiUpdatedAt: "2019-12-16T07:00:00.000Z" }],
    });
    sharedFake.setUniqueKeys({ ZaiWebhookEvent: [["dedupeKey"]], ZaiTransaction: [["zaiObjectType", "zaiObjectId"]] });
    const receipt = vi.fn(async () => {
      throw new Error("This Zai payment is already receipted.");
    });
    const d = deps({
      receipt,
      loadNotices: async () => {
        // Another delivery's receipt commits now, after this delivery's unlocked read.
        Object.assign(row(), { matchStatus: "RECEIPTED", journalEntryId: "je-other" });
        return notices;
      },
    });
    await deliver(body({ updated_at: T1 }), d);
    expect(row()).toMatchObject({ matchStatus: "RECEIPTED", journalEntryId: "je-other" });
    expect(receipt).not.toHaveBeenCalled();
  });
});
