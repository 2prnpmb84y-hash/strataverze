/**
 * Reads the Income and Expenditure Statement pages of an annual financial
 * statement PDF (onboarding, 24 Oct). Written for the layout Urbanise Strata
 * prints: for each fund, a page headed "Income and Expenditure Statement" and
 * the fund's name, the period ("1 July 2025 to 30 June 2026"), an Income
 * section and an Expenditure section with one line per account (actuals,
 * budget, prior year actuals, prior year budget), the printed totals, and a
 * summary with the fund's opening and closing balances.
 *
 * Only the first amount on each account line (this year's actual) is taken.
 * Nothing is guessed: a line that cannot be read, a total that does not agree
 * with its lines, or a name the statement shortened is reported as an issue.
 */
import { readLayoutLines, type LayoutLine } from "@/lib/pdf/layout-text";
import type { FundKind } from "./income-budget";

export interface StatementLine {
  name: string;
  actualCents: number;
  /** The statement shortened the name ("..."): check it against the general ledger. */
  shortened: boolean;
}

export interface StatementFund {
  fundName: string;
  fundType: FundKind | null;
  income: StatementLine[];
  expenditure: StatementLine[];
  printedIncomeCents: number | null;
  printedExpenditureCents: number | null;
  openingBalanceCents: number | null;
  closingBalanceCents: number | null;
}

export interface IncomeStatement {
  period: { start: string; end: string } | null;
  funds: StatementFund[];
  issues: string[];
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

function longDateToIso(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[2].toLowerCase());
  if (month < 0) return null;
  return `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

/** "32,388.96", "$ 10,036.62", "(1,031.96)" or "0" to cents; null if it is not an amount. */
export function statementAmount(text: string): number | null {
  let t = text.trim().replace(/^\$\s*/, "");
  let negative = false;
  const paren = t.match(/^\((.*)\)$/);
  if (paren) {
    negative = true;
    t = paren[1].trim().replace(/^\$\s*/, "");
  } else if (t.startsWith("-")) {
    negative = true;
    t = t.slice(1);
  }
  if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d{2})?$/.test(t)) return null;
  const [whole, fraction = "00"] = t.replace(/,/g, "").split(".");
  const cents = Number(whole) * 100 + Number(fraction);
  return negative ? -cents : cents;
}

function fundTypeOf(name: string): FundKind | null {
  const n = name.toLowerCase();
  if (/admin/.test(n)) return "ADMINISTRATIVE";
  if (/capital works|sinking/.test(n)) return "CAPITAL_WORKS";
  return null;
}

const STATEMENT_HEAD = /^Income and Expenditure Statement( \(continued\))?$/i;

/** Pure: the statement from layout lines (so it can be tested without a PDF). */
export function parseIncomeStatement(lines: LayoutLine[]): IncomeStatement {
  const issues: string[] = [];
  const funds: StatementFund[] = [];
  let period: IncomeStatement["period"] = null;
  let current: StatementFund | null = null;
  let section: "income" | "expenditure" | null = null;
  let page = -1;

  const fundFor = (name: string) => {
    const existing = funds.find((f) => f.fundName.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    const f: StatementFund = { fundName: name, fundType: fundTypeOf(name), income: [], expenditure: [], printedIncomeCents: null, printedExpenditureCents: null, openingBalanceCents: null, closingBalanceCents: null };
    funds.push(f);
    return f;
  };

  for (const line of lines) {
    const cells = line.cells.map((c) => c.text);
    if (line.page !== page) {
      page = line.page;
      // A page that is not part of a statement ends the current fund.
      current = null;
      section = null;
    }
    const first = cells[0] ?? "";
    if (STATEMENT_HEAD.test(first)) {
      const name = cells.slice(1).find((c) => /fund$/i.test(c));
      if (name) {
        current = fundFor(name);
        section = null;
      }
      continue;
    }
    if (!current) continue;

    const range = cells.map((c) => c.match(/^(\d{1,2} [A-Za-z]+ \d{4}) to (\d{1,2} [A-Za-z]+ \d{4})$/)).find(Boolean);
    if (range) {
      const start = longDateToIso(range[1]);
      const end = longDateToIso(range[2]);
      if (start && end) {
        if (period && (period.start !== start || period.end !== end)) issues.push(`The ${current.fundName} statement is for ${range[0]}, a different period from the other funds.`);
        period ??= { start, end };
      }
      continue;
    }

    if (/^Income$/i.test(first)) {
      section = "income";
      continue;
    }
    if (/^Expenditure$/i.test(first)) {
      section = "expenditure";
      continue;
    }
    const amounts = cells.slice(1).map(statementAmount);
    const firstAmount = amounts.find((a): a is number => a !== null) ?? null;

    if (/^Total(\s.*)?\sIncome$/i.test(first)) {
      current.printedIncomeCents = firstAmount;
      section = null;
      continue;
    }
    if (/^Total(\s.*)?\s(Expenditure|Expenses)$/i.test(first)) {
      current.printedExpenditureCents = firstAmount;
      section = null;
      continue;
    }
    if (/^Surplus|^Summary$/i.test(first)) {
      section = null;
      continue;
    }
    if (/^Opening Balance as at/i.test(first)) {
      current.openingBalanceCents = firstAmount;
      continue;
    }
    if (/ balance as at /i.test(first) && /fund/i.test(first)) {
      current.closingBalanceCents = firstAmount;
      continue;
    }
    if (!section) continue;
    // Column headings ("01/07/25", "(PRIOR YEAR)") have no account name.
    if (cells.length < 2 || statementAmount(first) !== null || /^\d{2}\/\d{2}\/\d{2}/.test(first)) continue;
    if (amounts[0] === null || amounts[0] === undefined) {
      issues.push(`${current.fundName}: the line "${line.text}" could not be read.`);
      continue;
    }
    const shortened = /\.\.\.$|…$/.test(first);
    const name = first.replace(/\s*(\.\.\.|…)$/, "");
    (section === "income" ? current.income : current.expenditure).push({ name, actualCents: amounts[0], shortened });
    if (shortened) issues.push(`${current.fundName}: the statement shortened the account name "${first}". Check the full name in the general ledger.`);
  }

  for (const f of funds) {
    const inc = f.income.reduce((s, l) => s + l.actualCents, 0);
    const exp = f.expenditure.reduce((s, l) => s + l.actualCents, 0);
    if (f.printedIncomeCents === null) issues.push(`${f.fundName}: no total income was found.`);
    else if (inc !== f.printedIncomeCents) issues.push(`${f.fundName}: the income lines read add up to ${money(inc)}, but the statement's total is ${money(f.printedIncomeCents)}.`);
    if (f.printedExpenditureCents === null) issues.push(`${f.fundName}: no total expenditure was found.`);
    else if (exp !== f.printedExpenditureCents) issues.push(`${f.fundName}: the expenditure lines read add up to ${money(exp)}, but the statement's total is ${money(f.printedExpenditureCents)}.`);
    if (f.openingBalanceCents === null) issues.push(`${f.fundName}: no opening balance was found.`);
    if (f.openingBalanceCents !== null && f.closingBalanceCents !== null && f.openingBalanceCents + inc - exp !== f.closingBalanceCents) {
      issues.push(`${f.fundName}: the opening balance plus income less expenditure does not equal the closing balance the statement prints.`);
    }
    if (!f.fundType) issues.push(`"${f.fundName}" is not recognised as the administrative or capital works fund.`);
  }
  if (funds.length === 0) issues.push("No Income and Expenditure Statement was found in this PDF.");
  return { period, funds, issues };
}

function money(cents: number) {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const MAX_STATEMENT_PAGES = 400;

export async function readIncomeStatementPDF(data: Uint8Array): Promise<IncomeStatement> {
  const { lines } = await readLayoutLines(data, { maxPages: MAX_STATEMENT_PAGES });
  return parseIncomeStatement(lines);
}
