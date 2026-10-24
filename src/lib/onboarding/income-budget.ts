/**
 * Onboarding: last year's income and expenditure, this year's budget and the
 * year's levies (24 Oct). Pure, so the page and the server run the same checks.
 *
 * Last year's actuals are kept as comparatives by account. They are not
 * posted: the fund balances at takeover already include last year's result.
 * Where the takeover date is the last day of that year, each fund must
 * reconcile: the fund balance at the start of the year, plus income, less
 * expenditure, equals the fund balance in the opening balances.
 *
 * The budget is for the year after the last completed year. It is either
 * recorded as adopted at a general meeting held before StrataVerze took over
 * (with that meeting's date), or kept as a draft for adoption at a meeting
 * held in StrataVerze. The levies for each fund are the budget's levy income
 * line, raised at the chosen frequency from the first due date.
 */
import { auDate, formatMoney, parseIsoDate, parseMoney } from "./property-onboarding";
import { INSTALMENTS_PER_YEAR, addDays, financialYearStart } from "@/lib/levies/notice-plan";

export type FundKind = "ADMINISTRATIVE" | "CAPITAL_WORKS";
export type LineType = "INCOME" | "EXPENSE";

export const LEVY_FREQUENCIES = ["QUARTERLY", "MONTHLY", "HALF_YEARLY", "ANNUALLY"] as const;
export type OnboardingLevyFrequency = (typeof LEVY_FREQUENCIES)[number];

export const MAX_ACCOUNT_NAME = 200;
export const MAX_ROWS_PER_FUND = 200;

// ─── Years ──────────────────────────────────────────────────────────────────

export interface YearRange {
  /** The calendar year the financial year starts in (the platform's numbering). */
  financialYear: number;
  start: string;
  end: string;
}

export function yearRange(financialYear: number, yearEndMmdd: string): YearRange {
  const start = financialYearStart(financialYear, yearEndMmdd);
  const end = addDays(financialYearStart(financialYear + 1, yearEndMmdd), -1);
  return { financialYear, start, end };
}

/** The financial year a date falls in. */
export function yearContaining(date: string, yearEndMmdd: string): YearRange {
  const y = Number(date.slice(0, 4));
  for (const fy of [y + 1, y, y - 1]) {
    const r = yearRange(fy, yearEndMmdd);
    if (r.start <= date && date <= r.end) return r;
  }
  return yearRange(y, yearEndMmdd);
}

export interface OnboardingYears {
  /** The last financial year that ended on or before the takeover date. */
  lastYear: YearRange;
  /** The year the budget and levies are for: the one after `lastYear`. */
  budgetYear: YearRange;
  /**
   * True when the takeover date is the last day of `lastYear`, so the fund
   * balances at takeover are last year's closing balances and each fund can
   * be reconciled. Otherwise part of the budget year had passed at takeover
   * and its actuals to the takeover date are not captured here.
   */
  takeoverAtYearEnd: boolean;
}

export function onboardingYears(takeoverDate: string, yearEndMmdd: string): OnboardingYears {
  const containing = yearContaining(takeoverDate, yearEndMmdd);
  if (takeoverDate === containing.end) {
    return { lastYear: containing, budgetYear: yearRange(containing.financialYear + 1, yearEndMmdd), takeoverAtYearEnd: true };
  }
  return { lastYear: yearRange(containing.financialYear - 1, yearEndMmdd), budgetYear: containing, takeoverAtYearEnd: false };
}

/** "1 July 2025 to 30 June 2026". */
export function yearLabel(r: { start: string; end: string }): string {
  return `${longDate(r.start)} to ${longDate(r.end)}`;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export function longDate(isoValue: string): string {
  const p = parseIsoDate(isoValue);
  return p ? `${p.d} ${MONTHS[p.m - 1]} ${p.y}` : isoValue;
}

// ─── Input ──────────────────────────────────────────────────────────────────

export interface IncomeBudgetRowInput {
  /** An existing account of the fund, or "" for a new account named in `newAccountName`. */
  accountId: string;
  newAccountName: string;
  /** Used only for a new account; an existing account keeps its own type. */
  accountType: LineType;
  /** Last year's actual, as typed. */
  actual: string;
  /** This year's budget, as typed. */
  budget: string;
}

export interface FundIncomeBudgetInput {
  fundId: string;
  /** The fund balance at the start of last year, as typed. */
  openingBalance: string;
  rows: IncomeBudgetRowInput[];
}

export interface IncomeBudgetInput {
  funds: FundIncomeBudgetInput[];
  adoption: { kind: "before_takeover" | "draft"; meetingDate: string };
  levies: { frequency: string; firstDueDate: string };
}

// ─── Context (from the server) ──────────────────────────────────────────────

export interface ContextAccount {
  id: string;
  code: string;
  name: string;
  accountType: LineType;
}

export interface ContextFund {
  id: string;
  name: string;
  fundType: FundKind;
  /** The fund balance in the opening balances (equity), in cents; null if there is none. */
  balanceAtTakeoverCents: number | null;
  /** The fund's levy income account: its budget line is the levies to raise. */
  levyIncomeAccountId: string | null;
  /** The fund's active income and expense accounts. */
  accounts: ContextAccount[];
}

export interface IncomeBudgetContext {
  takeoverDate: string;
  years: OnboardingYears;
  funds: ContextFund[];
}

// ─── Checks ─────────────────────────────────────────────────────────────────

export interface ParsedRow {
  accountId: string | null;
  newAccountName: string | null;
  accountType: LineType;
  actualCents: number;
  budgetCents: number;
}

export interface ParsedFund {
  fundId: string;
  fundType: FundKind;
  rows: ParsedRow[];
  openingCents: number | null;
  actualIncomeCents: number;
  actualExpenseCents: number;
  budgetIncomeCents: number;
  budgetExpenseCents: number;
  /** The budget on the levy income line: the levies to raise for the year. */
  levyCents: number;
}

export interface ParsedIncomeBudget {
  funds: ParsedFund[];
  adoption: { kind: "before_takeover"; meetingDate: string } | { kind: "draft" };
  levies: { frequency: OnboardingLevyFrequency; firstDueDate: string };
}

export interface IncomeBudgetCheck {
  /** Problems that are not about one fund. */
  problems: string[];
  /** Problems by fund id. */
  fundProblems: Record<string, string[]>;
  /** Points to note that do not stop saving. */
  notes: string[];
  parsed: ParsedIncomeBudget | null;
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

function isBlankRow(r: IncomeBudgetRowInput) {
  return !r.accountId && !r.newAccountName.trim() && !r.actual.trim() && !r.budget.trim();
}

export function checkIncomeBudget(input: IncomeBudgetInput, ctx: IncomeBudgetContext): IncomeBudgetCheck {
  const problems: string[] = [];
  const fundProblems: Record<string, string[]> = {};
  const notes: string[] = [];
  const { lastYear, budgetYear, takeoverAtYearEnd } = ctx.years;
  const parsedFunds: ParsedFund[] = [];

  if (!takeoverAtYearEnd) {
    notes.push(
      `The takeover date, ${auDate(ctx.takeoverDate)}, is part way through the year ${yearLabel(budgetYear)}. ` +
        `Last year's figures cannot be reconciled with the opening balances, and the actuals from ${auDate(budgetYear.start)} to ${auDate(ctx.takeoverDate)} are not captured here.`,
    );
  }

  for (const fund of ctx.funds) {
    const list: string[] = [];
    fundProblems[fund.id] = list;
    const fin = input.funds.find((f) => f.fundId === fund.id) ?? { fundId: fund.id, openingBalance: "", rows: [] };
    const rows = fin.rows.filter((r) => !isBlankRow(r));
    if (rows.length > MAX_ROWS_PER_FUND) {
      list.push(`At most ${MAX_ROWS_PER_FUND} accounts can be entered for a fund.`);
      continue;
    }
    const byId = new Map(fund.accounts.map((a) => [a.id, a]));
    const byName = new Map(fund.accounts.map((a) => [norm(a.name), a]));
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();
    const parsedRows: ParsedRow[] = [];

    rows.forEach((r, i) => {
      const n = i + 1;
      let accountId: string | null = null;
      let newAccountName: string | null = null;
      let accountType: LineType;
      if (r.accountId) {
        const a = byId.get(r.accountId);
        if (!a) {
          list.push(`Row ${n}: choose one of the ${fund.name}'s income or expense accounts.`);
          return;
        }
        if (seenIds.has(a.id)) {
          list.push(`Row ${n}: ${a.code} ${a.name} is already entered. Enter each account once.`);
          return;
        }
        seenIds.add(a.id);
        accountId = a.id;
        accountType = a.accountType;
      } else {
        const name = r.newAccountName.trim().replace(/\s+/g, " ");
        if (!name) {
          list.push(`Row ${n}: choose an account or enter the name of a new one.`);
          return;
        }
        if (name.length > MAX_ACCOUNT_NAME) {
          list.push(`Row ${n}: an account name can be at most ${MAX_ACCOUNT_NAME} characters.`);
          return;
        }
        const existing = byName.get(norm(name));
        if (existing) {
          list.push(`Row ${n}: the ${fund.name} already has an account called "${existing.name}" (${existing.code}). Choose it from the list.`);
          return;
        }
        if (seenNames.has(norm(name))) {
          list.push(`Row ${n}: "${name}" is entered twice. Enter each account once.`);
          return;
        }
        if (r.accountType !== "INCOME" && r.accountType !== "EXPENSE") {
          list.push(`Row ${n}: say whether "${name}" is income or expenditure.`);
          return;
        }
        seenNames.add(norm(name));
        newAccountName = name;
        accountType = r.accountType;
      }
      const label = accountId ? `${byId.get(accountId)!.name}` : `"${newAccountName}"`;
      // A refund can make a year's actual negative; a budget cannot be.
      const actualCents = parseMoney(r.actual, { allowNegative: true });
      const budgetCents = parseMoney(r.budget);
      if (actualCents === null) list.push(`Row ${n}: last year's amount for ${label} is not an amount in dollars and cents.`);
      if (budgetCents === null) list.push(`Row ${n}: the budget for ${label} must be an amount in dollars and cents, and not negative.`);
      if (actualCents === null || budgetCents === null) return;
      parsedRows.push({ accountId, newAccountName, accountType, actualCents, budgetCents });
    });

    const sum = (t: LineType, k: "actualCents" | "budgetCents") => parsedRows.filter((r) => r.accountType === t).reduce((s, r) => s + r[k], 0);
    const actualIncomeCents = sum("INCOME", "actualCents");
    const actualExpenseCents = sum("EXPENSE", "actualCents");
    const budgetIncomeCents = sum("INCOME", "budgetCents");
    const budgetExpenseCents = sum("EXPENSE", "budgetCents");
    const levyRow = parsedRows.find((r) => r.accountId && r.accountId === fund.levyIncomeAccountId);
    const levyCents = levyRow?.budgetCents ?? 0;

    // Last year must reconcile with the opening balances.
    let openingCents: number | null = null;
    const hasActuals = parsedRows.some((r) => r.actualCents !== 0);
    if (fin.openingBalance.trim() !== "") {
      openingCents = parseMoney(fin.openingBalance, { allowNegative: true });
      if (openingCents === null) list.push(`The fund balance at ${auDate(lastYear.start)} is not an amount in dollars and cents.`);
    }
    if (takeoverAtYearEnd) {
      if (!hasActuals) {
        list.push(`Enter last year's income and expenditure for the ${fund.name}, as in the financial statements for ${yearLabel(lastYear)}.`);
      } else if (fin.openingBalance.trim() === "") {
        list.push(`Enter the ${fund.name} balance at ${auDate(lastYear.start)} (the opening balance in last year's statements).`);
      } else if (openingCents !== null && fund.balanceAtTakeoverCents !== null) {
        const closing = openingCents + actualIncomeCents - actualExpenseCents;
        if (closing !== fund.balanceAtTakeoverCents) {
          list.push(
            `Last year does not reconcile: ${formatMoney(openingCents)} at ${auDate(lastYear.start)}, plus income of ${formatMoney(actualIncomeCents)}, less expenditure of ${formatMoney(actualExpenseCents)}, comes to ${formatMoney(closing)}. ` +
              `The opening balances have ${formatMoney(fund.balanceAtTakeoverCents)} at ${auDate(ctx.takeoverDate)}, a difference of ${formatMoney(fund.balanceAtTakeoverCents - closing)}.`,
          );
        }
      }
    }

    // The budget.
    if (budgetExpenseCents === 0 && budgetIncomeCents === 0) {
      list.push(`Enter the ${fund.name} budget for ${yearLabel(budgetYear)}.`);
    } else if (!fund.levyIncomeAccountId) {
      list.push(`The ${fund.name} has no levy income account. Add one in the chart of accounts first.`);
    } else if (levyCents === 0) {
      const levyAccount = fund.accounts.find((a) => a.id === fund.levyIncomeAccountId);
      if (fund.fundType === "ADMINISTRATIVE") {
        list.push(`Enter the levies to be raised for the year on the ${levyAccount ? `${levyAccount.code} ${levyAccount.name}` : "levy income"} line of the budget.`);
      } else {
        notes.push(`No levies are budgeted for the ${fund.name}, so no levy schedule will be made for it.`);
      }
    }

    parsedFunds.push({
      fundId: fund.id,
      fundType: fund.fundType,
      rows: parsedRows,
      openingCents,
      actualIncomeCents,
      actualExpenseCents,
      budgetIncomeCents,
      budgetExpenseCents,
      levyCents,
    });
  }

  // Adoption.
  let adoption: ParsedIncomeBudget["adoption"] | null = null;
  if (input.adoption.kind === "draft") adoption = { kind: "draft" };
  else if (input.adoption.kind === "before_takeover") {
    const d = input.adoption.meetingDate.trim();
    if (!parseIsoDate(d)) problems.push("Enter the date of the general meeting that adopted the budget.");
    else if (d > ctx.takeoverDate) {
      problems.push(`The meeting on ${auDate(d)} was after the takeover on ${auDate(ctx.takeoverDate)}. Record a meeting held in StrataVerze on the Budget page, or keep the budget as a draft.`);
    } else if (d < lastYear.start) problems.push(`The meeting on ${auDate(d)} is before ${auDate(lastYear.start)}. Enter the meeting that adopted the budget for ${yearLabel(budgetYear)}.`);
    else adoption = { kind: "before_takeover", meetingDate: d };
  } else problems.push("Say whether the budget was adopted before the takeover.");

  // Levies.
  let levies: ParsedIncomeBudget["levies"] | null = null;
  const frequency = LEVY_FREQUENCIES.find((f) => f === input.levies.frequency);
  const due = input.levies.firstDueDate.trim();
  const anyLevies = parsedFunds.some((f) => f.levyCents > 0);
  if (!frequency) problems.push("Choose how often levies are raised.");
  if (anyLevies) {
    if (!parseIsoDate(due)) problems.push("Enter the due date of the first levy instalment.");
    else if (due < budgetYear.start || due > budgetYear.end) problems.push(`The first levy instalment must fall due in ${yearLabel(budgetYear)}.`);
  }
  if (frequency && (!anyLevies || (parseIsoDate(due) && due >= budgetYear.start && due <= budgetYear.end))) {
    levies = { frequency, firstDueDate: anyLevies ? due : "" };
  }

  const ok = problems.length === 0 && Object.values(fundProblems).every((l) => l.length === 0) && adoption && levies;
  return { problems, fundProblems, notes, parsed: ok ? { funds: parsedFunds, adoption: adoption!, levies: levies! } : null };
}

/** Each instalment of a fund's levies, in cents (the last takes any odd cents). */
export function instalments(levyCents: number, frequency: OnboardingLevyFrequency): number[] {
  const n = INSTALMENTS_PER_YEAR[frequency];
  const each = Math.floor(levyCents / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? levyCents - each * (n - 1) : each));
}

// ─── New account codes ──────────────────────────────────────────────────────

/** The code prefix for new accounts: 4 income and 5 expense, 1 administrative and 2 capital works. */
export function codePrefix(fundType: FundKind, accountType: LineType): string {
  return `${accountType === "INCOME" ? "4" : "5"}-${fundType === "CAPITAL_WORKS" ? "2" : "1"}`;
}

/**
 * `count` unused codes after the highest in the prefix's range, 10 apart
 * (5-1510, 5-1520, ...), filling gaps from the bottom when the range's top is
 * used. Null when the range is full.
 */
export function nextAccountCodes(existingCodes: Iterable<string>, prefix: string, count: number): string[] | null {
  const used = new Set<number>();
  for (const c of existingCodes) {
    const m = c.match(/^(\d)-(\d)(\d{3})$/);
    if (m && `${m[1]}-${m[2]}` === prefix) used.add(Number(m[3]));
  }
  const out: string[] = [];
  const top = used.size ? Math.max(...used) : -10;
  let next = Math.floor(top / 10) * 10 + 10;
  const take = (n: number) => out.push(`${prefix}${String(n).padStart(3, "0")}`);
  while (out.length < count && next <= 990) {
    if (!used.has(next)) take(next);
    next += 10;
  }
  // Then the gaps: every tenth code first, then any code at all.
  for (const step of [10, 1]) {
    for (let n = step; out.length < count && n <= 999; n += step) {
      if (!used.has(n) && !out.includes(`${prefix}${String(n).padStart(3, "0")}`)) take(n);
    }
  }
  return out.length === count ? out : null;
}
