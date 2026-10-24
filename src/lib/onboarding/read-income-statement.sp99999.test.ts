import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseIncomeStatement, readIncomeStatementPDF, statementAmount } from "./read-income-statement";
import type { LayoutLine } from "@/lib/pdf/layout-text";

/**
 * SP 99999 (the test building's handover from Urbanise Strata): the
 * FY2025-26 annual financial statement. Figures checked by hand against the
 * printed statement.
 */
const pdf = () => new Uint8Array(readFileSync(join(__dirname, "../../test/fixtures/handover/sp99999/01_Annual_Financial_Statement_FY2025-26.pdf")));

describe("annual financial statement, SP 99999", () => {
  it("reads both funds' income and expenditure, with the opening and closing balances", async () => {
    const s = await readIncomeStatementPDF(pdf());
    expect(s.period).toEqual({ start: "2025-07-01", end: "2026-06-30" });
    expect(s.funds.map((f) => [f.fundName, f.fundType])).toEqual([
      ["Administrative Fund", "ADMINISTRATIVE"],
      ["Capital Works Fund", "CAPITAL_WORKS"],
    ]);
    const [admin, cw] = s.funds;
    expect(admin.income).toEqual([
      { name: "Levy Fees - normal", actualCents: 3238896, shortened: false },
      { name: "Mutual Revenue - certificates", actualCents: 0, shortened: false },
      { name: "Mutual Revenue - penalty interest", actualCents: 4638, shortened: false },
    ]);
    expect(admin.expenditure).toHaveLength(19);
    expect(admin.expenditure.find((l) => l.name === "Insurance")?.actualCents).toBe(819200);
    expect(admin.expenditure.find((l) => l.name === "Water - meter reading")?.actualCents).toBe(157645);
    expect(admin).toMatchObject({ printedIncomeCents: 3243534, printedExpenditureCents: 2326717, openingBalanceCents: 86845, closingBalanceCents: 1003662 });
    expect(cw.income.map((l) => l.actualCents)).toEqual([555568, 686]);
    expect(cw.expenditure.map((l) => l.name)).toEqual(["Garage Door Maintenance", "General Repairs", "Minor Building Maintenance - General Repairs", "Plumbing & Drainage - Plumbing and drainage main", "Windows"]);
    expect(cw.expenditure[3].shortened).toBe(true);
    expect(cw).toMatchObject({ printedIncomeCents: 556254, printedExpenditureCents: 659450, openingBalanceCents: 8545796, closingBalanceCents: 8442600 });
    // The only issue is the shortened name.
    expect(s.issues).toEqual([expect.stringContaining('shortened the account name "Plumbing & Drainage - Plumbing and drainage main..."')]);
  }, 60000);
});

describe("statement amounts", () => {
  it("reads the forms the statement prints", () => {
    expect(statementAmount("32,388.96")).toBe(3238896);
    expect(statementAmount("$ 10,036.62")).toBe(1003662);
    expect(statementAmount("(1,031.96)")).toBe(-103196);
    expect(statementAmount("0")).toBe(0);
    expect(statementAmount("Note 7")).toBeNull();
    expect(statementAmount("1,03.00")).toBeNull();
  });
});

describe("statement totals", () => {
  const line = (page: number, ...cells: string[]): LayoutLine => ({ page, y: 0, cells: cells.map((text, i) => ({ x: i * 100, text })), text: cells.join("   ") });
  it("takes a plain 'Total Income' line as the total, not as an account", () => {
    const s = parseIncomeStatement([
      line(1, "Income and Expenditure Statement", "Administrative Fund"),
      line(1, "Income"),
      line(1, "Levies", "100.00", "0.00"),
      line(1, "Total Income", "100.00", "0.00"),
      line(1, "Expenditure"),
      line(1, "Insurance", "40.00", "0.00"),
      line(1, "Total Expenses", "40.00", "0.00"),
    ]);
    expect(s.funds[0].income).toEqual([{ name: "Levies", actualCents: 10000, shortened: false }]);
    expect(s.funds[0]).toMatchObject({ printedIncomeCents: 10000, printedExpenditureCents: 4000 });
  });
});
