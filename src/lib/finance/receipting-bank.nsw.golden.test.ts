/**
 * NSW receipting through the bank, golden (QLD stage 2, go-live gap 1, 27 Oct 2026).
 *
 * An NSW building whose owners corporation resolved that contributions bear
 * no interest (NO_INTEREST): a bank deposit receipted across notices, an
 * amount posted to suspense and then cleared to a notice, owner credit
 * applied, and lot arrears, run on the fake database with the real bank
 * allocation code. The snapshots were recorded against origin/main before
 * Queensland's payment order was applied to receipting. Never regenerate them
 * to make a change pass: a difference is a change to NSW.
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
/** The account's sub type from the ids the account mock gives ("acc-BANK-ADMINISTRATIVE", "acc-suspense"). */
const subTypeOf = (id: string) => (id === "acc-suspense" ? "SUSPENSE" : id.startsWith("acc-advance") ? "LEVIES_IN_ADVANCE" : id.split("-")[1]);
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
      const lines = (data.lines as Array<Record<string, unknown>>).map((l) => ({
        supplierId: null,
        gstAmount: null,
        lotId: null,
        ...l,
        accountCode: { accountSubType: subTypeOf(String(l.accountCodeId)) },
      }));
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
const { receiptDepositToNotices, postToSuspense, clearSuspenseItem } = await import("./bank-allocations");
const { applyOwnerCredit } = await import("./owner-credits");
const { statutoryInterestForScheme } = await import("./interest-setting");
const { chargeInterestBatch } = await import("@/lib/queries/interest");
const { lotArrears } = await import("@/lib/debt-recovery/payment-plan-requests");
const { statutoryRulesFor } = await import("@/config/statutory");

const S = "11111111-0000-0000-0000-00000000bbbb";
const notice = (id: string, lotId: string, fundId: string, dueDate: string, amountDue: string, extra: Record<string, unknown> = {}) => ({
  id,
  schemeId: S,
  levyScheduleId: "sched-1",
  lotId,
  ownerId: `owner-${lotId}`,
  fundId,
  fund: { fundType: fundId === "fund-cw" ? "CAPITAL_WORKS" : "ADMINISTRATIVE" },
  noticeNumber: `B-${id}`,
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
    Scheme: [
      {
        id: S,
        state: "NSW",
        interestMode: "NO_INTEREST",
        interestResolutionMeetingId: "m-1",
        interestResolutionMotionId: "mo-1",
        lateChargeMonthlyRatePercent: null,
        timeZone: "Australia/Sydney",
        name: "Golden bank",
      },
    ],
    Fund: [
      { id: "fund-admin", schemeId: S, fundType: "ADMINISTRATIVE", name: "Administrative Fund" },
      { id: "fund-cw", schemeId: S, fundType: "CAPITAL_WORKS", name: "Capital Works Fund" },
    ],
    Lot: [
      { id: "lot-1", schemeId: S, lotNumber: "1" },
      { id: "lot-2", schemeId: S, lotNumber: "2" },
    ],
    LevyNotice: [
      notice("n1", "lot-1", "fund-admin", "2026-06-01", "500.00"),
      notice("n2", "lot-1", "fund-cw", "2026-06-01", "300.00"),
      notice("n3", "lot-2", "fund-admin", "2026-05-01", "250.00"),
      notice("n4", "lot-1", "fund-cw", "2026-12-01", "300.00"),
    ],
    BankTransaction: [
      { id: "bt-1", schemeId: S, amount: "900.00", transactionDate: "2026-10-05", description: "DEPOSIT LOT 1", reference: "LOT1", reconciliationStatus: "UNMATCHED", matchedJournalEntryId: null },
      { id: "bt-2", schemeId: S, amount: "120.00", transactionDate: "2026-10-06", description: "UNKNOWN DEPOSIT", reference: null, reconciliationStatus: "UNMATCHED", matchedJournalEntryId: null },
    ],
    BankTransactionAllocation: [],
    SuspenseItem: [],
    LevyPayment: [],
    OwnerCreditTransaction: [],
    OwnerCreditBalance: [],
    OwnerCreditRefund: [],
    JournalEntry: [],
    JournalLine: [],
  });
});
afterAll(() => {
  vi.useRealTimers();
});

describe("NSW bank receipting golden (no interest)", () => {
  it("1. no interest is worked out or charged", async () => {
    expect(await statutoryInterestForScheme(S, "2026-10-20")).toMatchSnapshot("interest owed");
    expect(await errorOf(chargeInterestBatch({ schemeId: S, actorId: "adviser" }))).toMatchSnapshot("charge refused");
  });

  it("2. a deposit receipted across two notices, with an overpayment held as credit", async () => {
    const receipts = [
      { levyNoticeId: "n1", amountCents: 50_000 },
      { levyNoticeId: "n2", amountCents: 45_000 },
    ];
    expect(await errorOf(receiptDepositToNotices({ schemeId: S, transactionId: "bt-1", receipts, confirmOverpayment: true, feeConfirmedCents: null, actorId: "adviser" }))).toMatchSnapshot("too much");
    const fits = [
      { levyNoticeId: "n1", amountCents: 50_000 },
      { levyNoticeId: "n2", amountCents: 40_000 },
    ];
    expect(await errorOf(receiptDepositToNotices({ schemeId: S, transactionId: "bt-1", receipts: fits, confirmOverpayment: false, feeConfirmedCents: null, actorId: "adviser" }))).toMatchSnapshot("not confirmed");
    expect(await receiptDepositToNotices({ schemeId: S, transactionId: "bt-1", receipts: fits, confirmOverpayment: true, feeConfirmedCents: 99, actorId: "adviser" })).toMatchSnapshot("receipted");
  });

  it("3. an unknown deposit posted to suspense, then cleared to a notice", async () => {
    expect(await postToSuspense({ schemeId: S, transactionId: "bt-2", note: "Ask the owner", actorId: "adviser" })).toMatchSnapshot("posted");
    const item = sharedFake.table("SuspenseItem")[0];
    expect(
      await clearSuspenseItem({ schemeId: S, itemId: String(item.id), target: { kind: "LEVY_NOTICE", levyNoticeId: "n3", confirmOverpayment: false }, note: null, actorId: "adviser" }),
    ).toMatchSnapshot("cleared");
  });

  it("4. owner credit applied, and what each lot owes", async () => {
    expect(await applyOwnerCredit({ schemeId: S, actorId: "adviser", date: "2026-10-16" })).toMatchSnapshot("applied");
    const order = statutoryRulesFor("NSW").PAYMENT_ALLOCATION_ORDER;
    expect(await lotArrears(S, "lot-1", "2026-10-20", order)).toMatchSnapshot("lot 1");
    expect(await lotArrears(S, "lot-2", "2026-10-20", order)).toMatchSnapshot("lot 2");
  });

  it("5. every row, journal and call", () => {
    expect(tables()).toMatchSnapshot("tables");
    expect(calls).toMatchSnapshot("calls");
  });
});
