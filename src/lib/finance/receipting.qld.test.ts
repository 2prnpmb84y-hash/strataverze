/**
 * Queensland receipting: payments go first to the penalty, then to the
 * contribution (Standard Module s 166(5); QLD stage 2, go-live gap 1).
 *
 * The penalty engine (monthlyPenalty) is the one source of the penalty
 * charged. Receipting and applying owner credit lock the notice, charge the
 * engine's penalty to the payment date under the lock, then apply the payment
 * to the penalty first and record that part on the payment. The parts
 * recorded on live payments are the one source of the penalty paid, used by
 * receipting, lotArrears and the engine. The receivable credit shows the
 * penalty and contribution parts, and a reversal undoes both.
 *
 * A contribution of $1,000 due 31 January 2026; month marks 28 February,
 * 31 March, 30 April and 31 May. At 2.5% a month a whole month is $25.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/queries/activity-log", () => ({ logActivity: vi.fn(), getAuditTrailForExport: vi.fn(), formatAuditTrailCsv: vi.fn() }));
vi.mock("@/lib/billing/capture", () => ({ captureTransactionFee: vi.fn() }));
vi.mock("@/lib/finance/bank-allocations", () => ({ allocateBankTransaction: vi.fn(), syncTransaction: vi.fn() }));
vi.mock("@/lib/queries/journal-entries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/queries/journal-entries")>();
  const { sharedFake } = await import("@/test/fake-orm");
  return {
    ...actual,
    // As the real one: the highest number for the building, plus one. It reads, then
    // gives way before the caller writes, so two callers not serialised take the same number.
    getNextEntryNumber: async (schemeId: string) => {
      const highest = sharedFake
        .table("JournalEntry")
        .filter((e) => e.schemeId === schemeId)
        .reduce((max, e) => Math.max(max, Number(String(e.entryNumber).replace(/\D/g, "")) || 0), 0);
      await new Promise((resolve) => setTimeout(resolve, 0));
      return `JE-${String(highest + 1).padStart(4, "0")}`;
    },
    createJournalEntry: async (data: Record<string, unknown>) => {
      const lines = (data.lines as Array<Record<string, unknown>>).map((l) => ({ supplierId: null, gstAmount: null, lotId: null, ...l }));
      return sharedFake.db.orm.public.JournalEntry.create({ ...data, lines, status: "DRAFT" });
    },
    postJournalEntry: async (id: string) => {
      await sharedFake.db.orm.public.JournalEntry.where({ id }).update({ status: "POSTED" });
    },
  };
});
// Account lookups read through the global db, as the real ones do, so a lookup made under a lock is seen.
vi.mock("@/lib/queries/account-codes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/queries/account-codes")>();
  const { sharedFake } = await import("@/test/fake-orm");
  return {
    ...actual,
    getSystemAccountBySubType: async (_s: string, subType: string) => {
      await sharedFake.db.orm.public.AccountCode.where((a: { id: { eq: (v: string) => unknown } }) => a.id.eq(`acc-${subType}`)).first();
      return { id: `acc-${subType}`, fundId: "fund-admin" };
    },
  };
});
vi.mock("@/lib/queries/seed-chart-of-accounts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/queries/seed-chart-of-accounts")>();
  const { sharedFake } = await import("@/test/fake-orm");
  return {
    ...actual,
    ensureLeviesInAdvanceAccount: async (_s: string, fundId: string) => {
      await sharedFake.db.orm.public.AccountCode.where((a: { id: { eq: (v: string) => unknown } }) => a.id.eq("acc-ADVANCE")).first();
      return { id: "acc-ADVANCE", fundId };
    },
  };
});
// A Queensland building (the test gives it the pack directly, as it did while the pack was pending).
vi.mock("@/lib/jurisdiction/scheme-rules", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jurisdiction/scheme-rules")>("@/lib/jurisdiction/scheme-rules");
  const { QLD_RULE_PACK } = await import("@/config/statutory");
  const forState = (state: string | null | undefined) =>
    state === "QLD-SHAPED" ? { pack: null, rules: QLD_RULE_PACK.rules, label: "AU-QLD test" } : actual.rulesForState(state);
  return {
    ...actual,
    rulesForState: forState,
    rulesForScheme: async (schemeId: string) => {
      const { sharedFake } = await import("@/test/fake-orm");
      return forState(sharedFake.table("Scheme").find((s) => s.id === schemeId)?.state as string);
    },
  };
});

const { sharedFake } = await import("@/test/fake-orm");
const { receiptLevyPayment, receiptLevyPayments } = await import("./levy-receipts");
const { applyOwnerCredit } = await import("./owner-credits");
const { reverseLevyReceipt } = await import("./levy-receipt-reversal");
const { statutoryInterestForScheme } = await import("./interest-setting");
const { chargeInterestBatch } = await import("@/lib/queries/interest");
const { lotArrears } = await import("@/lib/debt-recovery/payment-plan-requests");
const { QLD_RULE_PACK } = await import("@/config/statutory");
const { lateChargeFirst, lateChargePart, monthlyPenalty } = await import("./statutory-interest");

const Q = "22222222-0000-0000-0000-00000000qqqq";
const QLD = QLD_RULE_PACK.rules;
const ORDER = QLD.PAYMENT_ALLOCATION_ORDER;

const baseNotice = {
  id: "n1",
  schemeId: Q,
  levyScheduleId: "sched-1",
  lotId: "lot-1",
  ownerId: "owner-1",
  fundId: "fund-admin",
  fund: { fundType: "ADMINISTRATIVE" },
  noticeNumber: "C-1",
  dueDate: "2026-01-31",
  amountDue: "1000.00",
  amountPaid: "0",
  balanceOutstanding: "1000.00",
  interestCharged: "0",
  migratedInterestCharged: "0",
  migratedInterestPaid: "0",
  status: "ISSUED",
  issuedAt: "2026-01-01T00:00:00.000Z",
  migrationBatchId: null,
  paidInFullAt: null,
  levySchedule: { levyType: "ADMIN" },
};

function setup(
  opts: { mode?: string; rate?: string | null; notice?: Record<string, unknown>; state?: string; periods?: Record<string, unknown>[]; secondNotice?: boolean } = {},
) {
  sharedFake.reset({
    Scheme: [
      {
        id: Q,
        state: opts.state ?? "QLD-SHAPED",
        interestMode: opts.mode ?? "RESOLVED_RATE",
        lateChargeMonthlyRatePercent: opts.rate === undefined ? "2.50" : opts.rate,
        timeZone: opts.state === "NSW" ? "Australia/Sydney" : "Australia/Brisbane",
      },
    ],
    Fund: [{ id: "fund-admin", schemeId: Q, fundType: "ADMINISTRATIVE", name: "Administrative fund" }],
    Lot: [{ id: "lot-1", schemeId: Q, lotNumber: "1" }],
    // The accounts a penalty journal posts to, for the fund check.
    AccountCode: [
      { id: "acc-ACCOUNTS_RECEIVABLE", schemeId: Q, code: "1100", name: "Receivable", accountSubType: "ACCOUNTS_RECEIVABLE", fundId: "fund-admin" },
      { id: "acc-INTEREST_INCOME", schemeId: Q, code: "4200", name: "Penalty income", accountSubType: "INTEREST_INCOME", fundId: "fund-admin" },
      { id: "acc-BANK", schemeId: Q, code: "1000", name: "Bank", accountSubType: "BANK", fundId: "fund-admin" },
      { id: "acc-ADVANCE", schemeId: Q, code: "2300", name: "Contributions in advance", accountSubType: "LEVIES_IN_ADVANCE", fundId: "fund-admin" },
    ],
    LevyNotice: [
      { ...baseNotice, ...(opts.notice ?? {}) },
      ...(opts.secondNotice ? [{ ...baseNotice, id: "n0", noticeNumber: "C-0", amountDue: "600.00", balanceOutstanding: "600.00" }] : []),
    ],
    LevyPayment: [],
    OwnerCreditTransaction: [],
    OwnerCreditBalance: [],
    OwnerCreditRefund: [],
    JournalEntry: [],
    JournalLine: [],
    BankTransactionAllocation: [],
    BankTransaction: [],
    FinancialPeriod: opts.periods ?? [],
  });
  // Entry numbers are unique per building, as in the database, and an entry includes its lines.
  sharedFake.setUniqueKeys({ JournalEntry: [["schemeId", "entryNumber"]] });
  sharedFake.setRelations({ JournalEntry: { lines: { table: "JournalLine", foreignKey: "journalEntryId" } } });
}

/** Run as if it were noon in Brisbane on this day. */
const onDay = (day: string) => vi.setSystemTime(new Date(`${day}T02:00:00.000Z`));
const notice = () => sharedFake.table("LevyNotice").find((n) => n.id === "n1")!;
const cents = (v: unknown) => Math.round(Number(v ?? 0) * 100);
const state = () => {
  const n = notice();
  return { penalty: cents(n.interestCharged), paid: cents(n.amountPaid), balance: cents(n.balanceOutstanding), status: n.status };
};
const entries = (type: string) => sharedFake.table("JournalEntry").filter((e) => e.entryType === type);
/** A journal's lines: on the entry (the journal mock) or rows of their own (a reversal, a penalty posted under the lock). */
const linesOf = (entry: Record<string, unknown>) =>
  (entry.lines as Array<Record<string, unknown>> | undefined) ?? sharedFake.table("JournalLine").filter((l) => l.journalEntryId === entry.id);
/** The receivable lines of a journal: amount and description. */
const receivableLines = (entry: Record<string, unknown>) =>
  linesOf(entry)
    .filter((l) => l.accountCodeId === "acc-ACCOUNTS_RECEIVABLE")
    .map((l) => ({ credit: cents(l.credit), debit: cents(l.debit), description: l.description }));
/** The penalty charged in each penalty journal, in cents. */
const penaltiesCharged = () => entries("INTEREST").map((e) => cents(linesOf(e).find((l) => l.accountCodeId === "acc-INTEREST_INCOME")!.credit));
/** The penalty part recorded on each payment, in cents. */
const parts = () => sharedFake.table("LevyPayment").map((p) => [cents(p.amount), cents(p.lateChargeAmount)]);
const pay = (amountCents: number, paymentDate: string, extra: { confirmOverpayment?: boolean } = {}) =>
  receiptLevyPayment({ schemeId: Q, levyNoticeId: "n1", amountCents, paymentDate, actorId: "adviser", ...extra });
const engine = async (asAt: string) => (await statutoryInterestForScheme(Q, asAt)).find((x) => x.noticeId === "n1");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  setup();
});

describe("the payment order", () => {
  it("Queensland's order puts the penalty first, NSW's and no order the levy first", () => {
    expect(lateChargeFirst(ORDER)).toBe(true);
    expect(lateChargeFirst(["LEVY", "INTEREST", "RECOVERY_COSTS"])).toBe(false);
    expect(lateChargeFirst(undefined)).toBe(false);
  });

  it("the engine applies each payment as its penalty part was recorded", () => {
    const input = (lateChargeCents: number) => ({ levyCents: 100_000, dueDate: "2026-01-31", payments: [{ date: "2026-03-05", amountCents: 50_000, lateChargeCents }], asAt: "2026-04-01" });
    // $25 of the payment recorded as penalty: $525 of the contribution unpaid at 31 March, so $13.13.
    expect(monthlyPenalty(input(2_500), { monthlyRatePercent: 2.5 }).interestCents).toBe(2_500 + 1_313);
    // Recorded as all contribution: $500 unpaid, so $12.50.
    expect(monthlyPenalty(input(0), { monthlyRatePercent: 2.5 }).interestCents).toBe(2_500 + 1_250);
  });

  it("a payment's penalty part is capped by what is charged and unpaid, and by what had accrued by its date", () => {
    // $75 charged, none paid, but only $25 had accrued by the payment's date.
    expect(lateChargePart(100_000, { chargedCents: 7_500, chargePaidCents: 0, accruedByDateCents: 2_500, chargePaidByDateCents: 0 })).toBe(2_500);
    // $25 charged and already paid: nothing more goes to it.
    expect(lateChargePart(100_000, { chargedCents: 2_500, chargePaidCents: 2_500, accruedByDateCents: 2_500, chargePaidByDateCents: 2_500 })).toBe(0);
  });
});

describe("Queensland receipting, penalty first", () => {
  it("a part payment after a month mark: the month's penalty is charged, then paid first", async () => {
    onDay("2026-03-05");
    const r = await pay(50_000, "2026-03-05");
    expect(r).toMatchObject({ appliedCents: 50_000, excessCents: 0 });
    // The penalty to the payment date was charged first (DR receivable, CR penalty income), posted with the payment.
    expect(entries("INTEREST")).toHaveLength(1);
    expect(entries("INTEREST")[0].status).toBe("POSTED");
    expect(linesOf(entries("INTEREST")[0]).map((l) => [l.accountCodeId, cents(l.debit), cents(l.credit)])).toEqual([
      ["acc-ACCOUNTS_RECEIVABLE", 2_500, 0],
      ["acc-INTEREST_INCOME", 0, 2_500],
    ]);
    expect(state()).toEqual({ penalty: 2_500, paid: 50_000, balance: 52_500, status: "PARTIALLY_PAID" });
    expect(parts()).toEqual([[50_000, 2_500]]);
    // The receivable credit in two parts, penalty first, in Queensland's words.
    expect(receivableLines(entries("AUTO")[0])).toEqual([
      { credit: 2_500, debit: 0, description: "Penalty receivable reduced, notice C-1" },
      { credit: 47_500, debit: 0, description: "Contributions receivable reduced, notice C-1" },
    ]);
    expect(await lotArrears(Q, "lot-1", "2026-03-06", ORDER)).toEqual({ leviesCents: 52_500, interestCents: 0 });

    // The next month's penalty is on the $525 of the contribution unpaid: $13.13.
    expect(await engine("2026-04-01")).toMatchObject({ interestCents: 2_500 + 1_313, previouslyChargedCents: 2_500, additionalCents: 1_313 });
    onDay("2026-04-01");
    await chargeInterestBatch({ schemeId: Q, actorId: "adviser" });
    expect(await lotArrears(Q, "lot-1", "2026-04-01", ORDER)).toEqual({ leviesCents: 52_500, interestCents: 1_313 });
    expect(state()).toEqual({ penalty: 3_813, paid: 50_000, balance: 53_813, status: "PARTIALLY_PAID" });
  });

  it("a payment covering the penalty only leaves the whole contribution unpaid", async () => {
    onDay("2026-03-05");
    await pay(2_500, "2026-03-05");
    expect(state()).toEqual({ penalty: 2_500, paid: 2_500, balance: 100_000, status: "PARTIALLY_PAID" });
    expect(receivableLines(entries("AUTO")[0])).toEqual([{ credit: 2_500, debit: 0, description: "Penalty receivable reduced, notice C-1" }]);
    expect(await lotArrears(Q, "lot-1", "2026-03-06", ORDER)).toEqual({ leviesCents: 100_000, interestCents: 0 });
    expect(await engine("2026-04-01")).toMatchObject({ additionalCents: 2_500 });
  });

  it("a full payment pays the penalty and the contribution, and the notice is paid", async () => {
    onDay("2026-03-05");
    await pay(102_500, "2026-03-05");
    expect(state()).toEqual({ penalty: 2_500, paid: 102_500, balance: 0, status: "PAID" });
    expect(notice().paidInFullAt).toBeTruthy();
    expect(receivableLines(entries("AUTO")[0]).map((l) => l.credit)).toEqual([2_500, 100_000]);
    expect(await lotArrears(Q, "lot-1", "2026-06-01", ORDER)).toEqual({ leviesCents: 0, interestCents: 0 });
    expect(await engine("2026-06-01")).toBeUndefined();
  });

  it("an overpayment: the penalty is owed too, and only the rest is held as credit", async () => {
    onDay("2026-03-05");
    // Refused until confirmed, with the penalty counted, and nothing written by the refused attempt.
    await expect(pay(110_000, "2026-03-05")).rejects.toThrow("This payment is $75.00 more than notice C-1 owes.");
    expect(state()).toEqual({ penalty: 0, paid: 0, balance: 100_000, status: "ISSUED" });
    expect(entries("INTEREST")).toHaveLength(0);

    const r = await pay(110_000, "2026-03-05", { confirmOverpayment: true });
    expect(r).toMatchObject({ appliedCents: 102_500, excessCents: 7_500 });
    expect(state()).toEqual({ penalty: 2_500, paid: 102_500, balance: 0, status: "PAID" });
    expect(linesOf(entries("AUTO")[0]).map((l) => [l.accountCodeId, cents(l.debit), cents(l.credit)])).toEqual([
      ["acc-BANK", 110_000, 0],
      ["acc-ACCOUNTS_RECEIVABLE", 0, 2_500],
      ["acc-ACCOUNTS_RECEIVABLE", 0, 100_000],
      ["acc-ADVANCE", 0, 7_500],
    ]);
    expect(sharedFake.table("OwnerCreditTransaction").map((t) => [t.type, t.amount])).toEqual([["OVERPAYMENT", "75"]]);
  });

  it("reversing a penalty-first payment undoes both parts, and the penalty it held off is charged", async () => {
    onDay("2026-03-05");
    await pay(50_000, "2026-03-05");
    const receipt = entries("AUTO")[0];
    onDay("2026-03-10");
    await reverseLevyReceipt({ schemeId: Q, journalEntryId: String(receipt.id), reason: "DISHONOURED", reversalDate: "2026-03-10", actorId: "adviser" });
    // The penalty charged stays charged: the payment never paid it.
    expect(state()).toEqual({ penalty: 2_500, paid: 0, balance: 102_500, status: "ISSUED" });
    expect(receivableLines(entries("REVERSAL")[0])).toEqual([
      { credit: 0, debit: 2_500, description: "Reversal: Penalty receivable reduced, notice C-1" },
      { credit: 0, debit: 47_500, description: "Reversal: Contributions receivable reduced, notice C-1" },
    ]);
    expect(await lotArrears(Q, "lot-1", "2026-03-11", ORDER)).toEqual({ leviesCents: 100_000, interestCents: 2_500 });
    expect(await engine("2026-04-01")).toMatchObject({ additionalCents: 2_500 });

    // A later payment meets both months' penalty first: none of it was paid by the dishonoured payment.
    onDay("2026-04-02");
    await pay(3_000, "2026-04-02");
    expect(state()).toEqual({ penalty: 5_000, paid: 3_000, balance: 102_000, status: "PARTIALLY_PAID" });
    expect(receivableLines(entries("AUTO").at(-1)!)).toEqual([{ credit: 3_000, debit: 0, description: "Penalty receivable reduced, notice C-1" }]);
    expect(await lotArrears(Q, "lot-1", "2026-04-03", ORDER)).toEqual({ leviesCents: 100_000, interestCents: 2_000 });
  });

  it("with no penalty (NONE, the default until a resolution) the payment goes to the contribution", async () => {
    setup({ mode: "NONE", rate: null });
    onDay("2026-03-05");
    await pay(50_000, "2026-03-05");
    expect(entries("INTEREST")).toHaveLength(0);
    expect(state()).toEqual({ penalty: 0, paid: 50_000, balance: 50_000, status: "PARTIALLY_PAID" });
    expect(parts()).toEqual([[50_000, 0]]);
    expect(receivableLines(entries("AUTO")[0])).toEqual([{ credit: 50_000, debit: 0, description: "Contributions receivable reduced, notice C-1" }]);
    expect(await lotArrears(Q, "lot-1", "2026-06-01", ORDER)).toEqual({ leviesCents: 50_000, interestCents: 0 });
    expect(await engine("2026-06-01")).toMatchObject({ interestCents: 0, additionalCents: 0, reason: "NO_INTEREST_RESOLUTION" });
  });

  it("NONE after a penalty was charged: payments pay that penalty first, and never more than it", async () => {
    onDay("2026-03-05");
    await chargeInterestBatch({ schemeId: Q, actorId: "adviser" });
    expect(state().penalty).toBe(2_500);
    // The resolution is rescinded: no more penalty, but the $25 charged is still owed.
    Object.assign(sharedFake.table("Scheme")[0], { interestMode: "NONE", lateChargeMonthlyRatePercent: null });
    onDay("2026-03-12");
    await pay(1_000, "2026-03-10");
    await pay(5_000, "2026-03-11");
    await pay(10_000, "2026-03-12");
    expect(parts()).toEqual([
      [1_000, 1_000],
      [5_000, 1_500],
      [10_000, 0],
    ]);
    expect(entries("INTEREST")).toHaveLength(1);
    expect(state()).toEqual({ penalty: 2_500, paid: 16_000, balance: 86_500, status: "PARTIALLY_PAID" });
    expect(await lotArrears(Q, "lot-1", "2026-03-13", ORDER)).toEqual({ leviesCents: 86_500, interestCents: 0 });
  });

  it("at a resolved rate of 1.5%: two months charged, then the part payment pays them first", async () => {
    setup({ rate: "1.50" });
    onDay("2026-04-05");
    await pay(30_000, "2026-04-05");
    expect(state()).toEqual({ penalty: 3_000, paid: 30_000, balance: 73_000, status: "PARTIALLY_PAID" });
    expect(receivableLines(entries("AUTO")[0]).map((l) => l.credit)).toEqual([3_000, 27_000]);
    expect(await engine("2026-05-01")).toMatchObject({ additionalCents: 1_095 });
    onDay("2026-05-01");
    await chargeInterestBatch({ schemeId: Q, actorId: "adviser" });
    expect(await lotArrears(Q, "lot-1", "2026-05-01", ORDER)).toEqual({ leviesCents: 73_000, interestCents: 1_095 });
  });

  it("FOR_REVIEW: paying only the contribution after a month mark leaves part of it unpaid, which keeps attracting penalty", async () => {
    onDay("2026-03-05");
    // The owner pays the $1,000 on the notice. $25 of it pays the penalty, so $25 of the contribution is still unpaid.
    await pay(100_000, "2026-03-05");
    expect(state()).toEqual({ penalty: 2_500, paid: 100_000, balance: 2_500, status: "PARTIALLY_PAID" });
    expect(await lotArrears(Q, "lot-1", "2026-03-06", ORDER)).toEqual({ leviesCents: 2_500, interestCents: 0 });
    // Each later month: 2.5% of the $25 unpaid, 63 cents (62.5 rounded half up), until it is paid.
    expect(await engine("2026-04-01")).toMatchObject({ additionalCents: 63 });
    expect(await engine("2026-05-01")).toMatchObject({ additionalCents: 126 });
    onDay("2026-05-01");
    await chargeInterestBatch({ schemeId: Q, actorId: "adviser" });
    expect(state()).toEqual({ penalty: 2_626, paid: 100_000, balance: 2_626, status: "PARTIALLY_PAID" });
    expect(await lotArrears(Q, "lot-1", "2026-05-01", ORDER)).toEqual({ leviesCents: 2_500, interestCents: 126 });
    expect(QLD.FOR_REVIEW.some((f) => f.where === "PAYMENT_ALLOCATION_ORDER")).toBe(true);
  });

  it("lotArrears follows the parts recorded payment by payment, not the totals", async () => {
    onDay("2026-03-05");
    await pay(100_000, "2026-03-05"); // $25 penalty, $975 contribution
    onDay("2026-04-02");
    await pay(30, "2026-04-02"); // the 63 cent penalty for April is charged first; 30 cents of it is paid
    expect(state()).toEqual({ penalty: 2_563, paid: 100_030, balance: 2_533, status: "PARTIALLY_PAID" });
    expect(parts()).toEqual([
      [100_000, 2_500],
      [30, 30],
    ]);
    // 33 cents of penalty and $25 of contribution unpaid. The totals would wrongly say $25.33 and no penalty.
    expect(await lotArrears(Q, "lot-1", "2026-04-03", ORDER)).toEqual({ leviesCents: 2_500, interestCents: 33 });
  });

  it("a payment dated before an earlier penalty run pays only the penalty accrued by its date", async () => {
    // The run on 2 May charges three months: $75.
    onDay("2026-05-02");
    await chargeInterestBatch({ schemeId: Q, actorId: "adviser" });
    expect(state().penalty).toBe(7_500);
    // Then a $1,000 payment the owner made on 5 March is entered. Only $25 had accrued by then.
    await pay(100_000, "2026-03-05");
    expect(parts()).toEqual([[100_000, 2_500]]);
    expect(receivableLines(entries("AUTO")[0]).map((l) => l.credit)).toEqual([2_500, 97_500]);
    expect(state()).toEqual({ penalty: 7_500, paid: 100_000, balance: 7_500, status: "PARTIALLY_PAID" });
    expect(await lotArrears(Q, "lot-1", "2026-05-02", ORDER)).toEqual({ leviesCents: 2_500, interestCents: 5_000 });
    // The engine, with the payment where it belongs, works out $26.26, less than the $75 charged.
    // What was over charged is not taken back automatically (GO-LIVE GAP in qld.ts).
    expect(await engine("2026-05-02")).toMatchObject({ interestCents: 2_626, additionalCents: 0 });
  });

  it("a takeover notice: the old system's penalty still owed is paid first, then only the penalty from takeover is charged", async () => {
    setup({
      notice: {
        amountDue: "1000.00",
        interestCharged: "40.00",
        migratedInterestCharged: "40.00",
        migratedInterestPaid: "10.00",
        amountPaid: "10.00",
        balanceOutstanding: "1030.00",
        migrationBatchId: "batch-1",
        issuedAt: "2026-03-01T00:00:00.000Z",
      },
    });
    onDay("2026-03-05");
    await pay(10_000, "2026-03-05");
    // Nothing is charged here before 31 March. The $30 of the old system's penalty unpaid is paid first.
    expect(entries("INTEREST")).toHaveLength(0);
    expect(parts()).toEqual([[10_000, 3_000]]);
    expect(state()).toEqual({ penalty: 4_000, paid: 11_000, balance: 93_000, status: "PARTIALLY_PAID" });
    expect(await lotArrears(Q, "lot-1", "2026-03-06", ORDER)).toEqual({ leviesCents: 93_000, interestCents: 0 });
    // The month to 31 March: 2.5% of the $930 unpaid.
    expect(await engine("2026-04-01")).toMatchObject({ additionalCents: 2_325 });
  });

  it("a payment dated after the building's today is refused, with nothing written", async () => {
    onDay("2026-03-05");
    await expect(pay(50_000, "2026-03-06")).rejects.toThrow("The payment date 2026-03-06 is after today (2026-03-05). Enter the day the money was received.");
    expect(state()).toEqual({ penalty: 0, paid: 0, balance: 100_000, status: "ISSUED" });
    expect(sharedFake.table("JournalEntry")).toHaveLength(0);
    // Today is the building's: at 1 am on 6 March in Brisbane (15:00 on 5 March UTC) the 6th is today.
    vi.setSystemTime(new Date("2026-03-05T15:00:00.000Z"));
    await expect(pay(50_000, "2026-03-06")).resolves.toMatchObject({ appliedCents: 50_000 });
  });
});

describe("Queensland receipting at the same moment", () => {
  it("two receipts at once charge the penalty once: the second waits on the notice's lock and works it out again", async () => {
    onDay("2026-03-05");
    await Promise.all([pay(50_000, "2026-03-05"), pay(50_000, "2026-03-05")]);
    expect(penaltiesCharged()).toEqual([2_500]);
    expect(parts()).toEqual([
      [50_000, 2_500],
      [50_000, 0],
    ]);
    expect(state()).toEqual({ penalty: 2_500, paid: 100_000, balance: 2_500, status: "PARTIALLY_PAID" });
    // Each took the notice's lock inside its transaction.
    expect(sharedFake.locks.filter((l) => l.table === "LevyNotice")).toEqual([
      { table: "LevyNotice", ids: ["n1"], inTransaction: true },
      { table: "LevyNotice", ids: ["n1"], inTransaction: true },
    ]);
  });

  it("a receipt and the penalty run at once charge the month once", async () => {
    onDay("2026-03-05");
    await pay(50_000, "2026-03-05");
    onDay("2026-04-02");
    await Promise.all([chargeInterestBatch({ schemeId: Q, actorId: "adviser" }), pay(1_000, "2026-04-02")]);
    // $25 for February, then $13.13 for March, once.
    expect(penaltiesCharged()).toEqual([2_500, 1_313]);
    expect(state()).toEqual({ penalty: 3_813, paid: 51_000, balance: 52_813, status: "PARTIALLY_PAID" });
  });

  it("a penalty run on the same day as a receipt charges nothing more, before or after it", async () => {
    onDay("2026-03-05");
    await pay(50_000, "2026-03-05");
    expect(await chargeInterestBatch({ schemeId: Q, actorId: "adviser" })).toMatchObject({ charged: 0 });
    setup();
    await chargeInterestBatch({ schemeId: Q, actorId: "adviser" });
    await pay(50_000, "2026-03-05");
    expect(penaltiesCharged()).toEqual([2_500]);
    expect(parts()).toEqual([[50_000, 2_500]]);
  });

  // Since 27 Oct 2026 an NSW receipt is one transaction too, numbered under the
  // building's lock (journal numbering fix): it takes the same locks in the same
  // order, but no late charge part.
  it("an NSW receipt takes the building's numbering lock, then its notice", async () => {
    setup({ state: "NSW", mode: "STATUTORY", rate: null });
    vi.setSystemTime(new Date("2026-03-05T02:00:00.000Z"));
    await pay(50_000, "2026-03-05");
    expect(sharedFake.locks).toEqual([
      { table: "Scheme", ids: [Q], inTransaction: true },
      { table: "LevyNotice", ids: ["n1"], inTransaction: true },
    ]);
    expect(sharedFake.table("LevyPayment")[0]).not.toHaveProperty("lateChargeAmount");
  });
});

describe("Queensland receipting is all or nothing", () => {
  const nothingWritten = () => {
    expect(state()).toEqual({ penalty: 0, paid: 0, balance: 100_000, status: "ISSUED" });
    expect(sharedFake.table("LevyPayment")).toHaveLength(0);
    expect(sharedFake.table("JournalEntry")).toHaveLength(0);
    expect(sharedFake.table("JournalLine")).toHaveLength(0);
  };

  it("the receipt journal is written in the same transaction: if it fails, the payment and the penalty are not kept", async () => {
    // No bank account in the chart that the fund check accepts, so the receipt journal fails after the penalty and payment are written.
    sharedFake.table("AccountCode").splice(sharedFake.table("AccountCode").findIndex((a) => a.id === "acc-BANK"), 1);
    onDay("2026-03-05");
    await expect(pay(50_000, "2026-03-05")).rejects.toThrow("A line uses an account that is not in this scheme's chart of accounts.");
    nothingWritten();
  });

  it("a closed period on the payment date refuses the whole receipt, with nothing written", async () => {
    setup({ periods: [{ id: "p-3", schemeId: Q, name: "March 2026", startDate: "2026-03-01", endDate: "2026-03-31", status: "CLOSED" }] });
    // Today is in April, which is open: the payment date decides.
    onDay("2026-04-02");
    await expect(pay(50_000, "2026-03-05")).rejects.toThrow("Cannot post to a closed period (March 2026).");
    nothingWritten();
  });

  it("the penalty charged before a payment is dated the payment date, not the day it is entered", async () => {
    onDay("2026-03-20");
    await pay(50_000, "2026-03-05");
    expect(entries("INTEREST").map((e) => e.transactionDate)).toEqual(["2026-03-05"]);
    expect(entries("AUTO").map((e) => e.transactionDate)).toEqual(["2026-03-05"]);
  });

  it("two receipts at once on different notices take different entry numbers (the numbering is locked)", async () => {
    setup({ secondNotice: true });
    onDay("2026-03-05");
    await Promise.all([pay(50_000, "2026-03-05"), receiptLevyPayment({ schemeId: Q, levyNoticeId: "n0", amountCents: 10_000, paymentDate: "2026-03-05", actorId: "adviser" })]);
    const numbers = sharedFake.table("JournalEntry").map((e) => e.entryNumber);
    // Two penalties and two receipts, each with its own number, in the order they were written.
    expect(numbers).toEqual(["JE-0001", "JE-0002", "JE-0003", "JE-0004"]);
    expect(sharedFake.locks.filter((l) => l.table === "Scheme")).toHaveLength(2);
  });
});

describe("Queensland reversals lock their notices", () => {
  it("a reversal locks the building's numbering, then each notice in id order", async () => {
    setup({ secondNotice: true });
    onDay("2026-03-05");
    // One deposit over both notices, listed n1 first.
    await receiptLevyPayments({
      schemeId: Q,
      receipts: [
        { levyNoticeId: "n1", amountCents: 50_000 },
        { levyNoticeId: "n0", amountCents: 10_000 },
      ],
      paymentDate: "2026-03-05",
      actorId: "adviser",
    });
    const receipt = entries("AUTO")[0];
    const before = sharedFake.locks.length;
    await reverseLevyReceipt({ schemeId: Q, journalEntryId: String(receipt.id), reason: "DISHONOURED", reversalDate: "2026-03-05", actorId: "adviser" });
    expect(sharedFake.locks.slice(before)).toEqual([
      { table: "Scheme", ids: [Q], inTransaction: true },
      { table: "LevyNotice", ids: ["n0"], inTransaction: true },
      { table: "LevyNotice", ids: ["n1"], inTransaction: true },
    ]);
    expect(state()).toEqual({ penalty: 2_500, paid: 0, balance: 102_500, status: "ISSUED" });
  });

  it("a receipt at the same moment as a reversal on the same notice is kept", async () => {
    onDay("2026-03-05");
    await pay(50_000, "2026-03-05");
    const receipt = entries("AUTO")[0];
    await Promise.all([
      reverseLevyReceipt({ schemeId: Q, journalEntryId: String(receipt.id), reason: "DISHONOURED", reversalDate: "2026-03-05", actorId: "adviser" }),
      pay(30_000, "2026-03-05"),
    ]);
    // The $300 receipt stands, whichever went first.
    expect(cents(notice().amountPaid)).toBe(sharedFake.table("LevyPayment").filter((p) => !p.reversedAt).reduce((t, p) => t + cents(p.amount), 0));
    expect(state()).toMatchObject({ paid: 30_000, balance: 72_500, status: "PARTIALLY_PAID" });
  });

  it("a receipt cannot be reversed twice at once", async () => {
    onDay("2026-03-05");
    await pay(50_000, "2026-03-05");
    const id = String(entries("AUTO")[0].id);
    const reverse = () => reverseLevyReceipt({ schemeId: Q, journalEntryId: id, reason: "DISHONOURED", reversalDate: "2026-03-05", actorId: "adviser" });
    const results = await Promise.allSettled([reverse(), reverse()]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(state()).toMatchObject({ paid: 0, balance: 102_500 });
  });
});

describe("Queensland locked transactions use their own connection only", () => {
  it("no global db call is made between taking the locks and committing (receipt, run, credit, reversal)", async () => {
    setup({ periods: [{ id: "p-3", schemeId: Q, name: "March 2026", startDate: "2026-03-01", endDate: "2026-03-31", status: "OPEN" }] });
    onDay("2026-03-05");
    // A receipt that charges the penalty and holds an overpayment as credit.
    await pay(110_000, "2026-03-05", { confirmOverpayment: true });
    onDay("2026-04-02");
    sharedFake.table("LevyNotice").push({ ...baseNotice, id: "n2", noticeNumber: "C-2", dueDate: "2026-02-28" });
    await chargeInterestBatch({ schemeId: Q, actorId: "adviser" });
    await applyOwnerCredit({ schemeId: Q, actorId: "adviser", date: "2026-04-02" });
    await reverseLevyReceipt({ schemeId: Q, journalEntryId: String(entries("AUTO")[0].id), reason: "ENTERED_IN_ERROR", reversalDate: "2026-04-02", actorId: "adviser" }).catch(() => undefined);
    expect(sharedFake.locks.filter((l) => l.inTransaction).length).toBeGreaterThan(4);
    expect(sharedFake.globalCallsUnderLock).toEqual([]);
  });
});

describe("Queensland owner credit is read under the lock", () => {
  it("two credit applications at once apply the credit once, the second reading what is left", async () => {
    setup({ secondNotice: true });
    sharedFake.table("OwnerCreditTransaction").push({ id: "ct-1", schemeId: Q, lotId: "lot-1", fundId: "fund-admin", ownerId: "owner-1", type: "OVERPAYMENT", amount: "1100.00" });
    sharedFake.table("OwnerCreditBalance").push({ id: "cb-1", schemeId: Q, lotId: "lot-1", fundId: "fund-admin", ownerId: "owner-1", balance: "1100.00" });
    onDay("2026-03-05");
    const applied = await Promise.all([
      applyOwnerCredit({ schemeId: Q, actorId: "adviser", date: "2026-03-05" }),
      applyOwnerCredit({ schemeId: Q, actorId: "adviser", date: "2026-03-05" }),
    ]);
    // $1,100 of credit: $615 to C-0 (its $15 penalty first), then $485 to C-1 (its $25 penalty first). Applied once in all.
    expect(applied[0] + applied[1]).toBe(110_000);
    expect(cents(sharedFake.table("OwnerCreditBalance")[0].balance)).toBe(0);
    expect(parts()).toEqual([
      [61_500, 1_500],
      [48_500, 2_500],
    ]);
  });

  it("a refund requested before the lock is taken is not applied as well", async () => {
    sharedFake.table("OwnerCreditTransaction").push({ id: "ct-1", schemeId: Q, lotId: "lot-1", fundId: "fund-admin", ownerId: "owner-1", type: "OVERPAYMENT", amount: "300.00" });
    sharedFake.table("OwnerCreditBalance").push({ id: "cb-1", schemeId: Q, lotId: "lot-1", fundId: "fund-admin", ownerId: "owner-1", balance: "300.00" });
    sharedFake.table("OwnerCreditRefund").push({ id: "rf-1", schemeId: Q, lotId: "lot-1", fundId: "fund-admin", status: "AWAITING_APPROVAL", amount: "100.00" });
    onDay("2026-03-05");
    expect(await applyOwnerCredit({ schemeId: Q, actorId: "adviser", date: "2026-03-05" })).toBe(20_000);
  });
});

describe("Queensland owner credit, penalty first", () => {
  it("credit applied after a month mark: the penalty is charged, then paid first, and the rest stays as credit", async () => {
    sharedFake.table("OwnerCreditTransaction").push({ id: "ct-1", schemeId: Q, lotId: "lot-1", fundId: "fund-admin", ownerId: "owner-1", type: "OVERPAYMENT", amount: "1100.00" });
    sharedFake.table("OwnerCreditBalance").push({ id: "cb-1", schemeId: Q, lotId: "lot-1", fundId: "fund-admin", ownerId: "owner-1", balance: "1100.00" });
    onDay("2026-03-05");
    expect(await applyOwnerCredit({ schemeId: Q, actorId: "adviser", date: "2026-03-05" })).toBe(102_500);
    expect(state()).toEqual({ penalty: 2_500, paid: 102_500, balance: 0, status: "PAID" });
    expect(parts()).toEqual([[102_500, 2_500]]);
    const credit = entries("AUTO").find((e) => e.sourceType === "OWNER_CREDIT")!;
    expect(linesOf(credit).map((l) => [l.accountCodeId, cents(l.debit), cents(l.credit), l.description])).toEqual([
      ["acc-ADVANCE", 102_500, 0, "Owner credit applied to notice C-1"],
      ["acc-ACCOUNTS_RECEIVABLE", 0, 2_500, "Penalty receivable reduced by owner credit, notice C-1"],
      ["acc-ACCOUNTS_RECEIVABLE", 0, 100_000, "Contributions receivable reduced by owner credit, notice C-1"],
    ]);
    expect(cents(sharedFake.table("OwnerCreditBalance")[0].balance)).toBe(7_500);
    expect(sharedFake.locks.filter((l) => l.table === "LevyNotice" && l.inTransaction)).toHaveLength(1);
  });

  it("credit cannot be applied on a day after the building's today", async () => {
    onDay("2026-03-05");
    await expect(applyOwnerCredit({ schemeId: Q, actorId: "adviser", date: "2026-03-09" })).rejects.toThrow("Credit cannot be applied on 2026-03-09, which is after today (2026-03-05).");
  });
});
