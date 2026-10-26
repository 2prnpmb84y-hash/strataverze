/**
 * Reports tie back to the trial balance (financials review, recommendation 3,
 * 26 Oct 2026). The fixture is the review's migrated scheme: the
 * administrative fund opens at $10,500.15 (cash $10,000.00, levies receivable
 * $1,250.50, paid in advance $300.25, creditors $450.10) and the capital
 * works fund at $50,600.00, on a takeover of 1 July 2026.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const data: Record<string, unknown[]> = {};
vi.mock("@/prisma/db", () => {
  const model = (name: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ["where", "include", "orderBy", "limit"]) chain[m] = () => chain;
    chain.all = async () => data[name] ?? [];
    chain.first = async () => (data[name] ?? [])[0] ?? null;
    return chain;
  };
  return { db: { orm: { public: new Proxy({}, { get: (_t, n: string) => model(n) }) } } };
});
vi.mock("@prisma/orm-postgres/orm-client", () => ({ and: (...c: unknown[]) => c, or: (...c: unknown[]) => c }));
vi.mock("@/lib/onboarding/property-onboarding", () => ({ todayInSydney: () => "2026-10-26" }));

import { getFundSummaryReport, getTrialBalanceReport } from "./reports";
import { fundPositions, getFundPositions } from "@/lib/finance/fund-position";
import { keyFinancialInformation } from "@/lib/finance/key-financial-information";
import { arrearsCents, toArrearsNotice } from "@/lib/finance/arrears";

const A = "fund-admin";
const C = "fund-cw";
const acc = (id: string, code: string, accountType: string, accountSubType: string, fundId: string | null) => ({ id, code, name: id, accountType, accountSubType, fundId });
const accounts = {
  bank: acc("bank", "1-1000", "ASSET", "BANK", A),
  arA: acc("arA", "1-1100", "ASSET", "ACCOUNTS_RECEIVABLE", A),
  arC: acc("arC", "1-2100", "ASSET", "ACCOUNTS_RECEIVABLE", C),
  adv: acc("adv", "2-1300", "LIABILITY", "LEVIES_IN_ADVANCE", A),
  ap: acc("ap", "2-1000", "LIABILITY", "ACCOUNTS_PAYABLE", A),
  obA: acc("obA", "3-1100", "EQUITY", "OPENING_BALANCE", A),
  obC: acc("obC", "3-2100", "EQUITY", "OPENING_BALANCE", C),
  incA: acc("incA", "4-1000", "INCOME", "LEVY_INCOME", A),
  expA: acc("expA", "5-1300", "EXPENSE", "UTILITIES_EXPENSE", A),
};
type Acc = keyof typeof accounts;
const line = (a: Acc, fundId: string, debit: number | null, credit: number | null) => ({
  accountCodeId: accounts[a].id,
  fundId,
  debit,
  credit,
  accountCode: accounts[a],
  fund: { name: fundId === A ? "Administrative Fund" : "Capital Works Fund" },
});
const entry = (id: string, date: string, sourceType: string, lines: ReturnType<typeof line>[]) => ({
  id,
  schemeId: "s",
  transactionDate: `${date}T00:00:00.000Z`,
  status: "POSTED",
  sourceType,
  sourceId: null,
  entryType: sourceType === "DATA_MIGRATION" ? "OPENING_BALANCE" : "AUTO",
  lines,
});

const entries = [
  entry("je1", "2026-07-01", "DATA_MIGRATION", [
    line("bank", A, 10_000, null),
    line("arA", A, 1_250.5, null),
    line("adv", A, null, 300.25),
    line("ap", A, null, 450.1),
    line("obA", A, null, 10_500.15),
    line("bank", C, 50_000, null),
    line("arC", C, 600, null),
    line("obC", C, null, 50_600),
  ]),
  entry("je2", "2026-08-01", "LEVY", [line("arA", A, 13_200, null), line("incA", A, null, 13_200)]),
  entry("je3", "2026-08-15", "PAYMENT", [line("bank", A, 1_000, null), line("arA", A, null, 1_000)]),
  entry("je4", "2026-09-01", "INVOICE", [line("expA", A, 25.55, null), line("bank", A, null, 25.55)]),
];

beforeEach(() => {
  data.JournalEntry = entries;
  data.Fund = [
    { id: A, schemeId: "s", name: "Administrative Fund", fundType: "ADMINISTRATIVE", balance: "0" },
    { id: C, schemeId: "s", name: "Capital Works Fund", fundType: "CAPITAL_WORKS", balance: "0" },
  ];
  data.LevyNotice = [
    { fundId: A, status: "ISSUED", dueDate: "2026-07-01", amountDue: "1250.50", amountPaid: "0", balanceOutstanding: "250.50", interestCharged: "0" },
    { fundId: A, status: "PARTIALLY_PAID", dueDate: "2026-08-01", amountDue: "13200", amountPaid: "1000", balanceOutstanding: "12200", interestCharged: "0" },
    { fundId: A, status: "ISSUED", dueDate: "2026-11-01", amountDue: "500", amountPaid: "0", balanceOutstanding: "500", interestCharged: "0" },
    { fundId: A, status: "DRAFT", dueDate: "2026-07-01", amountDue: "999", amountPaid: "0", balanceOutstanding: "999", interestCharged: "0" },
  ];
});

const assetsLessLiabilities = (tb: Awaited<ReturnType<typeof getTrialBalanceReport>>, fundId: string) =>
  tb.lines
    .filter((l) => l.fundId === fundId && (l.accountType === "ASSET" || l.accountType === "LIABILITY"))
    .reduce((s, l) => s + l.debitBalance - l.creditBalance, 0);

describe("fund balances include the opening balances brought forward (B2, B3)", () => {
  it("gives the review's opening fund balances at takeover", async () => {
    const p = await getFundPositions("s", "2026-07-01");
    expect(p.get(A)).toEqual({ balanceCents: 1_050_015, cashCents: 1_000_000 });
    expect(p.get(C)).toEqual({ balanceCents: 5_060_000, cashCents: 5_000_000 });
  });

  it("fund summary: opening + income - expenses + brought forward = closing = trial balance", async () => {
    const [summary, tb] = await Promise.all([getFundSummaryReport("s", "2026-07-01", "2027-06-30"), getTrialBalanceReport("s", "2027-06-30", null)]);
    expect(tb.isBalanced).toBe(true);
    const admin = summary.find((f) => f.fundId === A)!;
    expect(admin).toMatchObject({ openingBalance: 0, totalIncome: 13_200, totalExpenses: 25.55, broughtForward: 10_500.15, closingBalance: 23_674.6 });
    for (const f of summary) {
      expect(Math.round((f.openingBalance + f.totalIncome - f.totalExpenses + f.broughtForward) * 100)).toBe(Math.round(f.closingBalance * 100));
      expect(Math.round(f.closingBalance * 100)).toBe(Math.round(assetsLessLiabilities(tb, f.fundId) * 100));
    }
    expect(summary.find((f) => f.fundId === C)!.closingBalance).toBe(50_600);
  });

  it("a period after the takeover opens at the balance carried forward", async () => {
    const s = await getFundSummaryReport("s", "2026-09-01", "2026-09-30");
    const admin = s.find((f) => f.fundId === A)!;
    expect(admin.openingBalance).toBe(23_700.15);
    expect(admin.broughtForward).toBe(0);
    expect(admin.closingBalance).toBe(23_674.6);
  });
});

describe("cash comes from the bank lines (B5)", () => {
  it("is each fund's share of the bank", async () => {
    const p = await getFundPositions("s", "2026-10-26");
    expect(p.get(A)!.cashCents).toBe(1_097_445);
    expect(p.get(C)!.cashCents).toBe(5_000_000);
  });
});

describe("statement of key financial information (B4)", () => {
  it("carries forward the takeover balance and does not count it as money received", () => {
    const basis = entries.map((e) => ({
      id: e.id,
      date: e.transactionDate.slice(0, 10),
      sourceType: e.sourceType,
      sourceId: null,
      lines: e.lines.map((l) => ({
        accountId: l.accountCodeId,
        accountCode: l.accountCode.code,
        accountName: l.accountCode.name,
        accountType: l.accountCode.accountType,
        accountSubType: l.accountCode.accountSubType,
        fundId: l.fundId,
        debitCents: Math.round((l.debit ?? 0) * 100),
        creditCents: Math.round((l.credit ?? 0) * 100),
      })),
    }));
    const k = keyFinancialInformation({ entries: basis, fundId: A, start: "2026-07-01", end: "2027-06-30", dayBefore: "2026-06-30", recognised: [], unpaidNotices: [], principalItemsNextPeriod: [] });
    expect(k.balanceCarriedForwardCents).toBe(1_050_015);
    expect(k.totalIncomeReceivedCents).toBe(100_000);
    expect(k.balanceAtEndCents).toBe(fundPositions(basis, "2027-06-30").get(A)!.balanceCents);
    const cw = keyFinancialInformation({ entries: basis, fundId: C, start: "2026-07-01", end: "2027-06-30", dayBefore: "2026-06-30", recognised: [], unpaidNotices: [], principalItemsNextPeriod: [] });
    expect(cw.balanceCarriedForwardCents).toBe(5_060_000);
    expect(cw.totalIncomeReceivedCents).toBe(0);
  });

  it("keeps the takeover's year-to-date figures and same-day entries out of the balance carried forward", () => {
    const l = (accountType: string, accountSubType: string | null, debitCents: number, creditCents: number) => ({ accountId: String(accountSubType), accountCode: "", accountName: "", accountType, accountSubType, fundId: A, debitCents, creditCents });
    const basis = [
      // Takeover part way through the year: the trial balance carries $300 of income and $100 of expenses.
      { id: "t", date: "2026-10-01", sourceType: "DATA_MIGRATION", sourceId: null, lines: [l("ASSET", "BANK", 120_000, 0), l("INCOME", "LEVY_INCOME", 0, 30_000), l("EXPENSE", "UTILITIES_EXPENSE", 10_000, 0), l("EQUITY", "OPENING_BALANCE", 0, 100_000)] },
      // A levy raised on the takeover day belongs to the period.
      { id: "lv", date: "2026-10-01", sourceType: "LEVY", sourceId: null, lines: [l("ASSET", "ACCOUNTS_RECEIVABLE", 5_000, 0), l("INCOME", "LEVY_INCOME", 0, 5_000)] },
    ];
    const recognised = [
      { accountType: "INCOME" as const, accountSubType: "LEVY_INCOME", amountCents: 35_000 },
      { accountType: "EXPENSE" as const, accountSubType: "UTILITIES_EXPENSE", amountCents: 10_000 },
    ];
    const k = keyFinancialInformation({ entries: basis, fundId: A, start: "2026-07-01", end: "2027-06-30", dayBefore: "2026-06-30", recognised, unpaidNotices: [], principalItemsNextPeriod: [] });
    // $1,200 of net assets less the $200 of year-to-date surplus already in the period figures.
    expect(k.balanceCarriedForwardCents).toBe(100_000);
    // Carried forward + income - expenditure = balance at the end.
    expect(k.balanceCarriedForwardCents + 35_000 - 10_000).toBe(k.balanceAtEndCents);
  });

  it("keeps an entry in the period dated before the takeover out of the balance carried forward", () => {
    const l = (accountType: string, accountSubType: string | null, debitCents: number, creditCents: number) => ({ accountId: String(accountSubType), accountCode: "", accountName: "", accountType, accountSubType, fundId: A, debitCents, creditCents });
    const basis = [
      { id: "lv", date: "2026-08-01", sourceType: "LEVY", sourceId: null, lines: [l("ASSET", "ACCOUNTS_RECEIVABLE", 5_000, 0), l("INCOME", "LEVY_INCOME", 0, 5_000)] },
      { id: "t", date: "2026-10-01", sourceType: "DATA_MIGRATION", sourceId: null, lines: [l("ASSET", "BANK", 100_000, 0), l("EQUITY", "OPENING_BALANCE", 0, 100_000)] },
    ];
    const recognised = [{ accountType: "INCOME" as const, accountSubType: "LEVY_INCOME", amountCents: 5_000 }];
    const k = keyFinancialInformation({ entries: basis, fundId: A, start: "2026-07-01", end: "2027-06-30", dayBefore: "2026-06-30", recognised, unpaidNotices: [], principalItemsNextPeriod: [] });
    expect(k.balanceCarriedForwardCents).toBe(100_000);
    expect(k.balanceCarriedForwardCents + 5_000).toBe(k.balanceAtEndCents);
  });

  it("counts money moved between the funds in the bank once, for the fund it moved to", () => {
    const l = (fundId: string, accountType: string, accountSubType: string, debitCents: number, creditCents: number) => ({ accountId: accountSubType, accountCode: "", accountName: "", accountType, accountSubType, fundId, debitCents, creditCents });
    const basis = [
      { id: "r", date: "2026-08-01", sourceType: "BANK_IMPORT", sourceId: null, lines: [l(A, "ASSET", "BANK", 500, 0), l(A, "ASSET", "SUSPENSE", 0, 500)] },
      { id: "m", date: "2026-08-02", sourceType: "SUSPENSE", sourceId: null, lines: [l(A, "ASSET", "SUSPENSE", 500, 0), l(C, "INCOME", "LEVY_INCOME", 0, 500), l(C, "ASSET", "BANK", 500, 0), l(A, "ASSET", "BANK", 0, 500)] },
    ];
    const args = { entries: basis, start: "2026-07-01", end: "2027-06-30", dayBefore: "2026-06-30", recognised: [], unpaidNotices: [], principalItemsNextPeriod: [] };
    expect(keyFinancialInformation({ ...args, fundId: A }).totalIncomeReceivedCents).toBe(0);
    expect(keyFinancialInformation({ ...args, fundId: C }).totalIncomeReceivedCents).toBe(500);
  });
});

describe("one arrears figure (B11)", () => {
  it("counts issued notices past their due date, with interest, and nothing else", async () => {
    const notices = (data.LevyNotice as Parameters<typeof toArrearsNotice>[0][]).map(toArrearsNotice);
    expect(arrearsCents(notices, "2026-10-26")).toEqual({ totalCents: 1_245_050, count: 2 });
    const summary = await getFundSummaryReport("s", "2026-07-01", "2027-06-30");
    expect(summary.find((f) => f.fundId === A)!.outstandingLevies).toBe(12_450.5);
  });

  it("does not count a notice on its due date", () => {
    expect(arrearsCents([{ status: "ISSUED", dueDate: "2026-10-26", balanceCents: 100 }], "2026-10-26").totalCents).toBe(0);
    expect(arrearsCents([{ status: "ISSUED", dueDate: "2026-10-25", balanceCents: 100 }], "2026-10-26").totalCents).toBe(100);
  });
});
