/**
 * Journal numbering under the building's lock, NSW (27 Oct 2026).
 *
 * Entry numbers are the highest in the building plus one, unique per building
 * (journal_entries_scheme_id_entry_number_key). Every journal writer now
 * numbers and writes its entry in a transaction that holds the building's
 * numbering lock (the schemes row), and an NSW receipt writes its payments
 * and its journal together or not at all. Run on the fake database, with the
 * unique key set, so two writers that took the same number would fail.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/queries/activity-log", () => ({ logActivity: vi.fn(), getAuditTrailForExport: vi.fn(), formatAuditTrailCsv: vi.fn() }));
vi.mock("@/lib/billing/capture", () => ({ captureTransactionFee: vi.fn() }));

const fail = vi.hoisted(() => ({ entryType: null as string | null }));
vi.mock("@/lib/queries/journal-entries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/queries/journal-entries")>();
  const { sharedFake } = await import("@/test/fake-orm");
  return {
    ...actual,
    // As the real one (the fake ignores orderBy): the highest number for the building, plus one,
    // read through the orm it is given. It reads, then gives way before the caller writes, so two
    // callers not serialised take the same number and the second insert breaks the unique key.
    getNextEntryNumber: async (schemeId: string, orm = sharedFake.db.orm) => {
      const rows = await orm.public.JournalEntry.where((je: { schemeId: { eq: (v: string) => unknown } }) => je.schemeId.eq(schemeId)).limit(100000).all();
      const highest = rows.reduce((max, e) => Math.max(max, Number(String(e.entryNumber).replace(/\D/g, "")) || 0), 0);
      await new Promise((resolve) => setTimeout(resolve, 0));
      return `JE-${String(highest + 1).padStart(4, "0")}`;
    },
    // A journal of the given type fails as it is written (after the writes before it).
    createJournalEntry: async (data: Parameters<typeof actual.createJournalEntry>[0], orm?: Parameters<typeof actual.createJournalEntry>[1]) => {
      if (fail.entryType && data.entryType === fail.entryType) throw new Error(`The ${data.entryType} journal could not be written.`);
      const entry = await actual.createJournalEntry(data, orm);
      // The fake has no nested include: each line carries its account's sub type for the bank allocation check.
      for (const line of sharedFake.table("JournalLine").filter((l) => l.journalEntryId === entry.id)) {
        line.accountCode = { accountSubType: sharedFake.table("AccountCode").find((a) => a.id === line.accountCodeId)?.accountSubType ?? null };
      }
      return entry;
    },
  };
});
// Account lookups read through the global db, as the real ones do, so a lookup made under a lock is seen.
vi.mock("@/lib/queries/account-codes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/queries/account-codes")>();
  const { sharedFake } = await import("@/test/fake-orm");
  return {
    ...actual,
    getSystemAccountBySubType: async (_s: string, subType: string) =>
      sharedFake.db.orm.public.AccountCode.where((a: { id: { eq: (v: string) => unknown } }) => a.id.eq(`acc-${subType}`)).first(),
  };
});
vi.mock("@/lib/queries/seed-chart-of-accounts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/queries/seed-chart-of-accounts")>();
  const { sharedFake } = await import("@/test/fake-orm");
  const find = (subType: string) => sharedFake.db.orm.public.AccountCode.where((a: { id: { eq: (v: string) => unknown } }) => a.id.eq(`acc-${subType}`)).first();
  return { ...actual, ensureLeviesInAdvanceAccount: async () => find("LEVIES_IN_ADVANCE"), ensureSystemAccount: async (_s: string, subType: string) => find(subType) };
});

const { sharedFake } = await import("@/test/fake-orm");
const { receiptLevyPayment } = await import("./levy-receipts");
const { reverseLevyReceipt } = await import("./levy-receipt-reversal");
const { postToSuspense, clearSuspenseItem, receiptDepositToNotices } = await import("./bank-allocations");
const { applyOwnerCredit, recordOwnerCreditRefundPaid } = await import("./owner-credits");
const { authoriseSupplierInvoice } = await import("./invoice-approval");
const { postLevyRaisedJournal } = await import("@/lib/levies/issue-notices");
const { chargeInterest } = await import("@/lib/queries/interest");
const { reverseJournalEntry } = await import("@/lib/queries/journal-entries");
const { allocateBankTransaction } = await import("./bank-allocations");
const { lockJournalNumbering, JournalBusyError } = await import("@/lib/queries/journal-numbering");
const { recordLevyPaymentIn } = await import("@/lib/queries/levy-schedules");

const S = "33333333-0000-0000-0000-00000000cccc";
const account = (subType: string, accountType: string) => ({ id: `acc-${subType}`, schemeId: S, code: subType.slice(0, 6), name: subType, accountType, accountSubType: subType, fundId: "fund-admin", isActive: true });
const notice = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  schemeId: S,
  levyScheduleId: "sched-1",
  lotId: "lot-1",
  ownerId: "owner-1",
  fundId: "fund-admin",
  fund: { fundType: "ADMINISTRATIVE" },
  noticeNumber: `N-${id}`,
  dueDate: "2026-10-01",
  amountDue: "500.00",
  amountPaid: "0",
  balanceOutstanding: "500.00",
  interestCharged: "0",
  migratedInterestCharged: "0",
  migratedInterestPaid: "0",
  status: "ISSUED",
  issuedAt: "2026-08-27T00:00:00.000Z",
  migrationBatchId: null,
  paidInFullAt: null,
  levySchedule: { levyType: "ADMIN" },
  levyPostPending: false,
  ...extra,
});

function setup(periods: Record<string, unknown>[] = []) {
  sharedFake.reset({
    Scheme: [{ id: S, state: "NSW", interestMode: "STATUTORY", lateChargeMonthlyRatePercent: null, timeZone: "Australia/Sydney", name: "Numbering", financialYearEnd: "06-30" }],
    Fund: [{ id: "fund-admin", schemeId: S, fundType: "ADMINISTRATIVE", name: "Administrative Fund" }],
    Lot: [{ id: "lot-1", schemeId: S, lotNumber: "1" }],
    AccountCode: [
      account("BANK", "ASSET"),
      account("SUSPENSE", "LIABILITY"),
      account("ACCOUNTS_RECEIVABLE", "ASSET"),
      account("LEVIES_IN_ADVANCE", "LIABILITY"),
      account("LEVY_INCOME", "INCOME"),
      account("INTEREST_INCOME", "INCOME"),
      account("ACCOUNTS_PAYABLE", "LIABILITY"),
      account("BANK_FEES", "EXPENSE"),
      account("REPAIRS", "EXPENSE"),
    ],
    LevyNotice: [notice("n1"), notice("n2"), notice("n3", { dueDate: "2026-06-01", status: "OVERDUE" })],
    LevyPayment: [],
    OwnerCreditTransaction: [],
    OwnerCreditBalance: [],
    OwnerCreditRefund: [],
    JournalEntry: [],
    JournalLine: [],
    BankTransaction: [
      { id: "bt-1", schemeId: S, amount: "500.00", transactionDate: "2026-10-05", description: "DEPOSIT LOT 1", reference: "LOT1", reconciliationStatus: "UNMATCHED", matchedJournalEntryId: null },
      { id: "bt-2", schemeId: S, amount: "120.00", transactionDate: "2026-10-06", description: "UNKNOWN DEPOSIT", reference: null, reconciliationStatus: "UNMATCHED", matchedJournalEntryId: null },
    ],
    BankTransactionAllocation: [],
    SuspenseItem: [],
    FinancialPeriod: periods,
    PaymentAuthorisation: [],
    SchemePaymentPolicy: [{ id: "pp-1", schemeId: S, singleApproverLimit: "5000.00", requireSecondApproverAbove: null, allowSelfApproval: false, allowAdviserApproval: false, bankChangeCoolingOffDays: 2 }],
    SchemeMembership: [{ id: "m-t", schemeId: S, profileId: "treasurer", role: "COMMITTEE", isActive: true, isTreasurer: true }],
    SupplierInvoice: [
      { id: "inv-1", schemeId: S, supplierId: "sup-1", fundId: "fund-admin", accountCodeId: "acc-REPAIRS", invoiceNumber: "INV-1", totalAmount: "220.00", gstAmount: "0", amountPaid: "0", balanceOutstanding: "220.00", status: "AWAITING_APPROVAL", preparedById: "adviser" },
    ],
    Supplier: [{ id: "sup-1", schemeId: S, companyName: "Plumber", contractorBusinessId: null }],
    PlatformInvoice: [],
  });
  // Entry numbers are unique per building, as in the database.
  sharedFake.setUniqueKeys({ JournalEntry: [["schemeId", "entryNumber"]] });
  sharedFake.setRelations({ JournalEntry: { lines: { table: "JournalLine", foreignKey: "journalEntryId" } } });
}

const pay = (levyNoticeId: string, amountCents = 10_000, paymentDate = "2026-10-10") =>
  receiptLevyPayment({ schemeId: S, levyNoticeId, amountCents, paymentDate, actorId: "adviser" });
const numbers = () => sharedFake.table("JournalEntry").map((e) => String(e.entryNumber)).sort();
const schemeLocks = () => sharedFake.locks.filter((l) => l.table === "Scheme" && l.inTransaction);
const nothingWritten = () => {
  expect(sharedFake.table("LevyPayment")).toHaveLength(0);
  expect(sharedFake.table("JournalEntry")).toHaveLength(0);
  expect(sharedFake.table("JournalLine")).toHaveLength(0);
  expect(sharedFake.table("LevyNotice").map((n) => [n.id, n.amountPaid, n.status])).toEqual([
    ["n1", "0", "ISSUED"],
    ["n2", "0", "ISSUED"],
    ["n3", "0", "OVERDUE"],
  ]);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
type FakeTx = Parameters<Parameters<typeof sharedFake.db.transaction>[0]>[0];
/** Hold the building's lock for a while, so a writer started meanwhile queues behind it, then run `during` and commit. */
const holdBuilding = (during: (tx: FakeTx) => Promise<unknown> = async () => undefined, ms = 30) =>
  sharedFake.db.transaction(async (tx) => {
    await lockJournalNumbering(tx as never, S);
    await sleep(ms);
    await during(tx);
  });
/** Start a writer a moment after the building's lock is taken. */
const later = <T>(fn: () => Promise<T>) => sleep(5).then(fn);
const outcome = (p: Promise<unknown>) => p.then(() => "done", (e: Error) => e.message);
const credit = (amount: string) => {
  sharedFake.table("OwnerCreditTransaction").push({ id: "ct-1", schemeId: S, lotId: "lot-1", fundId: "fund-admin", ownerId: "owner-1", type: "OVERPAYMENT", amount });
  sharedFake.table("OwnerCreditBalance").push({ id: "cb-1", schemeId: S, lotId: "lot-1", fundId: "fund-admin", ownerId: "owner-1", balance: amount });
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T01:00:00.000Z"));
  fail.entryType = null;
  setup();
});

describe("NSW receipts are numbered under the building's lock", () => {
  it("two NSW receipts at once take different numbers", async () => {
    await Promise.all([pay("n1"), pay("n2"), pay("n1", 5_000)]);
    expect(numbers()).toEqual(["JE-0001", "JE-0002", "JE-0003"]);
    expect(sharedFake.table("LevyPayment")).toHaveLength(3);
    expect(sharedFake.table("LevyPayment").every((p) => p.journalEntryId)).toBe(true);
    // Both receipts on n1 counted: neither overwrote the other's amount paid.
    expect(sharedFake.table("LevyNotice").find((n) => n.id === "n1")!.amountPaid).toBe("150");
    // The building first, then the notice, each receipt in its own transaction.
    expect(schemeLocks()).toHaveLength(3);
    expect(sharedFake.globalCallsUnderLock).toEqual([]);
  });

  it("a closed period refuses an NSW receipt with nothing written", async () => {
    setup([{ id: "p-10", schemeId: S, name: "October 2026", startDate: "2026-10-01", endDate: "2026-10-31", status: "CLOSED" }]);
    await expect(pay("n1")).rejects.toThrow("Cannot post to a closed period (October 2026).");
    nothingWritten();
    // Refused before the transaction opened.
    expect(schemeLocks()).toHaveLength(0);
  });

  it("a failing NSW receipt journal leaves no payment", async () => {
    // The bank account is missing from the chart the fund check reads, so the journal fails after the payment is written.
    sharedFake.table("AccountCode").find((a) => a.id === "acc-BANK")!.schemeId = "another-scheme";
    vi.spyOn(await import("@/lib/queries/account-codes"), "getSystemAccountBySubType").mockImplementation(async (_s, subType) =>
      ({ id: `acc-${subType}`, fundId: "fund-admin" }) as never,
    );
    await expect(pay("n1")).rejects.toThrow("A line uses an account that is not in this scheme's chart of accounts.");
    nothingWritten();
    vi.restoreAllMocks();
  });

  it("an overpayment held as credit is written with its journal, or not at all", async () => {
    fail.entryType = "AUTO";
    await expect(receiptLevyPayment({ schemeId: S, levyNoticeId: "n1", amountCents: 60_000, paymentDate: "2026-10-10", actorId: "adviser", confirmOverpayment: true })).rejects.toThrow(
      "The AUTO journal could not be written.",
    );
    nothingWritten();
    expect(sharedFake.table("OwnerCreditTransaction")).toHaveLength(0);
    expect(sharedFake.table("OwnerCreditBalance")).toHaveLength(0);
  });

  it("a bank deposit is receipted and allocated together, or not at all", async () => {
    fail.entryType = "AUTO";
    await expect(
      receiptDepositToNotices({ schemeId: S, transactionId: "bt-1", receipts: [{ levyNoticeId: "n1", amountCents: 50_000 }], confirmOverpayment: false, feeConfirmedCents: null, actorId: "adviser" }),
    ).rejects.toThrow("The AUTO journal could not be written.");
    nothingWritten();
    expect(sharedFake.table("BankTransactionAllocation")).toHaveLength(0);
    fail.entryType = null;
    await receiptDepositToNotices({ schemeId: S, transactionId: "bt-1", receipts: [{ levyNoticeId: "n1", amountCents: 50_000 }], confirmOverpayment: false, feeConfirmedCents: null, actorId: "adviser" });
    expect(sharedFake.table("BankTransactionAllocation")).toHaveLength(1);
    expect(sharedFake.table("BankTransaction").find((t) => t.id === "bt-1")!.reconciliationStatus).toBe("MATCHED");
    expect(sharedFake.globalCallsUnderLock).toEqual([]);
  });
});

describe("NSW reversals", () => {
  it("the dishonour fee is numbered in the reversal's transaction", async () => {
    const { journalEntryId } = await pay("n1");
    const fee = { amountCents: 1_500, accountCodeId: "acc-BANK_FEES" };
    // The fee journal fails: the reversal, the payment and the notice are all put back as they were.
    fail.entryType = "BANK_FEE";
    await expect(reverseLevyReceipt({ schemeId: S, journalEntryId: journalEntryId!, reason: "DISHONOURED", reversalDate: "2026-10-12", fee, actorId: "adviser" })).rejects.toThrow(
      "The BANK_FEE journal could not be written.",
    );
    expect(sharedFake.table("JournalEntry").map((e) => [e.entryNumber, e.entryType, e.status])).toEqual([["JE-0001", "AUTO", "POSTED"]]);
    expect(sharedFake.table("LevyPayment")[0].reversedAt).toBeUndefined();
    expect(sharedFake.table("LevyNotice").find((n) => n.id === "n1")!.amountPaid).toBe("100");

    fail.entryType = null;
    const done = await reverseLevyReceipt({ schemeId: S, journalEntryId: journalEntryId!, reason: "DISHONOURED", reversalDate: "2026-10-12", fee, actorId: "adviser" });
    const byId = (id: string | null) => sharedFake.table("JournalEntry").find((e) => e.id === id)!;
    expect([byId(done.reversalEntryId).entryNumber, byId(done.feeEntryId).entryNumber]).toEqual(["JE-0002", "JE-0003"]);
    expect(byId(done.feeEntryId).status).toBe("POSTED");
    expect(sharedFake.globalCallsUnderLock).toEqual([]);
  });

  it("a receipt cannot be reversed twice at once", async () => {
    const { journalEntryId } = await pay("n1");
    const reverse = () => reverseLevyReceipt({ schemeId: S, journalEntryId: journalEntryId!, reason: "ENTERED_IN_ERROR", reversalDate: "2026-10-12", actorId: "adviser" });
    const results = await Promise.allSettled([reverse(), reverse()]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(sharedFake.table("LevyNotice").find((n) => n.id === "n1")!.amountPaid).toBe("0");
  });

  it("a plain journal reversal is numbered under the lock", async () => {
    await postToSuspense({ schemeId: S, transactionId: "bt-2", note: null, actorId: "adviser" });
    const entry = sharedFake.table("JournalEntry")[0];
    const before = sharedFake.locks.length;
    const [reversal] = await Promise.all([reverseJournalEntry(String(entry.id), { createdBy: "adviser" }), pay("n1")]);
    expect(numbers()).toEqual(["JE-0001", "JE-0002", "JE-0003"]);
    expect(reversal.entryNumber).toMatch(/^JE-000[23]$/);
    expect(sharedFake.locks.slice(before)[0]).toEqual({ table: "Scheme", ids: [S], inTransaction: true });
  });
});

describe("every other journal writer takes the numbering lock", () => {
  /** Run a writer and check it took the building's lock in a transaction, first, with no global call under it. */
  const takesTheLock = async (write: () => Promise<unknown>) => {
    const before = sharedFake.locks.length;
    const entries = sharedFake.table("JournalEntry").length;
    await write();
    expect(sharedFake.locks.slice(before)[0]).toEqual({ table: "Scheme", ids: [S], inTransaction: true });
    expect(sharedFake.table("JournalEntry").length).toBeGreaterThan(entries);
    expect(sharedFake.globalCallsUnderLock).toEqual([]);
  };

  it("levies raised", async () => {
    sharedFake.table("LevyNotice").find((n) => n.id === "n1")!.levyPostPending = true;
    await takesTheLock(() => postLevyRaisedJournal({ schemeId: S, fundId: "fund-admin", scheduleId: "sched-1", totalAmount: 500, noticeCount: 1, profileId: "adviser", date: "2026-10-01", noticeIds: ["n1"] }));
    expect(sharedFake.table("JournalEntry")[0]).toMatchObject({ entryNumber: "JE-0001", sourceType: "LEVY_RAISED", status: "POSTED" });
    // The pending mark is cleared in the same transaction.
    expect(sharedFake.table("LevyNotice").find((n) => n.id === "n1")!.levyPostPending).toBe(false);
  });

  it("levies raised in a closed period leave no draft and keep the pending mark", async () => {
    setup([{ id: "p-10", schemeId: S, name: "October 2026", startDate: "2026-10-01", endDate: "2026-10-31", status: "CLOSED" }]);
    sharedFake.table("LevyNotice").find((n) => n.id === "n1")!.levyPostPending = true;
    await expect(postLevyRaisedJournal({ schemeId: S, fundId: "fund-admin", scheduleId: "sched-1", totalAmount: 500, noticeCount: 1, profileId: "adviser", date: "2026-10-01", noticeIds: ["n1"] })).rejects.toThrow(
      "Cannot post to a closed period (October 2026).",
    );
    expect(sharedFake.table("JournalEntry")).toHaveLength(0);
    expect(sharedFake.table("JournalLine")).toHaveLength(0);
    expect(sharedFake.table("LevyNotice").find((n) => n.id === "n1")!.levyPostPending).toBe(true);
  });

  it("suspense, posted and cleared", async () => {
    await takesTheLock(() => postToSuspense({ schemeId: S, transactionId: "bt-2", note: null, actorId: "adviser" }));
    const item = sharedFake.table("SuspenseItem")[0];
    await takesTheLock(() => clearSuspenseItem({ schemeId: S, itemId: String(item.id), target: { kind: "ACCOUNT", accountCodeId: "acc-LEVY_INCOME" }, note: null, actorId: "adviser" }));
    expect(numbers()).toEqual(["JE-0001", "JE-0002"]);
    expect(sharedFake.table("SuspenseItem")[0]).toMatchObject({ status: "CLEARED" });
  });

  it("a suspense item cleared to a notice twice at once is cleared once", async () => {
    await postToSuspense({ schemeId: S, transactionId: "bt-2", note: null, actorId: "adviser" });
    const item = sharedFake.table("SuspenseItem")[0];
    const clear = () => clearSuspenseItem({ schemeId: S, itemId: String(item.id), target: { kind: "LEVY_NOTICE", levyNoticeId: "n1", confirmOverpayment: false }, note: null, actorId: "adviser" });
    const results = await Promise.allSettled([clear(), clear()]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(sharedFake.table("LevyPayment")).toHaveLength(1);
  });

  it("the NSW interest charge and owner credit applied", async () => {
    await takesTheLock(() => chargeInterest({ schemeId: S, noticeId: "n3", interestAmount: 5, actorId: "adviser", alreadyVerified: true }));
    sharedFake.table("OwnerCreditTransaction").push({ id: "ct-1", schemeId: S, lotId: "lot-1", fundId: "fund-admin", ownerId: "owner-1", type: "OVERPAYMENT", amount: "50.00" });
    sharedFake.table("OwnerCreditBalance").push({ id: "cb-1", schemeId: S, lotId: "lot-1", fundId: "fund-admin", ownerId: "owner-1", balance: "50.00" });
    await takesTheLock(() => applyOwnerCredit({ schemeId: S, actorId: "adviser", date: "2026-10-16" }));
    expect(numbers()).toEqual(["JE-0001", "JE-0002"]);
  });

  it("invoices approved", async () => {
    await takesTheLock(() => authoriseSupplierInvoice({ schemeId: S, invoiceId: "inv-1", actorId: "treasurer" }));
    expect(sharedFake.table("JournalEntry")[0]).toMatchObject({ entryNumber: "JE-0001", sourceType: "INVOICE", status: "POSTED" });
  });

  it("owner credit refunds paid", async () => {
    sharedFake.table("OwnerCreditTransaction").push({ id: "ct-1", schemeId: S, lotId: "lot-1", fundId: "fund-admin", ownerId: "owner-1", type: "OVERPAYMENT", amount: "50.00" });
    sharedFake.table("OwnerCreditBalance").push({ id: "cb-1", schemeId: S, lotId: "lot-1", fundId: "fund-admin", ownerId: "owner-1", balance: "50.00" });
    sharedFake.table("OwnerCreditRefund").push({ id: "rf-1", schemeId: S, lotId: "lot-1", fundId: "fund-admin", ownerId: "owner-1", amount: "50.00", payeeName: "Owner One", status: "APPROVED", preparedById: "adviser" });
    await takesTheLock(() => recordOwnerCreditRefundPaid({ schemeId: S, refundId: "rf-1", actorId: "treasurer", paidOn: "2026-10-16" }));
    const refund = sharedFake.table("OwnerCreditRefund")[0];
    expect(refund).toMatchObject({ status: "PAID" });
    expect(refund.journalEntryId).toBe(sharedFake.table("JournalEntry")[0].id);
  });

  it("writers of every kind at once take different numbers", async () => {
    sharedFake.table("LevyNotice").find((n) => n.id === "n2")!.levyPostPending = true;
    await Promise.all([
      pay("n1"),
      postToSuspense({ schemeId: S, transactionId: "bt-2", note: null, actorId: "adviser" }),
      postLevyRaisedJournal({ schemeId: S, fundId: "fund-admin", scheduleId: "sched-1", totalAmount: 500, noticeCount: 1, profileId: "adviser", date: "2026-10-01", noticeIds: ["n2"] }),
      chargeInterest({ schemeId: S, noticeId: "n3", interestAmount: 5, actorId: "adviser", alreadyVerified: true }),
      authoriseSupplierInvoice({ schemeId: S, invoiceId: "inv-1", actorId: "treasurer" }),
    ]);
    expect(numbers()).toEqual(["JE-0001", "JE-0002", "JE-0003", "JE-0004", "JE-0005"]);
    expect(sharedFake.globalCallsUnderLock).toEqual([]);
  });
});

describe("rechecked under the lock", () => {
  it("a receipt that commits while the NSW interest charge waits is kept", async () => {
    await Promise.all([
      // A $100 receipt on n3, committed while the charge queues for the building.
      holdBuilding((tx) => recordLevyPaymentIn(tx as never, "n3", 100, { paymentDate: "2026-10-10", recordedBy: "adviser", captureFee: false })),
      later(() => chargeInterest({ schemeId: S, noticeId: "n3", interestAmount: 5, actorId: "adviser", alreadyVerified: true })),
    ]);
    const n3 = sharedFake.table("LevyNotice").find((n) => n.id === "n3")!;
    // $500 levy plus $5 interest, less the $100 paid: the receipt is not wiped out.
    expect([n3.amountPaid, n3.interestCharged, n3.balanceOutstanding]).toEqual(["100", "5", "405"]);
  });

  it("invoice approval in a closed period leaves the invoice exactly as it was", async () => {
    setup([{ id: "p-10", schemeId: S, name: "October 2026", startDate: "2026-10-01", endDate: "2026-10-31", status: "CLOSED" }]);
    const before = { ...sharedFake.table("SupplierInvoice")[0] };
    await expect(authoriseSupplierInvoice({ schemeId: S, invoiceId: "inv-1", actorId: "treasurer" })).rejects.toThrow("Cannot post to a closed period (October 2026).");
    expect(sharedFake.table("SupplierInvoice")[0]).toEqual(before);
    expect(sharedFake.table("PaymentAuthorisation")).toHaveLength(0);
    expect(sharedFake.table("JournalEntry")).toHaveLength(0);
    // Once the period is open again, the same approval goes through.
    sharedFake.table("FinancialPeriod")[0].status = "OPEN";
    await authoriseSupplierInvoice({ schemeId: S, invoiceId: "inv-1", actorId: "treasurer" });
    expect(sharedFake.table("SupplierInvoice")[0]).toMatchObject({ status: "APPROVED", approvedBy: "treasurer" });
    expect(sharedFake.table("JournalEntry")).toHaveLength(1);
  });

  it("an invoice approval whose journal fails leaves the invoice as it was", async () => {
    fail.entryType = "AUTO";
    await expect(authoriseSupplierInvoice({ schemeId: S, invoiceId: "inv-1", actorId: "treasurer" })).rejects.toThrow("The AUTO journal could not be written.");
    expect(sharedFake.table("SupplierInvoice")[0].status).toBe("AWAITING_APPROVAL");
    expect(sharedFake.table("PaymentAuthorisation")).toHaveLength(0);
  });

  it("a refund paid twice at once is paid once", async () => {
    credit("50.00");
    sharedFake.table("OwnerCreditRefund").push({ id: "rf-1", schemeId: S, lotId: "lot-1", fundId: "fund-admin", ownerId: "owner-1", amount: "50.00", payeeName: "Owner One", status: "APPROVED", preparedById: "adviser" });
    const payRefund = () => recordOwnerCreditRefundPaid({ schemeId: S, refundId: "rf-1", actorId: "treasurer", paidOn: "2026-10-16" });
    const results = await Promise.all([outcome(payRefund()), outcome(payRefund())]);
    expect(results.sort()).toEqual(["This refund has already been paid.", "done"]);
    expect(sharedFake.table("OwnerCreditTransaction").filter((t) => t.type === "REFUNDED")).toHaveLength(1);
    expect(sharedFake.table("JournalEntry")).toHaveLength(1);
    expect(sharedFake.table("OwnerCreditBalance")[0].balance).toBe("0");
  });

  it("NSW credit applied reads refunds requested while it waited", async () => {
    credit("50.00");
    const [, applied] = await Promise.all([
      // $30 of the $50 asked to be refunded while the application queues.
      holdBuilding((tx) =>
        tx.orm.public.OwnerCreditRefund.create({ schemeId: S, lotId: "lot-1", fundId: "fund-admin", ownerId: "owner-1", amount: "30.00", payeeName: "Owner One", status: "AWAITING_APPROVAL", preparedById: "adviser" }),
      ),
      later(() => applyOwnerCredit({ schemeId: S, actorId: "adviser", date: "2026-10-16" })),
    ]);
    expect(applied).toBe(2_000);
    expect(sharedFake.table("LevyPayment").map((p) => [p.levyNoticeId, p.amount])).toEqual([["n3", "20"]]);
  });

  it("a manual allocation waits for an auto-match on the same line and sees it", async () => {
    const { journalEntryId } = await pay("n1", 50_000, "2026-10-05");
    const [, manual] = await Promise.all([
      // As the auto-match does: the whole line matched, while the manual allocation queues.
      holdBuilding(async (tx) => {
        await tx.orm.public.BankTransactionAllocation.create({ schemeId: S, bankTransactionId: "bt-1", journalEntryId, amount: "500", createdBy: null });
        await tx.orm.public.BankTransaction.where((t: { id: { eq: (v: string) => unknown } }) => t.id.eq("bt-1")).update({ reconciliationStatus: "MATCHED" });
      }),
      later(() => outcome(allocateBankTransaction({ schemeId: S, transactionId: "bt-1", requests: [{ journalEntryId: journalEntryId!, amountCents: 50_000 }], actorId: "adviser" }))),
    ]);
    expect(manual).toMatch(/is more than the \$0\.00 left/);
    expect(sharedFake.table("BankTransactionAllocation")).toHaveLength(1);
  });
});

describe("the lock timeout", () => {
  it("every numbered transaction waits at most 5 seconds for a lock", async () => {
    await pay("n1");
    expect(sharedFake.statements).toEqual(["SET LOCAL lock_timeout = '5s'"]);
  });

  it("a writer that waits too long for the building is told it is busy, with nothing written", async () => {
    sharedFake.setLockTimeoutMs(20);
    const [, error] = await Promise.all([holdBuilding(undefined, 80), later(() => pay("n1").then(() => null, (e: unknown) => e))]);
    expect(error).toBeInstanceOf(JournalBusyError);
    expect((error as Error).message).toBe("Another change to this building's accounts is being saved. Wait a moment and try again.");
    nothingWritten();
  });
});
