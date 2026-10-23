import { describe, expect, it } from "vitest";
import { incomeExpenseTotals, recognisedIncomeExpense, type BasisEntry, type BasisLine } from "./accounting-basis";

const acct = (accountId: string, accountType: string, accountSubType: string | null, code = accountId) => ({
  accountId,
  accountCode: code,
  accountName: accountId,
  accountType,
  accountSubType,
});
const BANK = acct("bank", "ASSET", "BANK", "1-1000");
const AR = acct("ar", "ASSET", "ACCOUNTS_RECEIVABLE", "1-1100");
const AP = acct("ap", "LIABILITY", "ACCOUNTS_PAYABLE", "2-1000");
const LEVY = acct("levy", "INCOME", "LEVY_INCOME", "4-1000");
const REPAIRS = acct("repairs", "EXPENSE", "MAINTENANCE_EXPENSE", "5-1200");
const line = (a: typeof BANK, debit: number, credit: number, fundId = "admin"): BasisLine => ({ ...a, fundId, debitCents: debit, creditCents: credit });

/** The same journal set for both bases. */
const entries: BasisEntry[] = [
  // Levies raised 1 July: 10,000
  { id: "raise", date: "2026-07-01", sourceType: "LEVY_RAISED", sourceId: "s1", lines: [line(AR, 1_000_000, 0), line(LEVY, 0, 1_000_000)] },
  // 6,000 received in the year
  { id: "rcpt", date: "2026-08-10", sourceType: "PAYMENT", sourceId: "n1", lines: [line(BANK, 600_000, 0), line(AR, 0, 600_000)] },
  // Repairs invoice of 2,000 approved in June, before the year
  { id: "inv", date: "2026-06-20", sourceType: "INVOICE", sourceId: "i1", lines: [line(REPAIRS, 200_000, 0), line(AP, 0, 200_000)] },
  // Half of it paid in the year
  { id: "pay", date: "2026-07-15", sourceType: "PAYMENT", sourceId: "i1", lines: [line(AP, 100_000, 0), line(BANK, 0, 100_000)] },
  // Another invoice of 500 approved in the year, not paid
  { id: "inv2", date: "2026-09-01", sourceType: "INVOICE", sourceId: "i2", lines: [line(REPAIRS, 50_000, 0), line(AP, 0, 50_000)] },
];

const run = (basis: "CASH" | "ACCRUAL") =>
  recognisedIncomeExpense({
    entries,
    start: "2026-07-01",
    end: "2027-06-30",
    basisForFund: () => basis,
    levyIncomeAccount: () => ({ accountId: "levy", accountCode: "4-1000", accountName: "levy" }),
  });

describe("accounting basis", () => {
  it("accrual recognises levies on issue and expenses on approval", () => {
    expect(incomeExpenseTotals(run("ACCRUAL"))).toEqual({ incomeCents: 1_000_000, expenseCents: 50_000, surplusCents: 950_000 });
  });

  it("cash recognises levies on receipt and expenses on payment", () => {
    expect(incomeExpenseTotals(run("CASH"))).toEqual({ incomeCents: 600_000, expenseCents: 100_000, surplusCents: 500_000 });
  });

  it("takes the basis from each fund", () => {
    const cwLines: BasisEntry[] = [
      { id: "cw", date: "2026-07-01", sourceType: "LEVY_RAISED", sourceId: "s2", lines: [line(AR, 300_000, 0, "cw"), line(LEVY, 0, 300_000, "cw")] },
    ];
    const r = recognisedIncomeExpense({
      entries: [...entries, ...cwLines],
      start: "2026-07-01",
      end: "2027-06-30",
      basisForFund: (f) => (f === "cw" ? "ACCRUAL" : "CASH"),
      levyIncomeAccount: () => ({ accountId: "levy", accountCode: "4-1000", accountName: "levy" }),
    });
    expect(r.find((l) => l.fundId === "cw")?.amountCents).toBe(300_000);
    expect(r.find((l) => l.fundId === "admin" && l.accountType === "INCOME")?.amountCents).toBe(600_000);
  });

  it("treats a reversal as its original on a cash basis", () => {
    const withReversals: BasisEntry[] = [
      ...entries,
      // The unpaid invoice is reversed: nothing was recognised on a cash basis, so nothing comes off.
      { id: "rev-inv2", date: "2026-09-05", sourceType: "REVERSAL", sourceId: "inv2", lines: [line(AP, 50_000, 0), line(REPAIRS, 0, 50_000)] },
      // The receipt is dishonoured: the cash income comes back out.
      { id: "rev-rcpt", date: "2026-08-20", sourceType: "REVERSAL", sourceId: "rcpt", lines: [line(AR, 600_000, 0), line(BANK, 0, 600_000)] },
      // The invoice payment is reversed: its expense comes back out.
      { id: "rev-pay", date: "2026-07-20", sourceType: "REVERSAL", sourceId: "pay", lines: [line(BANK, 100_000, 0), line(AP, 0, 100_000)] },
    ];
    const cash = recognisedIncomeExpense({
      entries: withReversals,
      start: "2026-07-01",
      end: "2027-06-30",
      basisForFund: () => "CASH",
      levyIncomeAccount: () => ({ accountId: "levy", accountCode: "4-1000", accountName: "levy" }),
    });
    expect(incomeExpenseTotals(cash)).toEqual({ incomeCents: 0, expenseCents: 0, surplusCents: 0 });
    const accrual = recognisedIncomeExpense({
      entries: withReversals,
      start: "2026-07-01",
      end: "2027-06-30",
      basisForFund: () => "ACCRUAL",
      levyIncomeAccount: () => ({ accountId: "levy", accountCode: "4-1000", accountName: "levy" }),
    });
    expect(incomeExpenseTotals(accrual)).toEqual({ incomeCents: 1_000_000, expenseCents: 0, surplusCents: 1_000_000 });
  });

  it("recognises the payment of an invoice brought across in a cutover", () => {
    // The invoice's payable came in with the opening balances, so it has no approval entry in the ledger.
    const migrated: BasisEntry = { id: "mig-inv", date: "2026-06-15", sourceType: "INVOICE", sourceId: "old-1", lines: [line(REPAIRS, 100_000, 0), line(AP, 0, 110_000)] };
    const payment: BasisEntry = { id: "pay-old", date: "2026-07-20", sourceType: "PAYMENT", sourceId: "old-1", lines: [line(AP, 55_000, 0), line(BANK, 0, 55_000)] };
    const run2 = (extra?: BasisEntry[]) =>
      incomeExpenseTotals(
        recognisedIncomeExpense({
          entries: [payment],
          start: "2026-07-01",
          end: "2027-06-30",
          basisForFund: () => "CASH",
          levyIncomeAccount: () => null,
          extraInvoices: extra,
        }),
      ).expenseCents;
    expect(run2()).toBe(0);
    // Half the invoice is paid, so half its GST-exclusive expense is recognised.
    expect(run2([migrated])).toBe(50_000);
  });
});
