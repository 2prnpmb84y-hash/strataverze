import { describe, expect, it } from "vitest";
import {
  controlTieOuts,
  cutoverCents,
  cutoverDate,
  cutoverReadiness,
  executionProblem,
  openingTrialBalance,
  parseArrearsRow,
  parseBankRow,
  parseCreditRow,
  parseInvoiceRow,
  parseOpeningRow,
  signOffProblem,
  type CutoverFile,
  type CutoverRows,
  type Lookups,
  type SignOff,
} from "./migration-cutover";

const lookups: Lookups = {
  funds: [
    { id: "admin", name: "Administrative Fund", fundType: "ADMINISTRATIVE" },
    { id: "cw", name: "Capital Works Fund", fundType: "CAPITAL_WORKS" },
  ],
  accounts: [
    { id: "bank", code: "1-1000", accountType: "ASSET", accountSubType: "BANK", fundId: "admin" },
    { id: "ar", code: "1-1100", accountType: "ASSET", accountSubType: "ACCOUNTS_RECEIVABLE", fundId: "admin" },
    { id: "ar-cw", code: "1-2100", accountType: "ASSET", accountSubType: "ACCOUNTS_RECEIVABLE", fundId: "cw" },
    { id: "ap", code: "2-1000", accountType: "LIABILITY", accountSubType: "ACCOUNTS_PAYABLE", fundId: "admin" },
    { id: "lia", code: "2-1300", accountType: "LIABILITY", accountSubType: "LEVIES_IN_ADVANCE", fundId: "admin" },
    { id: "eq", code: "3-1000", accountType: "EQUITY", accountSubType: "RETAINED_FUNDS", fundId: "admin" },
    { id: "eq-cw", code: "3-2000", accountType: "EQUITY", accountSubType: "RETAINED_FUNDS", fundId: "cw" },
    { id: "repairs", code: "5-1200", accountType: "EXPENSE", accountSubType: "MAINTENANCE_EXPENSE", fundId: "admin" },
  ],
  lots: [
    { id: "l3", lotNumber: "3" },
    { id: "l7", lotNumber: "7" },
  ],
  suppliers: [{ id: "acme", companyName: "Acme Plumbing Pty Ltd", abn: "12345678901" }],
  bankAccounts: [{ id: "ba1", accountName: "Operating", bsb: "062-000", accountNumber: "12345678" }],
};

const CUT = "2026-06-30";

/** A balanced cutover: bank 10,000 Dr, AR 1,350 Dr (admin) and 400 Dr (cw), AP 1,100 Cr, levies in advance 250 Cr, equity the rest. */
function sample(): CutoverRows {
  const tb: Record<string, string>[] = [
    { accountCode: "1-1000", debit: "10,000.00" },
    { accountCode: "1-1100", debit: "1,350.00" },
    { accountCode: "1-2100", debit: "400.00" },
    { accountCode: "2-1000", credit: "1,100.00" },
    { accountCode: "2-1300", credit: "250.00" },
    { accountCode: "3-1000", credit: "10,000.00" },
    { accountCode: "3-2000", credit: "400.00" },
  ];
  return {
    opening_balances: tb.map((r, i) => parseOpeningRow(r, i + 2, lookups)),
    levy_arrears: [
      parseArrearsRow({ lotNumber: "3", fundName: "Admin", dueDate: "01/04/2026", levyOutstanding: "1,000.00", interestCharged: "25.00" }, 2, lookups, CUT),
      parseArrearsRow({ lotNumber: "7", fundName: "Administrative Fund", dueDate: "01/05/2026", levyOutstanding: "325.00" }, 3, lookups, CUT),
      parseArrearsRow({ lotNumber: "7", fundName: "Sinking Fund", dueDate: "2026-05-01", levyOutstanding: "400" }, 4, lookups, CUT),
    ],
    unpaid_invoices: [
      parseInvoiceRow({ supplierAbn: "12 345 678 901", invoiceNumber: "INV-9", invoiceDate: "15/06/2026", dueDate: "15/07/2026", totalAmount: "1,100.00", gstAmount: "100.00", accountCode: "5-1200" }, 2, lookups),
    ],
    owner_credits: [parseCreditRow({ lotNumber: "3", fundName: "Admin", creditAmount: "250.00 CR" }, 2, lookups)],
    bank_balances: [parseBankRow({ bsb: "062000", accountNumber: "1234 5678", reconciledDate: "30/06/2026", reconciledBalance: "10,120.00" }, 2, lookups)],
  };
}

const filesFor = (rows: CutoverRows): CutoverFile[] =>
  (Object.keys(rows) as (keyof CutoverRows)[]).map((k) => ({
    dataType: k,
    fileName: `${k}.csv`,
    sha256: `hash-${k}`,
    rowCount: rows[k]!.length,
    errorCount: rows[k]!.filter((r) => r.errors.length > 0).length,
  }));

describe("cutover parsing", () => {
  it("reads money in the forms exports use", () => {
    expect(cutoverCents("$1,234.50")).toBe(123_450);
    expect(cutoverCents("(12.00)")).toBe(-1_200);
    expect(cutoverCents("-12")).toBe(-1_200);
    expect(cutoverCents("120.00 CR")).toBe(-12_000);
    expect(cutoverCents("120.00 DR")).toBe(12_000);
    expect(cutoverCents("")).toBe(0);
    expect(cutoverCents("12.345")).toBeNull();
    expect(cutoverCents("abc")).toBeNull();
  });

  it("reads Australian and ISO dates and refuses impossible ones", () => {
    expect(cutoverDate("1/4/2026")).toBe("2026-04-01");
    expect(cutoverDate("2026-04-01")).toBe("2026-04-01");
    expect(cutoverDate("31/02/2026")).toBeNull();
    expect(cutoverDate("04/01/26")).toBeNull();
  });

  it("keeps each notice's original due date and interest already charged", () => {
    const [first, , cw] = sample().levy_arrears!;
    expect(first.value).toMatchObject({ lotId: "l3", fundId: "admin", dueDate: "2026-04-01", levyOutstandingCents: 100_000, interestChargedCents: 2_500, interestPaidCents: 0 });
    expect(cw.value).toMatchObject({ fundId: "cw", levyOutstandingCents: 40_000 });
  });

  it("refuses rows it cannot place", () => {
    expect(parseOpeningRow({ accountCode: "9-9999", debit: "1" }, 2, lookups).errors[0]).toContain("not in the chart of accounts");
    expect(parseOpeningRow({ accountCode: "1-1000", debit: "1", credit: "1" }, 2, lookups).errors).toContain("A line can have a debit or a credit, not both.");
    expect(parseArrearsRow({ lotNumber: "99", dueDate: "01/04/2026", levyOutstanding: "1" }, 2, lookups, CUT).errors[0]).toContain("Lot 99");
    expect(parseArrearsRow({ lotNumber: "3", dueDate: "April", levyOutstanding: "1" }, 2, lookups, CUT).errors[0]).toContain("Due date");
    expect(parseInvoiceRow({ supplierName: "Nobody", invoiceNumber: "1", invoiceDate: "01/06/2026", totalAmount: "10", accountCode: "5-1200" }, 2, lookups).errors[0]).toContain("not set up");
    expect(parseInvoiceRow({ supplierName: "acme plumbing pty ltd", invoiceNumber: "1", invoiceDate: "01/06/2026", totalAmount: "10", accountCode: "1-1000" }, 2, lookups).errors).toContain("Account 1-1000 is not an expense account.");
    expect(parseBankRow({ accountName: "Savings", reconciledDate: "30/06/2026", reconciledBalance: "1" }, 2, lookups).errors[0]).toContain("not set up");
  });

  it("accepts a single signed balance column", () => {
    expect(parseOpeningRow({ accountCode: "2-1000", balance: "-1,100.00" }, 2, lookups).value).toMatchObject({ debitCents: 0, creditCents: 110_000 });
  });
});

describe("cutover checks", () => {
  it("passes when the trial balance nets to zero", () => {
    const tb = openingTrialBalance(sample().opening_balances!.map((r) => r.value!));
    expect(tb).toEqual({ debitCents: 1_175_000, creditCents: 1_175_000, differenceCents: 0, balanced: true, lines: 7 });
  });

  it("ties each control account to the detail behind it", () => {
    const t = controlTieOuts(sample(), lookups.funds);
    const by = Object.fromEntries(t.map((x) => [x.key, x]));
    expect(by["ar:admin"]).toMatchObject({ ledgerCents: 135_000, detailCents: 135_000, differenceCents: 0 });
    expect(by["ar:cw"]).toMatchObject({ ledgerCents: 40_000, detailCents: 40_000, differenceCents: 0 });
    expect(by.ap).toMatchObject({ ledgerCents: 110_000, detailCents: 110_000, differenceCents: 0 });
    expect(by["lia:admin"]).toMatchObject({ ledgerCents: 25_000, detailCents: 25_000, differenceCents: 0 });
    // Bank differs by unpresented items: shown, not blocking.
    expect(by.bank).toMatchObject({ ledgerCents: 1_000_000, detailCents: 1_012_000, differenceCents: -12_000, needsAcknowledgement: false });
  });

  it("will not sign off an unbalanced trial balance", () => {
    const rows = sample();
    rows.opening_balances = rows.opening_balances!.slice(0, -1);
    const r = cutoverReadiness({ files: filesFor(rows), rows, funds: lookups.funds, cutoverDate: CUT });
    expect(r.trialBalance.balanced).toBe(false);
    expect(r.canSignOff).toBe(false);
    expect(r.problems.join(" ")).toContain("does not net to zero");
  });

  it("needs every control difference acknowledged at sign-off", () => {
    const rows = sample();
    rows.levy_arrears = rows.levy_arrears!.slice(1);
    const r = cutoverReadiness({ files: filesFor(rows), rows, funds: lookups.funds, cutoverDate: CUT });
    expect(r.canSignOff).toBe(true);
    expect(signOffProblem(r, [])).toContain("Levies receivable, Administrative Fund");
    expect(signOffProblem(r, ["ar:admin"])).toBeNull();
  });

  it("blocks duplicate invoices and files with row errors", () => {
    const rows = sample();
    rows.unpaid_invoices = [...rows.unpaid_invoices!, { ...rows.unpaid_invoices![0], rowNumber: 3 }];
    rows.owner_credits = [...rows.owner_credits!, parseCreditRow({ lotNumber: "99", creditAmount: "1" }, 3, lookups)];
    const r = cutoverReadiness({ files: filesFor(rows), rows, funds: lookups.funds, cutoverDate: CUT });
    expect(r.problems).toEqual(expect.arrayContaining(["Owner credit balances: 1 row has errors.", "Unpaid supplier invoices row 3: Invoice INV-9 is also on row 2."]));
  });
});

describe("executing a cutover", () => {
  const rows = sample();
  const files = filesFor(rows);
  const readiness = cutoverReadiness({ files, rows, funds: lookups.funds, cutoverDate: CUT });
  const signOff: SignOff = {
    signedOffBy: "p1",
    signedOffAt: "2026-07-02T01:00:00Z",
    sourceSystem: "stratamax",
    cutoverDate: CUT,
    files: files.map((f) => ({ dataType: f.dataType, fileName: f.fileName, sha256: f.sha256 })),
    acknowledgedDifferences: [],
    note: null,
  };

  it("runs only once signed off, with the same files", () => {
    expect(executionProblem({ status: "READY", readiness, signOff: null, files })).toBe("The cutover must be signed off before it runs.");
    expect(executionProblem({ status: "SIGNED_OFF", readiness, signOff, files })).toBeNull();
    const changed = files.map((f) => (f.dataType === "levy_arrears" ? { ...f, sha256: "other" } : f));
    expect(executionProblem({ status: "SIGNED_OFF", readiness, signOff, files: changed })).toContain("changed since the sign-off");
    expect(executionProblem({ status: "EXECUTED", readiness, signOff, files })).toContain("already been executed");
  });

  it("refuses when the trial balance does not net to zero, whatever the sign-off says", () => {
    const off = { ...readiness, trialBalance: { ...readiness.trialBalance, balanced: false } };
    expect(executionProblem({ status: "SIGNED_OFF", readiness: off, signOff, files })).toBe("The opening trial balance must net to zero before the migration can run.");
  });
});
