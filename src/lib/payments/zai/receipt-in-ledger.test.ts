/**
 * A Zai receipt goes through the existing receipting (prepareLevyReceipt and
 * numberedTransaction), called and not copied, and is marked RECEIPTED in the
 * same transaction: once only, and never without a journal.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));

const prepareLevyReceipt = vi.fn();
const log = vi.fn(async () => undefined);
vi.mock("@/lib/finance/levy-receipts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/finance/levy-receipts")>()),
  prepareLevyReceipt: (...a: unknown[]) => prepareLevyReceipt(...a),
}));
vi.mock("@/lib/queries/journal-numbering", async () => {
  const { sharedFake } = await import("@/test/fake-orm");
  return { numberedTransaction: (_schemeId: string, fn: (tx: unknown) => unknown) => sharedFake.db.transaction(fn as never) };
});

const { sharedFake } = await import("@/test/fake-orm");
const { receiptInLedger, ZaiAlreadyReceiptedError } = await import("./receipt-in-ledger");
const { LevyReceiptError } = await import("@/lib/finance/levy-receipts");
const { TEST_ENV } = await import("./__fixtures__/test-env");

const request = {
  zaiTransactionRowId: "zt-1",
  schemeId: "s1",
  receipts: [{ levyNoticeId: "n1", amountCents: 70000 }],
  paymentDate: "2019-12-16",
  actorId: "00000000-0000-4000-8000-000000000001",
  reference: "Zai npp_payin abc",
  debitFrom: "BANK" as const,
};

const preparedPosting = (journalEntryId: string | null) => ({
  run: vi.fn(async (tx: { orm: typeof sharedFake.db.orm }) => {
    await tx.orm.public.LevyPayment.create({ levyNoticeId: "n1", amount: "700.00" });
    return { journalEntryId, parts: [], paymentIds: [] };
  }),
  log,
});

beforeEach(() => {
  for (const [k, v] of Object.entries(TEST_ENV)) vi.stubEnv(k, v);
  vi.clearAllMocks();
  sharedFake.reset({ ZaiTransaction: [{ id: "zt-1", direction: "IN", matchStatus: "NEEDS_REVIEW", journalEntryId: null }] });
});
afterEach(() => vi.unstubAllEnvs());

describe("receiptInLedger", () => {
  it("receipts with the existing code, no fee captured, from the bank account, and marks the row in the same transaction", async () => {
    const prepared = preparedPosting("je-9");
    prepareLevyReceipt.mockResolvedValue(prepared);
    expect(await receiptInLedger(request)).toEqual({ journalEntryId: "je-9" });
    expect(prepareLevyReceipt).toHaveBeenCalledWith({ schemeId: "s1", receipts: request.receipts, paymentDate: "2019-12-16", actorId: request.actorId, reference: "Zai npp_payin abc", captureFee: false, debitFrom: "BANK" });
    expect(sharedFake.tables.ZaiTransaction[0]).toMatchObject({ matchStatus: "RECEIPTED", journalEntryId: "je-9", matchReason: null });
    expect(sharedFake.locks).toEqual([{ table: "ZaiTransaction", ids: ["zt-1"], inTransaction: true }]);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("refuses a row already receipted (a journal, RECEIPTED or REVERSAL_REVIEW), writing nothing", async () => {
    for (const row of [
      { matchStatus: "RECEIPTED", journalEntryId: "je-1" },
      { matchStatus: "REVERSAL_REVIEW", journalEntryId: "je-1" },
      { matchStatus: "NEEDS_REVIEW", journalEntryId: "je-1" },
      { matchStatus: "REVERSAL_REVIEW", journalEntryId: null },
    ]) {
      sharedFake.reset({ ZaiTransaction: [{ id: "zt-1", direction: "IN", ...row }] });
      const prepared = preparedPosting("je-9");
      prepareLevyReceipt.mockResolvedValue(prepared);
      await expect(receiptInLedger(request), JSON.stringify(row)).rejects.toBeInstanceOf(ZaiAlreadyReceiptedError);
      expect(prepared.run).not.toHaveBeenCalled();
      expect(sharedFake.tables.LevyPayment ?? []).toHaveLength(0);
    }
  });

  it("refuses without the explicit debit account (review M5), before preparing anything", async () => {
    await expect(receiptInLedger({ ...request, debitFrom: undefined as unknown as "BANK" })).rejects.toBeInstanceOf(LevyReceiptError);
    expect(prepareLevyReceipt).not.toHaveBeenCalled();
  });

  it("rolls the payments back when no journal could be posted", async () => {
    prepareLevyReceipt.mockResolvedValue(preparedPosting(null));
    await expect(receiptInLedger(request)).rejects.toBeInstanceOf(LevyReceiptError);
    expect(sharedFake.tables.LevyPayment ?? []).toHaveLength(0);
    expect(sharedFake.tables.ZaiTransaction[0]).toMatchObject({ matchStatus: "NEEDS_REVIEW", journalEntryId: null });
    expect(log).not.toHaveBeenCalled();
  });

  it("refuses while switched off, before preparing anything", async () => {
    vi.stubEnv("ZAI_PAYMENTS", "off");
    await expect(receiptInLedger(request)).rejects.toThrow(/switched off/);
    expect(prepareLevyReceipt).not.toHaveBeenCalled();
  });
});
