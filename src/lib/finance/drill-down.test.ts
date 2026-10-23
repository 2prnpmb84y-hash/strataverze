import { describe, expect, it } from "vitest";
import { recognisedIncomeExpense, type BasisLine } from "./accounting-basis";
import { cellRows, drillDownHref, normalSide, parseDrillDownParams, sourceCandidates, type DrillDownParams, type DrillEntry } from "./drill-down";

const acct = (accountId: string, accountType: string, accountSubType: string | null, code: string) => ({ accountId, accountCode: code, accountName: accountId, accountType, accountSubType });
const BANK = acct("bank", "ASSET", "BANK", "1-1000");
const AR = acct("ar", "ASSET", "ACCOUNTS_RECEIVABLE", "1-1100");
const AP = acct("ap", "LIABILITY", "ACCOUNTS_PAYABLE", "2-1000");
const LEVY = acct("levy", "INCOME", "LEVY_INCOME", "4-1000");
const REPAIRS = acct("repairs", "EXPENSE", "MAINTENANCE_EXPENSE", "5-1200");
const line = (a: typeof BANK, debit: number, credit: number, fundId = "admin"): BasisLine => ({ ...a, fundId, debitCents: debit, creditCents: credit });
const entry = (id: string, date: string, sourceType: string, sourceId: string | null, lines: BasisLine[], notes?: string[]): DrillEntry => ({
  id,
  date,
  sourceType,
  sourceId,
  lines,
  entryNumber: id.toUpperCase(),
  description: `Entry ${id}`,
  lineNotes: notes,
});

// TC-013: Maintenance and Repairs of $15,200 in the period, from three invoices, one of them reversed and re-entered.
const entries: DrillEntry[] = [
  entry("je1", "2026-07-03", "INVOICE", "inv1", [line(REPAIRS, 800_000, 0), line(AP, 0, 800_000)], ["Lift repair"]),
  entry("je2", "2026-08-12", "INVOICE", "inv2", [line(REPAIRS, 500_000, 0), line(AP, 0, 500_000)], ["Roof leak"]),
  entry("je3", "2026-09-01", "INVOICE", "inv3", [line(REPAIRS, 300_000, 0), line(AP, 0, 300_000)]),
  entry("je4", "2026-09-02", "REVERSAL", "je3", [line(AP, 300_000, 0), line(REPAIRS, 0, 300_000)]),
  entry("je5", "2026-09-02", "INVOICE", "inv3", [line(REPAIRS, 220_000, 0), line(AP, 0, 220_000)]),
  // Paying the lift repair in full, and half the roof leak
  entry("je6", "2026-08-20", "PAYMENT", "inv1", [line(AP, 800_000, 0), line(BANK, 0, 800_000)]),
  entry("je7", "2026-09-10", "PAYMENT", "inv2", [line(AP, 250_000, 0), line(BANK, 0, 250_000)]),
  // A capital works fund repair, outside the administrative fund
  entry("je8", "2026-09-15", "INVOICE", "inv4", [line(REPAIRS, 999_900, 0, "cw"), line(AP, 0, 999_900, "cw")]),
  // Outside the period
  entry("je9", "2027-07-02", "INVOICE", "inv5", [line(REPAIRS, 123_400, 0), line(AP, 0, 123_400)]),
  // Levies raised and part received
  entry("je10", "2026-07-01", "LEVY_RAISED", "sched1", [line(AR, 1_000_000, 0), line(LEVY, 0, 1_000_000)]),
  entry("je11", "2026-08-01", "PAYMENT", "notice1", [line(BANK, 600_000, 0), line(AR, 0, 600_000)]),
];

const levyIncomeAccount = () => ({ accountId: "levy", accountCode: "4-1000", accountName: "levy" });
const params = (p: Partial<DrillDownParams>): DrillDownParams => ({ accountId: "repairs", fundId: "admin", start: "2026-07-01", end: "2027-06-30", mode: "LEDGER", ...p });
const run = (p: Partial<DrillDownParams>, accountType = "EXPENSE") => cellRows({ entries, params: params(p), accountType, levyIncomeAccount });

describe("report drill-down (TC-013)", () => {
  it("lists every entry posted to Maintenance and Repairs in the period, adding up to $15,200", () => {
    const r = run({});
    expect(r.rows.map((x) => x.entryId)).toEqual(["je1", "je2", "je3", "je4", "je5"]);
    expect(r.totalCents).toBe(1_520_000);
    expect(r.debitCents - r.creditCents).toBe(1_520_000);
    expect(r.rows.find((x) => x.entryId === "je4")).toMatchObject({ creditCents: 300_000, amountCents: -300_000, sourceType: "REVERSAL", sourceId: "je3" });
    expect(r.rows[0]).toMatchObject({ sourceType: "INVOICE", sourceId: "inv1", notes: ["Lift repair"] });
  });

  it("keeps to the cell's fund and period", () => {
    expect(run({ fundId: "cw" }).totalCents).toBe(999_900);
    expect(run({ fundId: null }).totalCents).toBe(1_520_000 + 999_900);
    expect(run({ start: null, end: null }).totalCents).toBe(1_520_000 + 123_400);
    expect(run({ start: "2026-09-01", end: "2026-09-30" }).rows.map((x) => x.entryId)).toEqual(["je3", "je4", "je5"]);
  });

  it("signs credit-normal accounts as credits", () => {
    const ap = run({ accountId: "ap" }, "LIABILITY");
    // Owed: 8,000 + 5,000 + 3,000 - 3,000 + 2,200 less paid 8,000 + 2,500
    expect(ap.totalCents).toBe(1_520_000 - 1_050_000);
    expect(normalSide("LIABILITY")).toBe("CREDIT");
    expect(normalSide("ASSET")).toBe("DEBIT");
  });

  it("on a cash basis lists the payments that recognise the expense, matching the statements", () => {
    const cash = run({ mode: "CASH" });
    expect(cash.rows.map((x) => [x.entryId, x.amountCents, x.via])).toEqual([
      ["je6", 800_000, "INVOICE_PAYMENT"],
      ["je7", 250_000, "INVOICE_PAYMENT"],
    ]);
    const report = recognisedIncomeExpense({
      entries: entries.map((e) => ({ ...e, lines: e.lines.filter((l) => l.fundId === "admin") })),
      start: "2026-07-01",
      end: "2027-06-30",
      basisForFund: () => "CASH",
      levyIncomeAccount,
    });
    expect(cash.totalCents).toBe(report.find((l) => l.accountId === "repairs")!.amountCents);
    const levy = run({ accountId: "levy", mode: "CASH" }, "INCOME");
    expect(levy.rows.map((x) => [x.entryId, x.amountCents, x.via, x.creditCents])).toEqual([["je11", 600_000, "LEVY_RECEIPT", 600_000]]);
    expect(levy.totalCents).toBe(report.find((l) => l.accountId === "levy")!.amountCents);
  });

  it("on an accrual basis matches the ledger for income and expense accounts", () => {
    expect(run({ mode: "ACCRUAL" }).totalCents).toBe(run({}).totalCents);
    expect(run({ accountId: "levy", mode: "ACCRUAL" }, "INCOME").totalCents).toBe(1_000_000);
  });
});

describe("drill-down links", () => {
  const id = "11111111-2222-4333-8444-555555555555";
  it("round-trips the cell through the link", () => {
    const href = drillDownHref("/adviser/schemes/x/finance/reports", { accountId: id, fundId: id, start: "2026-07-01", end: "2027-06-30", basis: "CASH" });
    expect(href.startsWith("/adviser/schemes/x/finance/reports/drill-down?")).toBe(true);
    const sp = Object.fromEntries(new URLSearchParams(href.split("?")[1]));
    expect(parseDrillDownParams(sp)).toEqual({ accountId: id, fundId: id, start: "2026-07-01", end: "2027-06-30", mode: "CASH" });
  });

  it("refuses malformed links", () => {
    expect(parseDrillDownParams({})).toBeNull();
    expect(parseDrillDownParams({ account: "nope" })).toBeNull();
    expect(parseDrillDownParams({ account: id, startDate: "1/7/2026" })).toBeNull();
    expect(parseDrillDownParams({ account: id, startDate: "2026-08-01", endDate: "2026-07-01" })).toBeNull();
    expect(parseDrillDownParams({ account: id, basis: "MODIFIED" })).toBeNull();
    expect(parseDrillDownParams({ account: id })).toMatchObject({ fundId: null, start: null, end: null, mode: "LEDGER" });
  });

  it("knows where each kind of entry came from", () => {
    expect(sourceCandidates("PAYMENT")).toEqual(["SUPPLIER_INVOICE", "LEVY_NOTICE"]);
    expect(sourceCandidates("LEVY_RAISED")).toEqual(["LEVY_SCHEDULE"]);
    expect(sourceCandidates("MANUAL")).toEqual([]);
    expect(sourceCandidates(null)).toEqual([]);
  });
});

describe("ledger statuses", () => {
  it("keeps a reversed entry in the ledger beside its reversal, and leaves drafts out", async () => {
    const { inLedger, LEDGER_STATUSES } = await import("./ledger-status");
    expect(LEDGER_STATUSES).toEqual(["POSTED", "REVERSED"]);
    expect(inLedger("REVERSED")).toBe(true);
    expect(inLedger("DRAFT")).toBe(false);
  });
});
