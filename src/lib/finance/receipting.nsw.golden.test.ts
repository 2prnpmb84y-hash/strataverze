/**
 * NSW receipting, golden (QLD stage 2, go-live gap 1, 27 Oct 2026).
 *
 * Receipting, notice balances and status, owner credits, reversals, the
 * receivable journals, interest charging and lot arrears for an NSW building,
 * run end to end on the fake database. The snapshots were recorded against
 * origin/main before Queensland's payment order was applied to receipting,
 * so NSW must produce exactly the same rows, journals, activity and results.
 * Never regenerate them to make a change pass: a difference is a change to NSW.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const calls: Array<[string, unknown]> = [];
const record = (name: string) => (arg: unknown) => {
  calls.push([name, arg]);
};

vi.mock("@/lib/queries/activity-log", () => ({
  logActivity: vi.fn(async (a: unknown) => record("logActivity")(a)),
  getAuditTrailForExport: vi.fn(),
  formatAuditTrailCsv: vi.fn(),
}));
vi.mock("@/lib/billing/capture", () => ({
  captureTransactionFee: vi.fn(async (_orm: unknown, a: unknown) => record("captureTransactionFee")(a)),
}));
vi.mock("@/lib/finance/bank-allocations", () => ({
  allocateBankTransaction: vi.fn(async (a: unknown) => record("allocateBankTransaction")(a)),
  syncTransaction: vi.fn(async (_orm: unknown, id: unknown) => record("syncTransaction")(id)),
}));
vi.mock("@/lib/queries/journal-entries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/queries/journal-entries")>();
  const { sharedFake } = await import("@/test/fake-orm");
  let n = 0;
  return {
    ...actual,
    getNextEntryNumber: async () => `JE-${String(++n).padStart(4, "0")}`,
    validatePeriodForPosting: async () => undefined,
    createJournalEntry: async (data: Record<string, unknown>) => {
      record("createJournalEntry")(data);
      const lines = (data.lines as Array<Record<string, unknown>>).map((l) => ({ supplierId: null, gstAmount: null, lotId: null, ...l }));
      return sharedFake.db.orm.public.JournalEntry.create({ ...data, lines, status: "DRAFT" });
    },
    postJournalEntry: async (id: string, actorId: string) => {
      record("postJournalEntry")({ id, actorId });
      await sharedFake.db.orm.public.JournalEntry.where({ id }).update({ status: "POSTED" });
    },
  };
});
vi.mock("@/lib/queries/account-codes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/queries/account-codes")>();
  const fundOf = (type?: string) => (type === "CAPITAL_WORKS" ? "fund-cw" : "fund-admin");
  return {
    ...actual,
    getSystemAccountBySubType: async (_schemeId: string, subType: string, fundType?: string) =>
      subType === "SUSPENSE" ? { id: "acc-suspense", fundId: "fund-admin" } : { id: `acc-${subType}-${fundType ?? "ANY"}`, fundId: fundOf(fundType) },
  };
});
vi.mock("@/lib/queries/seed-chart-of-accounts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/queries/seed-chart-of-accounts")>();
  return {
    ...actual,
    ensureLeviesInAdvanceAccount: async (_s: string, fundId: string) => ({ id: `acc-advance-${fundId}`, fundId }),
    ensureSystemAccount: async (_s: string, subType: string, fundId: string) => ({ id: `acc-${subType}-${fundId}`, fundId }),
  };
});

const { sharedFake } = await import("@/test/fake-orm");
const { receiptLevyPayment, receiptLevyPayments } = await import("./levy-receipts");
const { applyOwnerCredit } = await import("./owner-credits");
const { reverseLevyReceipt, reallocateLevyReceipt } = await import("./levy-receipt-reversal");
const { statutoryInterestForScheme } = await import("./interest-setting");
const { chargeInterestBatch } = await import("@/lib/queries/interest");
const { lotArrears } = await import("@/lib/debt-recovery/payment-plan-requests");
const { statutoryRulesFor } = await import("@/config/statutory");

const S = "11111111-0000-0000-0000-00000000aaaa";
const ADMIN = { fundType: "ADMINISTRATIVE" };
const CW = { fundType: "CAPITAL_WORKS" };
const notice = (id: string, lotId: string, fundId: string, dueDate: string, amountDue: string, extra: Record<string, unknown> = {}) => ({
  id,
  schemeId: S,
  levyScheduleId: "sched-1",
  lotId,
  ownerId: `owner-${lotId}`,
  fundId,
  fund: fundId === "fund-cw" ? CW : ADMIN,
  noticeNumber: `N-${id}`,
  dueDate,
  amountDue,
  amountPaid: "0",
  balanceOutstanding: amountDue,
  interestCharged: "0",
  migratedInterestCharged: "0",
  migratedInterestPaid: "0",
  status: "ISSUED",
  issuedAt: "2026-03-01T00:00:00.000Z",
  migrationBatchId: null,
  paidInFullAt: null,
  levySchedule: { levyType: "ADMIN" },
  ...extra,
});

const tables = () => JSON.parse(JSON.stringify(sharedFake.tables));
const errorOf = async (p: Promise<unknown>) => p.then(() => "no error", (e: Error) => `${e.name}: ${e.message}`);

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T01:00:00.000Z"));
  sharedFake.reset({
    Scheme: [{ id: S, state: "NSW", interestMode: "STATUTORY", lateChargeMonthlyRatePercent: null, timeZone: "Australia/Sydney", name: "Golden" }],
    Fund: [
      { id: "fund-admin", schemeId: S, fundType: "ADMINISTRATIVE", name: "Administrative Fund" },
      { id: "fund-cw", schemeId: S, fundType: "CAPITAL_WORKS", name: "Capital Works Fund" },
    ],
    Lot: [
      { id: "lot-1", schemeId: S, lotNumber: "1" },
      { id: "lot-2", schemeId: S, lotNumber: "2" },
    ],
    LevyNotice: [
      notice("n1", "lot-1", "fund-admin", "2026-07-01", "500.00"),
      notice("n2", "lot-1", "fund-cw", "2026-07-01", "300.00"),
      notice("n3", "lot-2", "fund-admin", "2026-04-01", "400.00", { interestCharged: "5.00", balanceOutstanding: "405.00" }),
      notice("n4", "lot-2", "fund-admin", "2026-10-01", "400.00"),
      notice("n6", "lot-2", "fund-cw", "2026-09-01", "250.00"),
      notice("n7", "lot-1", "fund-cw", "2026-11-01", "300.00"),
      // Brought across at takeover, with the old system's interest.
      notice("n8", "lot-2", "fund-admin", "2026-02-01", "120.00", {
        amountPaid: "4.00",
        interestCharged: "10.00",
        migratedInterestCharged: "10.00",
        migratedInterestPaid: "4.00",
        balanceOutstanding: "126.00",
        migrationBatchId: "batch-1",
        issuedAt: "2026-05-01T00:00:00.000Z",
      }),
    ],
    LevyPayment: [],
    OwnerCreditTransaction: [],
    OwnerCreditBalance: [],
    OwnerCreditRefund: [],
    JournalEntry: [],
    JournalLine: [],
    BankTransactionAllocation: [],
    BankTransaction: [],
  });
});
afterAll(() => {
  vi.useRealTimers();
});

describe("NSW receipting golden", () => {
  it("1. interest worked out and charged", async () => {
    expect(await statutoryInterestForScheme(S, "2026-10-20")).toMatchSnapshot("interest owed");
    expect(await chargeInterestBatch({ schemeId: S, actorId: "adviser" })).toMatchSnapshot("interest charged");
    expect(tables().LevyNotice).toMatchSnapshot("notices after interest");
  });

  it("2. a part payment", async () => {
    expect(await receiptLevyPayment({ schemeId: S, levyNoticeId: "n3", amountCents: 10_000, paymentDate: "2026-10-10", actorId: "adviser", reference: "EFT 1" })).toMatchSnapshot();
  });

  it("3. one payment over two notices and two funds, with an overpayment held as credit", async () => {
    expect(
      await errorOf(receiptLevyPayments({ schemeId: S, receipts: [{ levyNoticeId: "n1", amountCents: 50_000 }, { levyNoticeId: "n2", amountCents: 35_000 }], paymentDate: "2026-10-12", actorId: "adviser" })),
    ).toMatchSnapshot("overpayment not confirmed");
    expect(
      await receiptLevyPayments({
        schemeId: S,
        receipts: [{ levyNoticeId: "n1", amountCents: 50_000 }, { levyNoticeId: "n2", amountCents: 35_000 }],
        paymentDate: "2026-10-12",
        actorId: "adviser",
        reference: "BPAY 2",
        confirmOverpayment: true,
      }),
    ).toMatchSnapshot();
  });

  it("4. a suspense item cleared to a capital works notice", async () => {
    expect(await receiptLevyPayment({ schemeId: S, levyNoticeId: "n6", amountCents: 10_000, paymentDate: "2026-10-14", actorId: "adviser", reference: "Cleared from suspense", captureFee: false, debitFrom: "SUSPENSE" })).toMatchSnapshot();
  });

  it("5. a takeover notice paid in full", async () => {
    expect(await receiptLevyPayment({ schemeId: S, levyNoticeId: "n8", amountCents: 12_600, paymentDate: "2026-10-15", actorId: "adviser" })).toMatchSnapshot();
  });

  it("6. owner credit applied", async () => {
    expect(await applyOwnerCredit({ schemeId: S, actorId: "adviser", date: "2026-10-16" })).toMatchSnapshot();
  });

  it("7. reversals and a reallocation", async () => {
    const entries = sharedFake.table("JournalEntry");
    const receiptOf = (noticeId: string) => String(sharedFake.table("LevyPayment").find((p) => p.levyNoticeId === noticeId)!.journalEntryId);
    // The credit from the n1 and n2 receipt was used, so it cannot be reversed yet.
    expect(await errorOf(reverseLevyReceipt({ schemeId: S, journalEntryId: receiptOf("n1"), reason: "DISHONOURED", actorId: "adviser" }))).toMatchSnapshot("credit used");
    expect(await reverseLevyReceipt({ schemeId: S, journalEntryId: receiptOf("n3"), reason: "DISHONOURED", reversalDate: "2026-10-17", actorId: "adviser" })).toMatchSnapshot("dishonoured");
    expect(await reallocateLevyReceipt({ schemeId: S, journalEntryId: receiptOf("n6"), receipts: [{ levyNoticeId: "n4", amountCents: 10_000 }], confirmOverpayment: false, actorId: "adviser" })).toMatchSnapshot("reallocated");
    expect(entries.length).toBeGreaterThan(0);
  });

  it("8. interest after the reversal, and what each lot owes", async () => {
    expect(await statutoryInterestForScheme(S, "2026-10-20")).toMatchSnapshot("interest owed");
    const order = statutoryRulesFor("NSW").PAYMENT_ALLOCATION_ORDER;
    expect(await lotArrears(S, "lot-1", "2026-10-20", order)).toMatchSnapshot("lot 1");
    expect(await lotArrears(S, "lot-2", "2026-10-20", order)).toMatchSnapshot("lot 2");
    expect(await lotArrears(S, "lot-2", "2026-10-20")).toMatchSnapshot("lot 2, no order");
  });

  it("9. every row, journal and call", () => {
    expect(tables()).toMatchSnapshot("tables");
    expect(calls).toMatchSnapshot("calls");
  });
});
