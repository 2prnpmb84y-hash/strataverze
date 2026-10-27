/**
 * Journal numbering under the building's lock: the writers outside receipting
 * (27 Oct 2026). The invoice payment, manual and adjustment journals, the
 * matching-rule auto-match and the data migration cutover each take the
 * building's numbering lock first, and write their journal with the rest of
 * their records, or none of it. Run on the fake database with entry numbers
 * unique per building.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/queries/activity-log", () => ({ logActivity: vi.fn(), getAuditTrailForExport: vi.fn(), formatAuditTrailCsv: vi.fn() }));
vi.mock("@/lib/billing/capture", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/billing/capture")>()), captureTransactionFee: vi.fn() }));
vi.mock("@/lib/auth/mfa-enforcement", () => ({
  requireRecentMfa: vi.fn(async () => {}),
  getMfaStatus: vi.fn(async () => null),
  enforceMfa: vi.fn(async () => {}),
  enforceMfaFor: vi.fn(async () => {}),
  StepUpRequiredError: class extends Error {},
}));
vi.mock("@/lib/auth/require-membership", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/require-membership")>()),
  requireSchemeMembership: vi.fn(async () => ({ profile: { id: "adviser" } })),
}));

const fail = vi.hoisted(() => ({ entryType: null as string | null }));
vi.mock("@/lib/queries/journal-entries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/queries/journal-entries")>();
  const { sharedFake } = await import("@/test/fake-orm");
  return {
    ...actual,
    // As the real one (the fake ignores orderBy): the highest JE number for the building, plus one,
    // read through the orm it is given, giving way before the caller writes.
    getNextEntryNumber: async (schemeId: string, orm = sharedFake.db.orm) => {
      const rows = await orm.public.JournalEntry.where((je: { schemeId: { eq: (v: string) => unknown } }) => je.schemeId.eq(schemeId)).limit(100000).all();
      const highest = rows.filter((e) => String(e.entryNumber).startsWith("JE-")).reduce((max, e) => Math.max(max, Number(String(e.entryNumber).replace(/\D/g, "")) || 0), 0);
      await new Promise((resolve) => setTimeout(resolve, 0));
      return `JE-${String(highest + 1).padStart(4, "0")}`;
    },
    createJournalEntry: async (data: Parameters<typeof actual.createJournalEntry>[0], orm?: Parameters<typeof actual.createJournalEntry>[1]) => {
      if (fail.entryType && data.entryType === fail.entryType) throw new Error(`The ${data.entryType} journal could not be written.`);
      return actual.createJournalEntry(data, orm);
    },
  };
});
vi.mock("@/lib/queries/account-codes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/queries/account-codes")>();
  const { sharedFake } = await import("@/test/fake-orm");
  return {
    ...actual,
    getSystemAccountBySubType: async (_s: string, subType: string) =>
      sharedFake.db.orm.public.AccountCode.where((a: { id: { eq: (v: string) => unknown } }) => a.id.eq(`acc-${subType}`)).first(),
  };
});
// The cutover's files are taken as ready: the test is about how it writes, not how it reads them.
vi.mock("./migration-cutover", async (importOriginal) => ({ ...(await importOriginal<typeof import("./migration-cutover")>()), executionProblem: () => null }));

const { sharedFake } = await import("@/test/fake-orm");
const actions = await import("@/app/(portal)/adviser/schemes/[id]/finance/actions");
const { autoMatchTransactions } = await import("@/lib/queries/matching-rules");
const { executeCutover } = await import("./migration-batches");
const { lockJournalNumbering } = await import("@/lib/queries/journal-numbering");

const S = "44444444-0000-0000-0000-00000000dddd";
const account = (subType: string, accountType: string) => ({
  id: `acc-${subType}`,
  schemeId: S,
  code: subType.slice(0, 6),
  name: subType,
  accountType,
  accountSubType: subType,
  fundId: "fund-admin",
  isActive: true,
  isSystemAccount: true,
});

function setup(periods: Record<string, unknown>[] = []) {
  sharedFake.reset({
    Scheme: [{ id: S, state: "NSW", interestMode: "STATUTORY", timeZone: "Australia/Sydney", name: "Writers", financialYearEnd: "06-30" }],
    Fund: [{ id: "fund-admin", schemeId: S, fundType: "ADMINISTRATIVE", name: "Administrative Fund", isActive: true }],
    Lot: [{ id: "lot-1", schemeId: S, lotNumber: "1" }],
    AccountCode: [account("BANK", "ASSET"), account("ACCOUNTS_PAYABLE", "LIABILITY"), account("REPAIRS", "EXPENSE"), account("SUNDRY_INCOME", "INCOME")],
    JournalEntry: [],
    JournalLine: [],
    FinancialPeriod: periods,
    SupplierInvoice: [
      { id: "inv-1", schemeId: S, supplierId: "sup-1", fundId: "fund-admin", accountCodeId: "acc-REPAIRS", invoiceNumber: "INV-1", totalAmount: "220.00", gstAmount: "0", amountPaid: "0", balanceOutstanding: "220.00", status: "APPROVED", preparedById: "preparer" },
    ],
    Supplier: [{ id: "sup-1", schemeId: S, companyName: "Plumber", contractorBusinessId: null }],
    PaymentAuthorisation: [{ id: "pa-1", schemeId: S, supplierInvoiceId: "inv-1", approverId: "treasurer", sequence: 1 }],
    PlatformInvoice: [],
    SupplierBankDetailVersion: [],
    BankTransaction: [
      { id: "bt-1", schemeId: S, bankAccountId: "sba-1", amount: "120.00", transactionDate: "2026-10-06", description: "UNKNOWN DEPOSIT", reference: null, reconciliationStatus: "UNMATCHED", isDuplicate: false, matchedJournalEntryId: null },
    ],
    BankTransactionAllocation: [],
    MatchingRule: [
      {
        id: "rule-1",
        schemeId: S,
        name: "Unknown deposits",
        isActive: true,
        priority: 1,
        matchType: "DESCRIPTION",
        descriptionPattern: "unknown",
        referencePattern: null,
        exactAmount: null,
        minAmount: null,
        maxAmount: null,
        transactionSign: null,
        targetAccountCodeId: "acc-SUNDRY_INCOME",
        targetFundId: "fund-admin",
        autoPost: true,
        matchCount: 0,
      },
    ],
    MigrationBatch: [{ id: "batch-1", schemeId: S, status: "SIGNED_OFF", cutoverDate: "2026-09-30", files: {}, signOff: {}, sourceSystem: "OTHER" }],
    SchemeMembership: [],
    LevyNotice: [],
  });
  sharedFake.setUniqueKeys({ JournalEntry: [["schemeId", "entryNumber"]] });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Run a writer and check it took the building's lock first, in a transaction, with no global call under it. */
const takesTheLock = async <T>(write: () => Promise<T>) => {
  const before = sharedFake.locks.length;
  const result = await write();
  expect(sharedFake.locks.slice(before)[0]).toEqual({ table: "Scheme", ids: [S], inTransaction: true });
  expect(sharedFake.globalCallsUnderLock).toEqual([]);
  return result;
};
const lines = [
  { accountCodeId: "acc-REPAIRS", fundId: "fund-admin", debit: 10 },
  { accountCodeId: "acc-BANK", fundId: "fund-admin", credit: 10 },
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T01:00:00.000Z"));
  fail.entryType = null;
  setup();
});

describe("invoice payment", () => {
  const payInvoice = () => actions.recordInvoicePaymentAction(S, "inv-1", 220, "2026-10-18");

  it("takes the lock and writes the payment with its journal", async () => {
    expect(await takesTheLock(payInvoice)).toEqual({ success: true });
    expect(sharedFake.table("SupplierInvoice")[0]).toMatchObject({ amountPaid: "220", status: "PAID" });
    expect(sharedFake.table("JournalEntry")).toMatchObject([{ entryNumber: "JE-0001", sourceType: "PAYMENT", status: "POSTED" }]);
  });

  it("rolls the payment back when its journal fails", async () => {
    fail.entryType = "AUTO";
    expect(await payInvoice()).toHaveProperty("error");
    expect(sharedFake.table("SupplierInvoice")[0]).toMatchObject({ amountPaid: "0", status: "APPROVED" });
    expect(sharedFake.table("JournalEntry")).toHaveLength(0);
  });
});

describe("manual and adjustment journals", () => {
  const manual = () => actions.createJournalEntryAction(S, { transactionDate: "2026-10-18", description: "Correction", entryType: "MANUAL", sourceType: "MANUAL", lines });

  it("two manual journals at once take different numbers, under the lock", async () => {
    await takesTheLock(manual);
    await Promise.all([manual(), manual()]);
    expect(sharedFake.table("JournalEntry").map((e) => [e.entryNumber, e.status])).toEqual([
      ["JE-0001", "DRAFT"],
      ["JE-0002", "DRAFT"],
      ["JE-0003", "DRAFT"],
    ]);
  });

  it("an adjustment takes the lock, and one that cannot be posted leaves no draft", async () => {
    const adjust = () => actions.createAdjustmentEntryAction(S, { transactionDate: "2026-10-18", description: "Year end", lines });
    expect(await takesTheLock(adjust)).toMatchObject({ success: true });
    expect(sharedFake.table("JournalEntry")).toMatchObject([{ entryNumber: "JE-0001", entryType: "ADJUSTMENT", status: "POSTED" }]);
    setup([{ id: "p-10", schemeId: S, name: "October 2026", startDate: "2026-10-01", endDate: "2026-10-31", status: "LOCKED" }]);
    expect(await adjust()).toEqual({ error: "This period is locked. Contact your system administrator to unlock. (October 2026)" });
    expect(sharedFake.table("JournalEntry")).toHaveLength(0);
    expect(sharedFake.table("JournalLine")).toHaveLength(0);
  });
});

describe("matching-rule auto-match", () => {
  it("takes the lock and writes the journal, its lines, the allocation and the match together", async () => {
    expect(await takesTheLock(() => autoMatchTransactions(S, undefined, "adviser"))).toMatchObject({ matched: 1 });
    expect(sharedFake.table("JournalEntry")).toMatchObject([{ entryNumber: "AM-0001", sourceType: "BANK_IMPORT", status: "POSTED" }]);
    expect(sharedFake.table("JournalLine")).toHaveLength(2);
    expect(sharedFake.table("BankTransaction")[0]).toMatchObject({ reconciliationStatus: "MATCHED", matchingRuleId: "rule-1" });
  });

  it("rolls everything back when a write fails part way", async () => {
    // The allocation is refused (a duplicate), after the journal and its lines are written.
    sharedFake.setUniqueKeys({ BankTransactionAllocation: [["bankTransactionId"]] });
    sharedFake.table("BankTransactionAllocation").push({ id: "old", schemeId: S, bankTransactionId: "bt-1", journalEntryId: "x", amount: "0" });
    await expect(autoMatchTransactions(S, undefined, "adviser")).rejects.toThrow("duplicate key");
    expect(sharedFake.table("JournalEntry")).toHaveLength(0);
    expect(sharedFake.table("JournalLine")).toHaveLength(0);
    expect(sharedFake.table("BankTransaction")[0].reconciliationStatus).toBe("UNMATCHED");
  });

  it("two runs at once match the line once", async () => {
    const results = await Promise.all([autoMatchTransactions(S, undefined, "adviser"), autoMatchTransactions(S, undefined, "adviser")]);
    expect(results.map((r) => r.matched).sort()).toEqual([0, 1]);
    expect(sharedFake.table("JournalEntry")).toHaveLength(1);
    expect(sharedFake.table("BankTransactionAllocation")).toHaveLength(1);
  });
});

describe("data migration cutover", () => {
  const execute = () => executeCutover({ schemeId: S, batchId: "batch-1", actorId: "adviser" });

  it("takes the lock and posts the opening balances numbered under it", async () => {
    await takesTheLock(execute);
    expect(sharedFake.table("JournalEntry")).toMatchObject([{ entryNumber: "JE-0001", entryType: "OPENING_BALANCE", status: "POSTED" }]);
    expect(sharedFake.table("MigrationBatch")[0].status).toBe("EXECUTED");
  });

  it("rolls the opening balances back when a later write fails", async () => {
    // Marking the batch executed is refused (a duplicate), after the opening balances are written.
    sharedFake.table("MigrationBatch").push({ id: "other", schemeId: "another-scheme", status: "EXECUTED" });
    sharedFake.setUniqueKeys({ MigrationBatch: [["status"]] });
    await expect(execute()).rejects.toThrow("duplicate key");
    expect(sharedFake.table("JournalEntry")).toHaveLength(0);
    expect(sharedFake.table("MigrationBatch")[0].status).toBe("SIGNED_OFF");
  });

  it("a cutover executed while it waited for the building is not run again", async () => {
    const [, second] = await Promise.all([
      sharedFake.db.transaction(async (tx) => {
        await lockJournalNumbering(tx as never, S);
        await sleep(30);
        await tx.orm.public.MigrationBatch.create({ schemeId: S, status: "EXECUTED", sourceSystem: "OTHER" });
      }),
      sleep(5).then(() => execute().then(() => "done", (e: Error) => e.message)),
    ]);
    expect(second).toBe("A cutover has already been executed for this scheme.");
    expect(sharedFake.table("JournalEntry")).toHaveLength(0);
  });
});
