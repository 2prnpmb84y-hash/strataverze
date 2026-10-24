import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";
import { currentBudgetLines } from "@/lib/finance/budgets";
import { getAdoptedPlan, isCapitalWorksFund } from "@/lib/finance/capital-works-plans";
import { spendByYear } from "@/lib/finance/capital-works-plan";
import { levyIncomeAccountPicker, recognisedIncomeExpense, type AccountingBasis, type BasisEntry, type RecognisedLine } from "@/lib/finance/accounting-basis";
import { LEDGER_STATUSES, inLedger } from "@/lib/finance/ledger-status";
import { migratedInvoiceEntries } from "@/lib/finance/migrated-invoices";

/** Cast an ISO string to the Prisma 8 TimestampString branded type. */
function toTimestamp(value: string): TimestampString<3> {
  return value as unknown as TimestampString<3>;
}

// ─── Income and Expenditure Report ─────────────────────────────

export interface IncomeExpenseLineItem {
  accountCode: string;
  accountName: string;
  fundName: string;
  accountType: string;
  currentAmount: number;
  comparativeAmount: number;
}

export interface IncomeExpenseReport {
  incomeLines: IncomeExpenseLineItem[];
  expenseLines: IncomeExpenseLineItem[];
  totalIncome: number;
  totalExpenses: number;
  netSurplus: number;
  comparativeTotalIncome: number;
  comparativeTotalExpenses: number;
  comparativeNetSurplus: number;
}

/**
 * Generate an income and expenditure report for a scheme and fund.
 * Uses posted journal entries only.
 */
export async function getIncomeExpenseReport(
  schemeId: string,
  fundId: string | null,
  startDate: string,
  endDate: string,
  compStartDate: string,
  compEndDate: string,
): Promise<IncomeExpenseReport> {
  try {
  // Every posted entry up to the end of the later period: a cash basis report
  // needs invoices approved before the period to recognise payments in it.
  const lastEnd = endDate > compEndDate ? endDate : compEndDate;
  const [entries, funds, accounts] = await Promise.all([
    db.orm.public.JournalEntry
      .where((je) => and(je.schemeId.eq(schemeId), je.status.in(LEDGER_STATUSES), je.transactionDate.lte(toTimestamp(lastEnd))))
      .include("lines", (l) => l.include("accountCode"))
      .limit(50000)
      .all(),
    db.orm.public.Fund.where((f) => f.schemeId.eq(schemeId)).limit(20).all(),
    db.orm.public.AccountCode.where((a) => and(a.schemeId.eq(schemeId), a.accountSubType.eq("LEVY_INCOME"))).limit(20).all(),
  ]);
  const fundById = new Map(funds.map((f) => [f.id, f]));
  const basisEntries = toBasisEntries(entries, fundId);
  const extraInvoices = (await migratedInvoiceEntries(schemeId)).map((e) => ({ ...e, lines: e.lines.filter((l) => !fundId || l.fundId === fundId) }));
  const levyIncomeAccount = levyIncomeAccountPicker(accounts);
  const basisForFund = (fid: string) => (fundById.get(fid)?.accountingBasis === "ACCRUAL" ? "ACCRUAL" : "CASH") as AccountingBasis;
  const toTotals = (lines: RecognisedLine[]) => {
    const out: Record<string, AccountAggregate> = {};
    for (const l of lines) {
      const key = l.accountCode;
      out[key] ??= {
        accountCode: l.accountCode,
        accountName: l.accountName,
        fundName: String(fundById.get(l.fundId)?.name ?? ""),
        accountType: l.accountType,
        amount: 0,
      };
      out[key].amount += l.amountCents / 100;
    }
    return out;
  };
  const currentTotals = toTotals(recognisedIncomeExpense({ entries: basisEntries, start: startDate, end: endDate, basisForFund, levyIncomeAccount, extraInvoices }));
  const compTotals = toTotals(recognisedIncomeExpense({ entries: basisEntries, start: compStartDate, end: compEndDate, basisForFund, levyIncomeAccount, extraInvoices }));

  // Build report lines
  const allCodes = new Set([
    ...Object.keys(currentTotals),
    ...Object.keys(compTotals),
  ]);

  const incomeLines: IncomeExpenseLineItem[] = [];
  const expenseLines: IncomeExpenseLineItem[] = [];

  for (const code of allCodes) {
    const current = currentTotals[code];
    const comp = compTotals[code];
    const accountType = current?.accountType ?? comp?.accountType ?? "";

    if (accountType !== "INCOME" && accountType !== "EXPENSE") continue;

    const line: IncomeExpenseLineItem = {
      accountCode: current?.accountCode ?? comp?.accountCode ?? code,
      accountName: current?.accountName ?? comp?.accountName ?? "",
      fundName: current?.fundName ?? comp?.fundName ?? "",
      accountType,
      currentAmount: current?.amount ?? 0,
      comparativeAmount: comp?.amount ?? 0,
    };

    if (accountType === "INCOME") {
      incomeLines.push(line);
    } else {
      expenseLines.push(line);
    }
  }

  // Sort by account code
  incomeLines.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
  expenseLines.sort((a, b) => a.accountCode.localeCompare(b.accountCode));

  const totalIncome = incomeLines.reduce((s, l) => s + l.currentAmount, 0);
  const totalExpenses = expenseLines.reduce((s, l) => s + l.currentAmount, 0);
  const comparativeTotalIncome = incomeLines.reduce(
    (s, l) => s + l.comparativeAmount,
    0,
  );
  const comparativeTotalExpenses = expenseLines.reduce(
    (s, l) => s + l.comparativeAmount,
    0,
  );

  return {
    incomeLines,
    expenseLines,
    totalIncome,
    totalExpenses,
    netSurplus: totalIncome - totalExpenses,
    comparativeTotalIncome,
    comparativeTotalExpenses,
    comparativeNetSurplus: comparativeTotalIncome - comparativeTotalExpenses,
  };

  } catch {
    // Table may not exist yet
    return {
    incomeLines: [],
    expenseLines: [],
    totalIncome: 0,
    totalExpenses: 0,
    netSurplus: 0,
    comparativeTotalIncome: 0,
    comparativeTotalExpenses: 0,
    comparativeNetSurplus: 0,
  };
  }
}

/** Posted entries in the shape the basis filter takes, optionally limited to one fund's lines. */
export function toBasisEntries(
  entries: Array<{
    id: string;
    transactionDate: unknown;
    sourceType: string | null;
    sourceId: string | null;
    lines?: Array<{
      accountCodeId: string;
      fundId: string;
      debit: unknown;
      credit: unknown;
      accountCode: { code: unknown; name: unknown; accountType: unknown; accountSubType: string | null } | null;
    }>;
  }>,
  fundId: string | null = null,
): BasisEntry[] {
  return entries.map((e) => ({
    id: e.id,
    date: String(e.transactionDate).slice(0, 10),
    sourceType: e.sourceType,
    sourceId: e.sourceId,
    lines: (e.lines ?? [])
      .filter((l) => l.accountCode && (!fundId || l.fundId === fundId))
      .map((l) => ({
        accountId: l.accountCodeId,
        accountCode: String(l.accountCode!.code),
        accountName: String(l.accountCode!.name),
        accountType: String(l.accountCode!.accountType),
        accountSubType: l.accountCode!.accountSubType ?? null,
        fundId: l.fundId,
        debitCents: Math.round(Number(l.debit ?? 0) * 100),
        creditCents: Math.round(Number(l.credit ?? 0) * 100),
      })),
  }));
}

interface AccountAggregate {
  accountCode: string;
  accountName: string;
  fundName: string;
  accountType: string;
  amount: number;
}

// ─── Ledger income and expenditure (adviser and accountant report) ─────

export interface LedgerAccountLine {
  accountCodeId: string;
  code: string;
  name: string;
  accountType: string;
  fundId: string | null;
  fundName: string;
  totalDebit: number;
  totalCredit: number;
  netAmount: number;
}

/**
 * Income and expense accounts as posted in the ledger, per account and fund,
 * for a period. Every ledger entry is included (a reversed entry and its
 * reversal net to zero), with no row limit, so each figure matches its
 * drill-down.
 */
export async function getLedgerIncomeExpenditure(
  schemeId: string,
  filters: { fundId?: string | null; startDate?: string | null; endDate?: string | null },
) {
  let q = db.orm.public.JournalEntry.where((je) => and(je.schemeId.eq(schemeId), je.status.in(LEDGER_STATUSES)));
  if (filters.startDate) q = q.where((je) => je.transactionDate.gte(toTimestamp(filters.startDate!)));
  if (filters.endDate) q = q.where((je) => je.transactionDate.lte(toTimestamp(filters.endDate!)));
  const entries = await q.include("lines", (l) => l.include("accountCode").include("fund")).limit(50000).all();

  const map = new Map<string, LedgerAccountLine & { debitCents: number; creditCents: number }>();
  for (const e of entries) {
    for (const line of e.lines ?? []) {
      if (filters.fundId && line.fundId !== filters.fundId) continue;
      const a = line.accountCode;
      if (!a) continue;
      const type = String(a.accountType);
      if (type !== "INCOME" && type !== "EXPENSE") continue;
      const key = `${a.id}:${line.fundId}`;
      const row = map.get(key) ?? {
        accountCodeId: a.id,
        code: String(a.code),
        name: String(a.name),
        accountType: type,
        fundId: line.fundId ?? null,
        fundName: line.fund ? String(line.fund.name) : "Unallocated",
        totalDebit: 0,
        totalCredit: 0,
        netAmount: 0,
        debitCents: 0,
        creditCents: 0,
      };
      row.debitCents += Math.round(Number(line.debit ?? 0) * 100);
      row.creditCents += Math.round(Number(line.credit ?? 0) * 100);
      map.set(key, row);
    }
  }
  const rows: LedgerAccountLine[] = [...map.values()].map(({ debitCents, creditCents, ...r }) => ({
    ...r,
    totalDebit: debitCents / 100,
    totalCredit: creditCents / 100,
    netAmount: (r.accountType === "INCOME" ? creditCents - debitCents : debitCents - creditCents) / 100,
  }));
  const byCode = (a: LedgerAccountLine, b: LedgerAccountLine) => a.code.localeCompare(b.code) || a.fundName.localeCompare(b.fundName);
  const incomeAccounts = rows.filter((r) => r.accountType === "INCOME").sort(byCode);
  const expenseAccounts = rows.filter((r) => r.accountType === "EXPENSE").sort(byCode);
  const sum = (xs: LedgerAccountLine[]) => Math.round(xs.reduce((s, r) => s + r.netAmount * 100, 0)) / 100;
  const totalIncome = sum(incomeAccounts);
  const totalExpenses = sum(expenseAccounts);
  return { incomeAccounts, expenseAccounts, totalIncome, totalExpenses, netSurplus: Math.round((totalIncome - totalExpenses) * 100) / 100 };
}

// ─── Aged Arrears Report ────────────────────────────────────────

export interface AgedArrearsItem {
  lotNumber: string;
  unitNumber: string;
  ownerName: string;
  current: number;
  days30: number;
  days60: number;
  days90: number;
  days90Plus: number;
  total: number;
  interestCharged: number;
}

/**
 * Generate an aged arrears report for outstanding levies.
 */
export async function getAgedArrearsReport(
  schemeId: string,
  asAtDate: string,
): Promise<AgedArrearsItem[]> {
  try {
  // Fetch all levy notices with outstanding balances
  const notices = await db.orm.public.LevyNotice
    .where((ln) => ln.schemeId.eq(schemeId))
    .include("lot")
    .limit(2000)
    .all();

  const asAt = new Date(asAtDate);
  const lotArrears: Record<string, AgedArrearsItem> = {};

  for (const notice of notices) {
    const balance = Number(notice.balanceOutstanding ?? 0);
    if (balance <= 0) continue;

    const dueDate = new Date(String(notice.dueDate));
    const daysOverdue = Math.floor(
      (asAt.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    const lotId = notice.lotId ?? "unknown";
    if (!lotArrears[lotId]) {
      // Get lot owner info
      const lot = notice.lot;
      lotArrears[lotId] = {
        lotNumber: lot ? String(lot.lotNumber) : "",
        unitNumber: lot ? String(lot.unitNumber ?? "") : "",
        ownerName: "", // Will be populated below
        current: 0,
        days30: 0,
        days60: 0,
        days90: 0,
        days90Plus: 0,
        total: 0,
        interestCharged: Number(notice.interestCharged ?? 0),
      };
    }

    if (daysOverdue <= 0) {
      lotArrears[lotId].current += balance;
    } else if (daysOverdue <= 30) {
      lotArrears[lotId].days30 += balance;
    } else if (daysOverdue <= 60) {
      lotArrears[lotId].days60 += balance;
    } else if (daysOverdue <= 90) {
      lotArrears[lotId].days90 += balance;
    } else {
      lotArrears[lotId].days90Plus += balance;
    }
    lotArrears[lotId].total += balance;
    lotArrears[lotId].interestCharged += Number(notice.interestCharged ?? 0);
  }

  // Populate owner names from lot memberships
  const lotIds = Object.keys(lotArrears);
  if (lotIds.length > 0) {
    for (const lotId of lotIds) {
      const lot = await db.orm.public.Lot
        .where((l) => l.id.eq(lotId))
        .include("memberships", (m) =>
          m.where((sm) => and(sm.isActive.eq(true), sm.role.eq("OWNER")))
            .include("profile"),
        )
        .first();

      if (lot && lot.memberships.length > 0 && lot.memberships[0].profile) {
        const profile = lot.memberships[0].profile;
        lotArrears[lotId].ownerName = [
          String(profile.firstName ?? ""),
          String(profile.lastName ?? ""),
        ]
          .filter(Boolean)
          .join(" ");
      }
    }
  }

  return Object.values(lotArrears).sort((a, b) =>
    a.lotNumber.localeCompare(b.lotNumber, undefined, { numeric: true }),
  );

  } catch {
    // Table may not exist yet
    return [];
  }
}

// ─── Levy Register Report ───────────────────────────────────────

export interface LevyRegisterItem {
  noticeNumber: string;
  lotNumber: string;
  unitNumber: string;
  ownerName: string;
  fundName: string;
  dueDate: string;
  amountDue: number;
  amountPaid: number;
  balanceOutstanding: number;
  status: string;
}

/**
 * Generate a levy register report.
 */
export async function getLevyRegisterReport(
  schemeId: string,
  fundId: string | null,
  startDate: string | null,
  endDate: string | null,
  status: string | null,
): Promise<LevyRegisterItem[]> {
  try {
  let query = db.orm.public.LevyNotice.where((ln) =>
    ln.schemeId.eq(schemeId),
  );

  if (startDate) {
    query = query.where((ln) =>
      ln.dueDate.gte(toTimestamp(startDate)),
    );
  }
  if (endDate) {
    query = query.where((ln) =>
      ln.dueDate.lte(toTimestamp(endDate)),
    );
  }
  if (status) {
    query = query.where((ln) => ln.status.eq(status));
  }

  const notices = await query
    .include("lot")
    .include("levySchedule", (ls) => ls.include("fund"))
    .orderBy((ln) => ln.dueDate.desc())
    .limit(500)
    .all();

  const items: LevyRegisterItem[] = [];

  for (const notice of notices) {
    // Filter by fund if specified
    if (fundId && notice.levySchedule?.fundId !== fundId) continue;

    // Get owner name
    let ownerName = "";
    if (notice.lotId) {
      const lot = await db.orm.public.Lot
        .where((l) => l.id.eq(notice.lotId!))
        .include("memberships", (m) =>
          m.where((sm) => and(sm.isActive.eq(true), sm.role.eq("OWNER")))
            .include("profile")
            .limit(1),
        )
        .first();
      if (lot && lot.memberships.length > 0 && lot.memberships[0].profile) {
        const p = lot.memberships[0].profile;
        ownerName = [String(p.firstName ?? ""), String(p.lastName ?? "")]
          .filter(Boolean)
          .join(" ");
      }
    }

    items.push({
      noticeNumber: String(notice.noticeNumber ?? ""),
      lotNumber: notice.lot ? String(notice.lot.lotNumber) : "",
      unitNumber: notice.lot ? String(notice.lot.unitNumber ?? "") : "",
      ownerName,
      fundName: notice.levySchedule?.fund
        ? String(notice.levySchedule.fund.name)
        : "",
      dueDate: String(notice.dueDate),
      amountDue: Number(notice.amountDue ?? 0),
      amountPaid: Number(notice.amountPaid ?? 0),
      balanceOutstanding: Number(notice.balanceOutstanding ?? 0),
      status: String(notice.status),
    });
  }

  return items;

  } catch {
    // Table may not exist yet
    return [];
  }
}

// ─── Trial Balance Report ──────────────────────────────────────

export interface TrialBalanceLineItem {
  accountCodeId: string;
  fundId: string | null;
  accountCode: string;
  accountName: string;
  accountType: string;
  fundName: string;
  debitBalance: number;
  creditBalance: number;
}

export interface TrialBalanceReport {
  lines: TrialBalanceLineItem[];
  totalDebits: number;
  totalCredits: number;
  isBalanced: boolean;
}

/**
 * Generate a trial balance report for a scheme as at a given date.
 * Aggregates all posted journal entry lines into debit/credit balances
 * per account code. The trial balance must always be in balance
 * (total debits = total credits).
 */
export async function getTrialBalanceReport(
  schemeId: string,
  asAtDate: string,
  fundId: string | null,
): Promise<TrialBalanceReport> {
  try {
  // Fetch all posted journal entries up to the as-at date
  const entries = await db.orm.public.JournalEntry
    .where((je) =>
      and(
        je.schemeId.eq(schemeId),
        je.status.in(LEDGER_STATUSES),
        je.transactionDate.lte(toTimestamp(asAtDate)),
      ),
    )
    .include("lines", (l) => l.include("accountCode").include("fund"))
    .limit(50000)
    .all();

  // Aggregate by account code
  const accountTotals = new Map<
    string,
    {
      accountCodeId: string;
      fundId: string | null;
      accountCode: string;
      accountName: string;
      accountType: string;
      fundName: string;
      totalDebit: number;
      totalCredit: number;
    }
  >();

  for (const entry of entries) {
    for (const line of entry.lines) {
      if (fundId && line.fundId !== fundId) continue;
      if (!line.accountCode) continue;

      const code = String(line.accountCode.code);
      const key = `${line.accountCode.id}-${line.fundId ?? "none"}`;

      const existing = accountTotals.get(key);
      const debit = Number(line.debit ?? 0);
      const credit = Number(line.credit ?? 0);

      if (existing) {
        existing.totalDebit += debit;
        existing.totalCredit += credit;
      } else {
        accountTotals.set(key, {
          accountCodeId: line.accountCode.id,
          fundId: line.fundId ?? null,
          accountCode: code,
          accountName: String(line.accountCode.name),
          accountType: String(line.accountCode.accountType),
          fundName: line.fund ? String(line.fund.name) : "Unallocated",
          totalDebit: debit,
          totalCredit: credit,
        });
      }
    }
  }

  // Build trial balance lines with net debit or credit balances
  const lines: TrialBalanceLineItem[] = [];

  for (const acc of accountTotals.values()) {
    const net = acc.totalDebit - acc.totalCredit;
    if (Math.abs(net) < 0.005) continue; // Skip zero-balance accounts

    lines.push({
      accountCodeId: acc.accountCodeId,
      fundId: acc.fundId,
      accountCode: acc.accountCode,
      accountName: acc.accountName,
      accountType: acc.accountType,
      fundName: acc.fundName,
      debitBalance: net > 0 ? Math.round(net * 100) / 100 : 0,
      creditBalance: net < 0 ? Math.round(Math.abs(net) * 100) / 100 : 0,
    });
  }

  lines.sort((a, b) => a.accountCode.localeCompare(b.accountCode));

  const totalDebits = lines.reduce((sum, l) => sum + l.debitBalance, 0);
  const totalCredits = lines.reduce((sum, l) => sum + l.creditBalance, 0);

  return {
    lines,
    totalDebits: Math.round(totalDebits * 100) / 100,
    totalCredits: Math.round(totalCredits * 100) / 100,
    isBalanced:
      Math.abs(Math.round(totalDebits * 100) - Math.round(totalCredits * 100)) < 1,
  };

  } catch {
    // Table may not exist yet
    return {
    lines: [],
    totalDebits: 0,
    totalCredits: 0,
    isBalanced: true,
  };
  }
}

// ─── Fund Summary Report ──────────────────────────────────────

export interface FundSummaryItem {
  fundId: string;
  fundName: string;
  fundType: string;
  openingBalance: number;
  totalIncome: number;
  totalExpenses: number;
  netMovement: number;
  closingBalance: number;
  totalLevied: number;
  totalCollected: number;
  outstandingLevies: number;
}

/**
 * Generate a fund summary showing the financial position per fund.
 * Combines journal entry aggregates with levy collection data.
 */
export async function getFundSummaryReport(
  schemeId: string,
  startDate: string,
  endDate: string,
): Promise<FundSummaryItem[]> {
  try {
  // Fetch funds for the scheme
  const funds = await db.orm.public.Fund
    .where((f) => and(f.schemeId.eq(schemeId), f.deletedAt.eq(null)))
    .limit(20)
    .all();

  if (funds.length === 0) return [];

  // Fetch all posted journal entries in the period
  const periodEntries = await db.orm.public.JournalEntry
    .where((je) =>
      and(
        je.schemeId.eq(schemeId),
        je.status.in(LEDGER_STATUSES),
        je.transactionDate.gte(toTimestamp(startDate)),
        je.transactionDate.lte(toTimestamp(endDate)),
      ),
    )
    .include("lines", (l) => l.include("accountCode").include("fund"))
    .limit(5000)
    .all();

  // Fetch entries before the period for opening balances
  const priorEntries = await db.orm.public.JournalEntry
    .where((je) =>
      and(
        je.schemeId.eq(schemeId),
        je.status.in(LEDGER_STATUSES),
        je.transactionDate.lt(toTimestamp(startDate)),
      ),
    )
    .include("lines", (l) => l.include("accountCode").include("fund"))
    .limit(5000)
    .all();

  // Fetch levy notices for the scheme
  const levyNotices = await db.orm.public.LevyNotice
    .where((ln) => ln.schemeId.eq(schemeId))
    .include("fund")
    .limit(5000)
    .all();

  const summaries: FundSummaryItem[] = [];

  for (const fund of funds) {
    // Calculate opening balance from prior entries (net assets = assets - liabilities)
    let openingBalance = Number(fund.balance ?? 0);
    let priorNet = 0;
    for (const entry of priorEntries) {
      for (const line of entry.lines) {
        if (line.fundId !== fund.id) continue;
        if (!line.accountCode) continue;
        const accountType = String(line.accountCode.accountType);
        const debit = Number(line.debit ?? 0);
        const credit = Number(line.credit ?? 0);

        if (accountType === "INCOME") {
          priorNet += credit - debit;
        } else if (accountType === "EXPENSE") {
          priorNet -= debit - credit;
        }
      }
    }
    // If there are prior entries, use the calculated balance
    if (priorEntries.length > 0) {
      openingBalance = priorNet;
    }

    // Calculate current period income and expenses
    let totalIncome = 0;
    let totalExpenses = 0;

    for (const entry of periodEntries) {
      for (const line of entry.lines) {
        if (line.fundId !== fund.id) continue;
        if (!line.accountCode) continue;
        const accountType = String(line.accountCode.accountType);
        const debit = Number(line.debit ?? 0);
        const credit = Number(line.credit ?? 0);

        if (accountType === "INCOME") {
          totalIncome += credit - debit;
        } else if (accountType === "EXPENSE") {
          totalExpenses += debit - credit;
        }
      }
    }

    const netMovement = totalIncome - totalExpenses;
    const closingBalance = openingBalance + netMovement;

    // Levy collection data for this fund
    const fundNotices = levyNotices.filter((n) => n.fundId === fund.id);
    const totalLevied = fundNotices.reduce(
      (sum, n) => sum + Number(n.amountDue ?? 0),
      0,
    );
    const totalCollected = fundNotices.reduce(
      (sum, n) => sum + Number(n.amountPaid ?? 0),
      0,
    );

    summaries.push({
      fundId: fund.id,
      fundName: String(fund.name),
      fundType: String(fund.fundType),
      openingBalance: Math.round(openingBalance * 100) / 100,
      totalIncome: Math.round(totalIncome * 100) / 100,
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      netMovement: Math.round(netMovement * 100) / 100,
      closingBalance: Math.round(closingBalance * 100) / 100,
      totalLevied: Math.round(totalLevied * 100) / 100,
      totalCollected: Math.round(totalCollected * 100) / 100,
      outstandingLevies: Math.round((totalLevied - totalCollected) * 100) / 100,
    });
  }

  return summaries;

  } catch {
    // Table may not exist yet
    return [];
  }
}

// ─── Bank Reconciliation Report ─────────────────────────────────

export interface ReconciliationTransaction {
  id: string;
  transactionDate: string;
  description: string;
  reference: string | null;
  amount: number;
  reconciliationStatus: string;
}

export interface BankReconciliationReport {
  /** Last reconciled balance from the bank account record */
  lastReconciledBalance: number;
  /** Date of last reconciliation */
  lastReconciledDate: string | null;
  /** Closing bank statement balance (last reconciled + all transactions up to asAtDate) */
  closingBankBalance: number;
  /** Deposits recorded in the books but not yet cleared at the bank */
  depositsInTransit: ReconciliationTransaction[];
  depositsInTransitTotal: number;
  /** Payments/cheques issued but not yet cleared at the bank */
  outstandingWithdrawals: ReconciliationTransaction[];
  outstandingWithdrawalsTotal: number;
  /** Adjusted bank balance (closing + deposits in transit - outstanding withdrawals) */
  adjustedBankBalance: number;
  /** Book balance: net of all posted journal entries against the bank ledger account */
  bookBalance: number;
  /** Difference between adjusted bank balance and book balance */
  discrepancy: number;
  /** Summary counts */
  totalTransactions: number;
  reconciledCount: number;
  matchedCount: number;
  unmatchedCount: number;
  excludedCount: number;
  /** Cash flow totals for the period */
  totalReceipts: number;
  totalPayments: number;
  /** Unmatched transactions needing attention */
  unmatchedTransactions: ReconciliationTransaction[];
}

/**
 * Generate a comprehensive bank reconciliation report.
 *
 * The report reconciles the bank statement balance to the book (ledger) balance:
 *   Bank Statement Balance (closing)
 *   + Deposits in transit (matched in books, not yet on statement)
 *   - Outstanding withdrawals (matched in books, not yet on statement)
 *   = Adjusted Bank Balance
 *
 *   Book Balance (journal entries against bank ledger account)
 *
 *   Discrepancy = Adjusted Bank Balance - Book Balance
 *
 * @param bankAccountId The bank account to reconcile
 * @param schemeId The scheme (needed for book balance lookup)
 * @param asAtDate Optional cutoff date (ISO string). Defaults to all transactions.
 */
export async function getBankReconciliationReport(
  bankAccountId: string,
  schemeId: string,
  asAtDate?: string,
): Promise<BankReconciliationReport> {
  try {
  // Scheme-scoped: another scheme's account id matches nothing (SEC-004).
  const bankAccount = await db.orm.public.SchemeBankAccount
    .where((ba) => and(ba.id.eq(bankAccountId), ba.schemeId.eq(schemeId)))
    .first();

  if (!bankAccount) {
    return {
      lastReconciledBalance: 0,
      lastReconciledDate: null,
      closingBankBalance: 0,
      depositsInTransit: [],
      depositsInTransitTotal: 0,
      outstandingWithdrawals: [],
      outstandingWithdrawalsTotal: 0,
      adjustedBankBalance: 0,
      bookBalance: 0,
      discrepancy: 0,
      totalTransactions: 0,
      reconciledCount: 0,
      matchedCount: 0,
      unmatchedCount: 0,
      excludedCount: 0,
      totalReceipts: 0,
      totalPayments: 0,
      unmatchedTransactions: [],
    };
  }

  const lastReconciledBalance = Number(bankAccount.lastReconciledBalance ?? 0);
  const lastReconciledDate = bankAccount.lastReconciledDate
    ? String(bankAccount.lastReconciledDate)
    : null;

  // Fetch all bank transactions up to the as-at date
  let txnQuery = db.orm.public.BankTransaction
    .where((t) => and(t.bankAccountId.eq(bankAccountId), t.schemeId.eq(schemeId)));

  if (asAtDate) {
    txnQuery = txnQuery.where((t) =>
      t.transactionDate.lte(toTimestamp(asAtDate)),
    );
  }

  const transactions = await txnQuery
    .orderBy((t) => t.transactionDate.asc())
    .limit(5000)
    .all();

  let totalReceipts = 0;
  let totalPayments = 0;
  let reconciledCount = 0;
  let matchedCount = 0;
  let unmatchedCount = 0;
  let excludedCount = 0;

  const depositsInTransit: ReconciliationTransaction[] = [];
  const outstandingWithdrawals: ReconciliationTransaction[] = [];
  const unmatchedTransactions: ReconciliationTransaction[] = [];

  for (const txn of transactions) {
    const amount = Number(txn.amount);
    const status = String(txn.reconciliationStatus);

    if (amount >= 0) {
      totalReceipts += amount;
    } else {
      totalPayments += Math.abs(amount);
    }

    if (status === "RECONCILED") {
      reconciledCount++;
    } else if (status === "MATCHED") {
      matchedCount++;
      // Matched but not reconciled = outstanding items
      // These are recorded in the books (have a journal entry) but not confirmed
      // against the bank statement
      const serialised: ReconciliationTransaction = {
        id: txn.id,
        transactionDate: String(txn.transactionDate),
        description: String(txn.description),
        reference: txn.reference ? String(txn.reference) : null,
        amount,
      reconciliationStatus: status,
      };
      if (amount >= 0) {
        depositsInTransit.push(serialised);
      } else {
        outstandingWithdrawals.push(serialised);
      }
    } else if (status === "UNMATCHED") {
      unmatchedCount++;
      unmatchedTransactions.push({
        id: txn.id,
        transactionDate: String(txn.transactionDate),
        description: String(txn.description),
        reference: txn.reference ? String(txn.reference) : null,
        amount,
        reconciliationStatus: status,
      });
    } else if (status === "EXCLUDED") {
      excludedCount++;
    }
  }

  // Closing bank balance = last reconciled + all cleared (reconciled) transactions
  // For simplicity: last reconciled balance + net of all transactions gives the
  // current bank statement position
  const closingBankBalance = lastReconciledBalance + totalReceipts - totalPayments;

  const depositsInTransitTotal = depositsInTransit.reduce(
    (sum, t) => sum + t.amount, 0,
  );
  const outstandingWithdrawalsTotal = outstandingWithdrawals.reduce(
    (sum, t) => sum + Math.abs(t.amount), 0,
  );

  // Adjusted bank balance
  const adjustedBankBalance =
    closingBankBalance + depositsInTransitTotal - outstandingWithdrawalsTotal;

  // Book balance: sum of debits minus credits for the bank ledger account
  // from posted journal entries
  const bankAccountCode = await db.orm.public.AccountCode
    .where((a) =>
      and(
        a.schemeId.eq(schemeId),
        a.accountSubType.eq("BANK"),
        a.isSystemAccount.eq(true),
        a.isActive.eq(true),
      ),
    )
    .first();

  let bookBalance = 0;

  if (bankAccountCode) {
    const lineQuery = db.orm.public.JournalLine
      .where((l) => l.accountCodeId.eq(bankAccountCode.id))
      .include("journalEntry");

    const lines = await lineQuery.limit(10000).all();

    for (const line of lines) {
      // Only count posted entries
      if (line.journalEntry && inLedger(line.journalEntry.status)) {
        // Check date filter
        if (asAtDate) {
          const entryDate = String(line.journalEntry.transactionDate);
          if (entryDate > asAtDate) continue;
        }
        // Bank is an asset account: debits increase, credits decrease
        const debit = Number(line.debit ?? 0);
        const credit = Number(line.credit ?? 0);
        bookBalance += debit - credit;
      }
    }
  }

  const discrepancy = Math.round((adjustedBankBalance - bookBalance) * 100) / 100;

  return {
    lastReconciledBalance,
    lastReconciledDate,
    closingBankBalance: Math.round(closingBankBalance * 100) / 100,
    depositsInTransit,
    depositsInTransitTotal: Math.round(depositsInTransitTotal * 100) / 100,
    outstandingWithdrawals,
    outstandingWithdrawalsTotal: Math.round(outstandingWithdrawalsTotal * 100) / 100,
    adjustedBankBalance: Math.round(adjustedBankBalance * 100) / 100,
    bookBalance: Math.round(bookBalance * 100) / 100,
    discrepancy,
    totalTransactions: transactions.length,
    reconciledCount,
    matchedCount,
    unmatchedCount,
    excludedCount,
    totalReceipts: Math.round(totalReceipts * 100) / 100,
    totalPayments: Math.round(totalPayments * 100) / 100,
    unmatchedTransactions,
  };

  } catch {
    // Table may not exist yet
    return {
    lastReconciledBalance: 0,
    lastReconciledDate: null,
    closingBankBalance: 0,
    depositsInTransit: [],
    depositsInTransitTotal: 0,
    outstandingWithdrawals: [],
    outstandingWithdrawalsTotal: 0,
    adjustedBankBalance: 0,
    bookBalance: 0,
    discrepancy: 0,
    totalTransactions: 0,
    reconciledCount: 0,
    matchedCount: 0,
    unmatchedCount: 0,
    excludedCount: 0,
    totalReceipts: 0,
    totalPayments: 0,
    unmatchedTransactions: [],
  };
  }
}

// ─── Committee Financial Reporting Pack ────────────────────────

export interface CommitteeFundSummary {
  fundId: string;
  fundName: string;
  fundType: string;
  openingBalance: number;
  totalIncome: number;
  totalExpenses: number;
  netMovement: number;
  closingBalance: number;
  totalLevied: number;
  totalCollected: number;
  outstandingLevies: number;
}

export interface CommitteeArrearsSnapshot {
  current: number;
  days30: number;
  days60: number;
  days90: number;
  days90Plus: number;
  total: number;
  lotCount: number;
}

export interface CommitteeBudgetComparison {
  fundId: string;
  fundName: string;
  totalBudget: number;
  totalActual: number;
  totalVariance: number;
  variancePercent: number;
  lines: Array<{
    accountCodeId: string;
    accountCode: string;
    accountName: string;
    budgetAmount: number;
    actualAmount: number;
    variance: number;
    variancePercent: number;
  }>;
}

export interface CommitteeBankSummary {
  bankAccountName: string;
  closingBalance: number;
  unmatchedCount: number;
  lastReconciledDate: string | null;
}

export interface CommitteeRecentActivity {
  action: string;
  entityType: string;
  actorName: string;
  createdAt: string;
}

export interface CommitteeReportingPack {
  schemeName: string;
  reportDate: string;
  periodLabel: string;
  startDate: string;
  endDate: string;
  fundSummaries: CommitteeFundSummary[];
  totalFundBalance: number;
  arrearsSnapshot: CommitteeArrearsSnapshot;
  budgetComparisons: CommitteeBudgetComparison[];
  bankSummaries: CommitteeBankSummary[];
  recentActivity: CommitteeRecentActivity[];
  levyCollectionRate: number;
  cashPosition: number;
}

/**
 * Generate a consolidated financial reporting pack for committee meetings.
 *
 * Aggregates:
 *  - Fund balances and income/expenditure summaries
 *  - Aged arrears snapshot
 *  - Budget vs actual per fund
 *  - Bank account balances and reconciliation status
 *  - Recent financial activity
 *  - Key metrics (collection rate, cash position)
 */
export async function getCommitteeReportingPack(
  schemeId: string,
  startDate: string,
  endDate: string,
  financialYear: number,
): Promise<CommitteeReportingPack> {
  try {
  // 1. Scheme name
  const scheme = await db.orm.public.Scheme
    .where((s) => s.id.eq(schemeId))
    .first();
  const schemeName = scheme ? String(scheme.name) : "Unknown Scheme";

  // 2. Fund summaries (reuse existing logic)
  const fundSummaries = await getFundSummaryReport(schemeId, startDate, endDate);

  const totalFundBalance = fundSummaries.reduce(
    (sum, f) => sum + f.closingBalance,
    0,
  );

  // 3. Aged arrears snapshot
  const arrearsItems = await getAgedArrearsReport(schemeId, endDate);
  const arrearsSnapshot: CommitteeArrearsSnapshot = {
    current: 0,
    days30: 0,
    days60: 0,
    days90: 0,
    days90Plus: 0,
    total: 0,
    lotCount: arrearsItems.length,
  };
  for (const item of arrearsItems) {
    arrearsSnapshot.current += item.current;
    arrearsSnapshot.days30 += item.days30;
    arrearsSnapshot.days60 += item.days60;
    arrearsSnapshot.days90 += item.days90;
    arrearsSnapshot.days90Plus += item.days90Plus;
    arrearsSnapshot.total += item.total;
  }
  // Round
  arrearsSnapshot.current = Math.round(arrearsSnapshot.current * 100) / 100;
  arrearsSnapshot.days30 = Math.round(arrearsSnapshot.days30 * 100) / 100;
  arrearsSnapshot.days60 = Math.round(arrearsSnapshot.days60 * 100) / 100;
  arrearsSnapshot.days90 = Math.round(arrearsSnapshot.days90 * 100) / 100;
  arrearsSnapshot.days90Plus = Math.round(arrearsSnapshot.days90Plus * 100) / 100;
  arrearsSnapshot.total = Math.round(arrearsSnapshot.total * 100) / 100;

  // 4. Budget vs actual per fund
  const funds = await db.orm.public.Fund
    .where((f) => and(f.schemeId.eq(schemeId), f.deletedAt.eq(null)))
    .limit(20)
    .all();

  const budgetComparisons: CommitteeBudgetComparison[] = [];

  for (const fund of funds) {
    // Check if budget lines exist for this fund/year
    const budgetLines = await db.orm.public.BudgetLine
      .where((b) =>
        and(b.fundId.eq(fund.id), b.financialYear.eq(financialYear)),
      )
      .limit(1)
      .all();

    if (budgetLines.length === 0) continue;

    // Get account codes for the scheme
    const accountCodes = await db.orm.public.AccountCode
      .where((a) => and(a.schemeId.eq(schemeId), a.isActive.eq(true)))
      .limit(500)
      .all();
    const accountMap = new Map(accountCodes.map((a) => [a.id, a]));

    // Get all budget lines for this fund
    const allBudgetLines = await db.orm.public.BudgetLine
      .where((b) =>
        and(b.fundId.eq(fund.id), b.financialYear.eq(financialYear)),
      )
      .limit(200)
      .all();

    // Get actual amounts from posted journal entries
    const journalLines = await db.orm.public.JournalLine
      .where((jl) => jl.fundId.eq(fund.id))
      .include("journalEntry")
      .limit(50000)
      .all();

    const fyStart = `${financialYear}-07-01`;
    const fyEnd = `${financialYear + 1}-06-30`;

    const postedLines = journalLines.filter((jl) => {
      const entry = jl.journalEntry;
      if (!entry || entry.schemeId !== schemeId || !inLedger(entry.status)) return false;
      const txDate = String(entry.transactionDate).slice(0, 10);
      return txDate >= fyStart && txDate <= fyEnd;
    });

    // Net of credits, so a reversed invoice and its reversal cancel out (and
    // the figure matches the drill-down behind it).
    const actualCents = new Map<string, number>();
    for (const line of postedLines) {
      const account = accountMap.get(line.accountCodeId);
      if (!account) continue;
      const net = Math.round(Number(line.debit ?? 0) * 100) - Math.round(Number(line.credit ?? 0) * 100);
      const current = actualCents.get(line.accountCodeId) ?? 0;
      if (account.accountType === "EXPENSE") {
        actualCents.set(line.accountCodeId, current + net);
      } else if (account.accountType === "INCOME") {
        actualCents.set(line.accountCodeId, current - net);
      }
    }
    const actualsByAccount = new Map([...actualCents].map(([k, c]) => [k, c / 100]));

    const lines = allBudgetLines.map((bl) => {
      const account = accountMap.get(bl.accountCodeId);
      const budgetAmount = Number(bl.budgetAmount);
      const actualAmount = actualsByAccount.get(bl.accountCodeId) ?? 0;
      const variance = budgetAmount - actualAmount;
      return {
        accountCodeId: bl.accountCodeId,
        accountCode: account ? String(account.code) : "",
        accountName: account ? String(account.name) : "Unknown",
        budgetAmount,
        actualAmount,
        variance,
        variancePercent: budgetAmount !== 0 ? (variance / budgetAmount) * 100 : 0,
      };
    }).sort((a, b) => a.accountCode.localeCompare(b.accountCode));

    const totalBudget = lines.reduce((s, l) => s + l.budgetAmount, 0);
    const totalActual = lines.reduce((s, l) => s + l.actualAmount, 0);
    const totalVariance = totalBudget - totalActual;

    budgetComparisons.push({
      fundId: fund.id,
      fundName: String(fund.name),
      totalBudget: Math.round(totalBudget * 100) / 100,
      totalActual: Math.round(totalActual * 100) / 100,
      totalVariance: Math.round(totalVariance * 100) / 100,
      variancePercent: totalBudget !== 0
        ? Math.round(((totalVariance / totalBudget) * 100) * 100) / 100
        : 0,
      lines,
    });
  }

  // 5. Bank account summaries
  const bankAccounts = await db.orm.public.SchemeBankAccount
    .where((ba) => and(ba.schemeId.eq(schemeId), ba.isActive.eq(true)))
    .limit(10)
    .all();

  const bankSummaries: CommitteeBankSummary[] = [];
  for (const ba of bankAccounts) {
    // Count unmatched transactions
    const unmatchedTxns = await db.orm.public.BankTransaction
      .where((t) =>
        and(
          t.bankAccountId.eq(ba.id),
          t.reconciliationStatus.eq("UNMATCHED"),
        ),
      )
      .limit(1000)
      .all();

    bankSummaries.push({
      bankAccountName: String(ba.accountName),
      closingBalance: Number(ba.lastReconciledBalance ?? 0),
      unmatchedCount: unmatchedTxns.length,
      lastReconciledDate: ba.lastReconciledDate
        ? String(ba.lastReconciledDate)
        : null,
    });
  }

  // 6. Recent financial activity (last 20 items)
  const recentLogs = await db.orm.public.ActivityLog
    .where((a) => a.schemeId.eq(schemeId))
    .include("actor")
    .orderBy((a) => a.createdAt.desc())
    .limit(20)
    .all();

  const recentActivity: CommitteeRecentActivity[] = recentLogs.map((log) => ({
    action: String(log.action),
    entityType: String(log.entityType),
    actorName: log.actor
      ? `${String(log.actor.firstName)} ${String(log.actor.lastName)}`
      : "System",
    createdAt: String(log.createdAt),
  }));

  // 7. Key metrics
  const totalLevied = fundSummaries.reduce((s, f) => s + f.totalLevied, 0);
  const totalCollected = fundSummaries.reduce((s, f) => s + f.totalCollected, 0);
  const levyCollectionRate =
    totalLevied > 0
      ? Math.round(((totalCollected / totalLevied) * 100) * 100) / 100
      : 100;

  const cashPosition = bankSummaries.reduce(
    (s, b) => s + b.closingBalance,
    0,
  );

  // Period label
  const startMonth = new Date(startDate).toLocaleDateString("en-AU", {
    month: "short",
    year: "numeric",
  });
  const endMonth = new Date(endDate).toLocaleDateString("en-AU", {
    month: "short",
    year: "numeric",
  });
  const periodLabel = `${startMonth} to ${endMonth}`;

  return {
    schemeName,
    reportDate: new Date().toISOString(),
    periodLabel,
    startDate,
    endDate,
    fundSummaries,
    totalFundBalance: Math.round(totalFundBalance * 100) / 100,
    arrearsSnapshot,
    budgetComparisons,
    bankSummaries,
    recentActivity,
    levyCollectionRate,
    cashPosition: Math.round(cashPosition * 100) / 100,
  };

  } catch {
    // Table may not exist yet
    return {
    schemeName: "Unknown",
    reportDate: new Date().toISOString(),
    periodLabel: "",
    startDate: "",
    endDate: "",
    fundSummaries: [],
    totalFundBalance: 0,
    arrearsSnapshot: { current: 0, days30: 0, days60: 0, days90: 0, days90Plus: 0, total: 0, lotCount: 0 },
    budgetComparisons: [],
    bankSummaries: [],
    recentActivity: [],
    levyCollectionRate: 100,
    cashPosition: 0,
  };
  }
}

// ─── Cash Flow Forecasting ──────────────────────────────────────

export interface CashFlowMonth {
  month: string; // "2026-07" format
  label: string; // "Jul 2026" display label
  levyIncome: number;
  otherIncome: number;
  supplierExpenses: number;
  otherExpenses: number;
  netFlow: number;
  cumulativeBalance: number;
}

export interface CashFlowForecast {
  schemeName: string;
  startingBalance: number;
  months: CashFlowMonth[];
  totalLevyIncome: number;
  totalOtherIncome: number;
  totalSupplierExpenses: number;
  totalOtherExpenses: number;
  totalNetFlow: number;
  endingBalance: number;
}

/**
 * Generate a cash flow forecast for the coming months.
 *
 * Aggregates:
 *  - Starting balance from bank accounts
 *  - Projected levy income from issued/outstanding levy notices
 *  - Projected expenses from approved/outstanding supplier invoices
 *  - Budget-based projections for months without specific transactions
 *
 * @param schemeId - the scheme to forecast
 * @param monthsAhead - how many months to forecast (default 6)
 */
export async function getCashFlowForecast(
  schemeId: string,
  monthsAhead = 6,
): Promise<CashFlowForecast> {
  try {
  // 1. Scheme name
  const scheme = await db.orm.public.Scheme
    .where((s) => s.id.eq(schemeId))
    .first();
  const schemeName = scheme ? String(scheme.name) : "Unknown Scheme";

  // 2. Starting balance from bank accounts
  const bankAccounts = await db.orm.public.SchemeBankAccount
    .where((ba) => and(ba.schemeId.eq(schemeId), ba.isActive.eq(true)))
    .limit(10)
    .all();

  const startingBalance = bankAccounts.reduce(
    (sum, ba) => sum + Number(ba.lastReconciledBalance ?? 0),
    0,
  );

  // 3. Build month buckets
  const now = new Date();
  const monthBuckets: CashFlowMonth[] = [];
  for (let i = 0; i < monthsAhead; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-AU", { month: "short", year: "numeric" });
    monthBuckets.push({
      month,
      label,
      levyIncome: 0,
      otherIncome: 0,
      supplierExpenses: 0,
      otherExpenses: 0,
      netFlow: 0,
      cumulativeBalance: 0,
    });
  }

  const firstMonth = monthBuckets[0].month;

  // Helper to find bucket index for a date
  function bucketIndex(dateStr: string): number {
    const monthKey = dateStr.slice(0, 7);
    return monthBuckets.findIndex((b) => b.month === monthKey);
  }

  // 4. Levy notices (outstanding/issued) with due dates in forecast range
  const levyNotices = await db.orm.public.LevyNotice
    .where((ln) =>
      and(
        ln.schemeId.eq(schemeId),
        ln.status.in(["ISSUED", "PARTIALLY_PAID", "OVERDUE"]),
      ),
    )
    .limit(5000)
    .all();

  for (const notice of levyNotices) {
    const dueDateStr = String(notice.dueDate).slice(0, 10);
    const idx = bucketIndex(dueDateStr);
    if (idx >= 0) {
      monthBuckets[idx].levyIncome += Number(notice.balanceOutstanding);
    } else if (dueDateStr < `${firstMonth}-01`) {
      // Overdue levies: assume collected in current month
      monthBuckets[0].levyIncome += Number(notice.balanceOutstanding);
    }
  }

  // 5. Supplier invoices (approved/outstanding) with due dates in forecast range
  const supplierInvoices = await db.orm.public.SupplierInvoice
    .where((si) =>
      and(
        si.schemeId.eq(schemeId),
        si.status.in(["AWAITING_APPROVAL", "APPROVED", "PARTIALLY_PAID"]),
      ),
    )
    .limit(2000)
    .all();

  for (const invoice of supplierInvoices) {
    const dueDateStr = String(invoice.dueDate).slice(0, 10);
    const idx = bucketIndex(dueDateStr);
    if (idx >= 0) {
      monthBuckets[idx].supplierExpenses += Number(invoice.balanceOutstanding);
    } else if (dueDateStr < `${firstMonth}-01`) {
      // Past-due invoices: assume paid in current month
      monthBuckets[0].supplierExpenses += Number(invoice.balanceOutstanding);
    }
  }

  // 6. Budget-based projections for months without specific levy data
  // Use monthly budget amounts as a baseline for months where no levy notices exist
  const currentFY = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;

  // Only use budget lines where the fund belongs to this scheme
  const schemeFunds = await db.orm.public.Fund
    .where((f) => and(f.schemeId.eq(schemeId), f.deletedAt.eq(null)))
    .limit(20)
    .all();
  const schemeFundIds = new Set(schemeFunds.map((f) => f.id));

  const budgetLines = await db.orm.public.BudgetLine
    .where((bl) => bl.financialYear.eq(currentFY))
    .include("fund")
    .limit(500)
    .all();

  // Collect distinct account code IDs from budget lines belonging to this scheme
  const relevantBudgetLines = budgetLines.filter((bl) =>
    schemeFundIds.has(bl.fundId),
  );
  const accountCodeIds = [
    ...new Set(relevantBudgetLines.map((bl) => bl.accountCodeId)),
  ];

  // Fetch account codes to determine income vs expense
  const accountCodes =
    accountCodeIds.length > 0
      ? await db.orm.public.AccountCode
          .where((ac) => ac.id.in(accountCodeIds))
          .limit(500)
          .all()
      : [];
  const accountCodeMap = new Map(accountCodes.map((ac) => [ac.id, ac]));

  // Calculate monthly budget amounts
  let monthlyBudgetIncome = 0;
  let monthlyBudgetExpense = 0;
  for (const bl of relevantBudgetLines) {
    const monthly = Number(bl.budgetAmount) / 12;
    const ac = accountCodeMap.get(bl.accountCodeId);
    if (ac?.accountType === "INCOME") {
      monthlyBudgetIncome += monthly;
    } else if (ac?.accountType === "EXPENSE") {
      monthlyBudgetExpense += monthly;
    }
  }

  // Fill in budget-based estimates for months with no specific data
  for (const bucket of monthBuckets) {
    if (bucket.levyIncome === 0 && monthlyBudgetIncome > 0) {
      bucket.otherIncome = Math.round(monthlyBudgetIncome * 100) / 100;
    }
    if (bucket.supplierExpenses === 0 && monthlyBudgetExpense > 0) {
      bucket.otherExpenses = Math.round(monthlyBudgetExpense * 100) / 100;
    }
  }

  // 7. Calculate net flows and cumulative balances
  let cumulative = startingBalance;
  for (const bucket of monthBuckets) {
    bucket.levyIncome = Math.round(bucket.levyIncome * 100) / 100;
    bucket.supplierExpenses = Math.round(bucket.supplierExpenses * 100) / 100;
    const totalIn = bucket.levyIncome + bucket.otherIncome;
    const totalOut = bucket.supplierExpenses + bucket.otherExpenses;
    bucket.netFlow = Math.round((totalIn - totalOut) * 100) / 100;
    cumulative = Math.round((cumulative + bucket.netFlow) * 100) / 100;
    bucket.cumulativeBalance = cumulative;
  }

  // 8. Totals
  const totalLevyIncome = monthBuckets.reduce((s, m) => s + m.levyIncome, 0);
  const totalOtherIncome = monthBuckets.reduce((s, m) => s + m.otherIncome, 0);
  const totalSupplierExpenses = monthBuckets.reduce(
    (s, m) => s + m.supplierExpenses,
    0,
  );
  const totalOtherExpenses = monthBuckets.reduce(
    (s, m) => s + m.otherExpenses,
    0,
  );
  const totalNetFlow = monthBuckets.reduce((s, m) => s + m.netFlow, 0);

  return {
    schemeName,
    startingBalance: Math.round(startingBalance * 100) / 100,
    months: monthBuckets,
    totalLevyIncome: Math.round(totalLevyIncome * 100) / 100,
    totalOtherIncome: Math.round(totalOtherIncome * 100) / 100,
    totalSupplierExpenses: Math.round(totalSupplierExpenses * 100) / 100,
    totalOtherExpenses: Math.round(totalOtherExpenses * 100) / 100,
    totalNetFlow: Math.round(totalNetFlow * 100) / 100,
    endingBalance: cumulative,
  };

  } catch {
    // Table may not exist yet
    return {
    schemeName: "Unknown",
    startingBalance: 0,
    months: [],
    totalLevyIncome: 0,
    totalOtherIncome: 0,
    totalSupplierExpenses: 0,
    totalOtherExpenses: 0,
    totalNetFlow: 0,
    endingBalance: 0,
  };
  }
}

// ─── Fund Balance Projections ───────────────────────────────────

export interface FundProjectionYear {
  financialYear: number; // e.g. 2026 means FY 2026/2027
  label: string; // "FY 2026/27"
  openingBalance: number;
  levyIncome: number;
  expenses: number;
  netMovement: number;
  closingBalance: number;
}

export interface FundProjection {
  fundId: string;
  fundName: string;
  fundType: string;
  currentBalance: number;
  years: FundProjectionYear[];
  /** Where the figures come from, for example the adopted capital works fund plan. */
  basisNote?: string;
}

export interface FundBalanceProjections {
  schemeName: string;
  projections: FundProjection[];
}

/**
 * Project fund balances forward over multiple financial years.
 *
 * For each active fund, uses the current balance and budget data to project
 * year-by-year balances. Capital works funds show the long-term accumulation
 * trajectory, while administrative funds show the annual cycle.
 *
 * @param schemeId - the scheme to project
 * @param yearsAhead - how many FYs to project (default 5)
 */
export async function getFundBalanceProjections(
  schemeId: string,
  yearsAhead = 5,
): Promise<FundBalanceProjections> {
  try {
  // 1. Scheme name
  const scheme = await db.orm.public.Scheme
    .where((s) => s.id.eq(schemeId))
    .first();
  const schemeName = scheme ? String(scheme.name) : "Unknown Scheme";

  // 2. Active funds for this scheme
  const funds = await db.orm.public.Fund
    .where((f) => and(f.schemeId.eq(schemeId), f.deletedAt.eq(null)))
    .limit(20)
    .all();

  // 3. Current financial year
  const now = new Date();
  const currentFY = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;

  // 4. The budget lines in force for the current FY (adopted, else the latest version)
  const allBudgetLines = await currentBudgetLines(schemeId, currentFY);
  // The adopted capital works fund plan, if any, drives the capital works projection.
  const adoptedPlan = await getAdoptedPlan(schemeId);

  // Get account codes for budget lines
  const budgetAccountCodeIds = [
    ...new Set(allBudgetLines.map((bl) => bl.accountCodeId)),
  ];
  const budgetAccountCodes =
    budgetAccountCodeIds.length > 0
      ? await db.orm.public.AccountCode
          .where((ac) => ac.id.in(budgetAccountCodeIds))
          .limit(500)
          .all()
      : [];
  const acMap = new Map(budgetAccountCodes.map((ac) => [ac.id, ac]));

  // 5. Get active levy schedules to estimate annual levy income per fund
  const levySchedules = await db.orm.public.LevySchedule
    .where((ls) =>
      and(ls.schemeId.eq(schemeId), ls.status.in(["ACTIVE", "APPROVED"])),
    )
    .limit(50)
    .all();

  // Build per-fund annual income/expense from budget
  const fundBudgetIncome = new Map<string, number>();
  const fundBudgetExpense = new Map<string, number>();
  for (const bl of allBudgetLines) {
    const ac = acMap.get(bl.accountCodeId);
    if (!ac) continue;
    const amount = Number(bl.budgetAmount);
    if (ac.accountType === "INCOME") {
      fundBudgetIncome.set(
        bl.fundId,
        (fundBudgetIncome.get(bl.fundId) ?? 0) + amount,
      );
    } else if (ac.accountType === "EXPENSE") {
      fundBudgetExpense.set(
        bl.fundId,
        (fundBudgetExpense.get(bl.fundId) ?? 0) + amount,
      );
    }
  }

  // Build per-fund levy income from schedules (annual amount = budgetAmount on schedule)
  const fundLevyIncome = new Map<string, number>();
  for (const ls of levySchedules) {
    fundLevyIncome.set(
      ls.fundId,
      (fundLevyIncome.get(ls.fundId) ?? 0) + Number(ls.budgetAmount),
    );
  }

  // 6. Build projections per fund
  const projections: FundProjection[] = [];

  for (const fund of funds) {
    const currentBalance = Number(fund.balance);
    // Use levy schedule income if available, otherwise budget income
    const annualIncome =
      fundLevyIncome.get(fund.id) ?? fundBudgetIncome.get(fund.id) ?? 0;
    const annualExpense = fundBudgetExpense.get(fund.id) ?? 0;
    const usePlan = !!adoptedPlan && isCapitalWorksFund(String(fund.fundType));
    const planSpend = usePlan
      ? spendByYear(
          (adoptedPlan!.items ?? []).map((i) => ({ plannedYear: i.plannedYear, estimatedCostCents: Math.round(Number(i.estimatedCost) * 100) })),
          adoptedPlan!.periodStartYear,
        )
      : [];
    const planContribution = usePlan ? Number(adoptedPlan!.annualContribution ?? 0) : 0;

    const years: FundProjectionYear[] = [];
    let opening = currentBalance;

    for (let i = 0; i < yearsAhead; i++) {
      const fy = currentFY + i;
      const label = `FY ${fy}/${String(fy + 1).slice(2)}`;
      const k = fy - (adoptedPlan?.periodStartYear ?? 0);
      const inPlan = usePlan && k >= 0 && k < planSpend.length;
      const levyIncome = Math.round((inPlan ? planContribution : annualIncome) * 100) / 100;
      const expenses = Math.round((inPlan ? planSpend[k] / 100 : annualExpense) * 100) / 100;
      const netMovement = Math.round((levyIncome - expenses) * 100) / 100;
      const closing = Math.round((opening + netMovement) * 100) / 100;

      years.push({
        financialYear: fy,
        label,
        openingBalance: Math.round(opening * 100) / 100,
        levyIncome,
        expenses,
        netMovement,
        closingBalance: closing,
      });

      opening = closing;
    }

    projections.push({
      fundId: fund.id,
      fundName: String(fund.name),
      fundType: String(fund.fundType),
      currentBalance: Math.round(currentBalance * 100) / 100,
      years,
      basisNote: usePlan
        ? `From the adopted capital works fund plan "${adoptedPlan!.title}": its yearly contribution and planned expenditure.`
        : undefined,
    });
  }

  return {
    schemeName,
    projections,
  };

  } catch {
    // Table may not exist yet
    return {
    schemeName: "Unknown",
    projections: [],
  };
  }
}

// ─── BAS-Ready GST Summary ─────────────────────────────────────

export interface GstLineItem {
  accountCode: string;
  accountName: string;
  accountType: string;
  netAmount: number;
  gstAmount: number;
  grossAmount: number;
}

export interface GstSummaryReport {
  schemeName: string;
  abnOrGstRegistered: boolean;
  startDate: string;
  endDate: string;
  periodLabel: string;
  // BAS label fields
  g1TotalSales: number; // Total sales (including GST-free)
  g2ExportSales: number; // Export sales (always 0 for strata)
  g3OtherGstFreeSales: number; // GST-free sales
  g4InputTaxedSales: number; // Input-taxed sales (always 0 for strata)
  g9GrossGstOnSales: number; // Total GST on sales
  g10CapitalPurchases: number; // Capital purchases (not separately tracked yet)
  g11NonCapitalPurchases: number; // Non-capital purchases
  g14ExportPurchases: number; // Export purchases (always 0)
  g15PurchasesForInputTaxedSales: number; // Always 0 for strata
  g20GstOnPurchases: number; // Total GST on purchases
  // Net position
  netGstPayable: number; // g9 - g20
  // Detail lines
  incomeLines: GstLineItem[];
  expenseLines: GstLineItem[];
}

/**
 * Generate a GST summary report to support BAS preparation.
 *
 * Aggregates GST amounts from posted journal lines within the period,
 * broken down by account to match BAS label structure.
 */
export async function getGstSummaryReport(
  schemeId: string,
  startDate: string,
  endDate: string,
): Promise<GstSummaryReport> {
  try {
  // 1. Scheme info
  const scheme = await db.orm.public.Scheme
    .where((s) => s.id.eq(schemeId))
    .first();
  const schemeName = scheme ? String(scheme.name) : "Unknown Scheme";
  const abnOrGstRegistered = scheme?.gstRegistered ?? false;

  // 2. Period label
  const start = new Date(startDate);
  const end = new Date(endDate);
  const periodLabel = `${start.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })} – ${end.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`;

  // 3. Posted journal entries in the period
  const entries = await db.orm.public.JournalEntry
    .where((je) =>
      and(
        je.schemeId.eq(schemeId),
        je.status.in(LEDGER_STATUSES),
        je.transactionDate.gte(toTimestamp(startDate)),
        je.transactionDate.lte(toTimestamp(endDate)),
      ),
    )
    .limit(5000)
    .all();

  const entryIds = entries.map((e) => e.id);

  // 4. Get all journal lines for these entries
  const allLines =
    entryIds.length > 0
      ? await db.orm.public.JournalLine
          .where((jl) => jl.journalEntryId.in(entryIds))
          .limit(20000)
          .all()
      : [];

  // 5. Get account codes for grouping
  const accountCodeIds = [...new Set(allLines.map((l) => l.accountCodeId))];
  const accountCodes =
    accountCodeIds.length > 0
      ? await db.orm.public.AccountCode
          .where((ac) => ac.id.in(accountCodeIds))
          .limit(500)
          .all()
      : [];
  const acMap = new Map(accountCodes.map((ac) => [ac.id, ac]));

  // 6. Aggregate by account code
  const accountAggregates = new Map<
    string,
    { debit: number; credit: number; gst: number }
  >();

  for (const line of allLines) {
    const existing = accountAggregates.get(line.accountCodeId) ?? {
      debit: 0,
      credit: 0,
      gst: 0,
    };
    existing.debit += Number(line.debit ?? 0);
    existing.credit += Number(line.credit ?? 0);
    existing.gst += Number(line.gstAmount ?? 0);
    accountAggregates.set(line.accountCodeId, existing);
  }

  // 7. Build line items
  const incomeLines: GstLineItem[] = [];
  const expenseLines: GstLineItem[] = [];

  let totalIncomeNet = 0;
  let totalIncomeGst = 0;
  let totalExpenseNet = 0;
  let totalExpenseGst = 0;

  for (const [acId, agg] of accountAggregates) {
    const ac = acMap.get(acId);
    if (!ac) continue;

    const accountCode = String(ac.code);
    const accountName = String(ac.name);
    const accountType = String(ac.accountType);

    if (accountType === "INCOME") {
      // Income: credits increase, debits decrease
      const net = Math.round((agg.credit - agg.debit) * 100) / 100;
      const gst = Math.round(agg.gst * 100) / 100;
      incomeLines.push({
        accountCode,
        accountName,
        accountType,
        netAmount: net,
        gstAmount: gst,
        grossAmount: Math.round((net + gst) * 100) / 100,
      });
      totalIncomeNet += net;
      totalIncomeGst += gst;
    } else if (accountType === "EXPENSE") {
      // Expenses: debits increase, credits decrease
      const net = Math.round((agg.debit - agg.credit) * 100) / 100;
      const gst = Math.round(agg.gst * 100) / 100;
      expenseLines.push({
        accountCode,
        accountName,
        accountType,
        netAmount: net,
        gstAmount: gst,
        grossAmount: Math.round((net + gst) * 100) / 100,
      });
      totalExpenseNet += net;
      totalExpenseGst += gst;
    }
  }

  // Sort by account code
  incomeLines.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
  expenseLines.sort((a, b) => a.accountCode.localeCompare(b.accountCode));

  // 8. Map to BAS labels
  // GST-free income = income with no GST
  const gstFreeIncome = incomeLines
    .filter((l) => l.gstAmount === 0)
    .reduce((s, l) => s + l.netAmount, 0);

  const g1TotalSales = Math.round((totalIncomeNet + totalIncomeGst) * 100) / 100;
  const g3OtherGstFreeSales = Math.round(gstFreeIncome * 100) / 100;
  const g9GrossGstOnSales = Math.round(totalIncomeGst * 100) / 100;
  const g11NonCapitalPurchases = Math.round(
    (totalExpenseNet + totalExpenseGst) * 100,
  ) / 100;
  const g20GstOnPurchases = Math.round(totalExpenseGst * 100) / 100;
  const netGstPayable = Math.round((g9GrossGstOnSales - g20GstOnPurchases) * 100) / 100;

  return {
    schemeName,
    abnOrGstRegistered,
    startDate,
    endDate,
    periodLabel,
    g1TotalSales,
    g2ExportSales: 0,
    g3OtherGstFreeSales,
    g4InputTaxedSales: 0,
    g9GrossGstOnSales,
    g10CapitalPurchases: 0,
    g11NonCapitalPurchases,
    g14ExportPurchases: 0,
    g15PurchasesForInputTaxedSales: 0,
    g20GstOnPurchases,
    netGstPayable,
    incomeLines,
    expenseLines,
  };

  } catch {
    // Table may not exist yet
    return {
    schemeName: "Unknown",
    abnOrGstRegistered: false,
    startDate: "",
    endDate: "",
    periodLabel: "",
    g1TotalSales: 0,
    g2ExportSales: 0,
    g3OtherGstFreeSales: 0,
    g4InputTaxedSales: 0,
    g9GrossGstOnSales: 0,
    g10CapitalPurchases: 0,
    g11NonCapitalPurchases: 0,
    g14ExportPurchases: 0,
    g15PurchasesForInputTaxedSales: 0,
    g20GstOnPurchases: 0,
    netGstPayable: 0,
    incomeLines: [],
    expenseLines: [],
  };
  }
}

// ─── Dashboard Financial Summary ─────────────────────────────

export interface DashboardFinancialSummary {
  cashIn: number;
  cashOut: number;
  billsAwaiting: number;
  billsAwaitingCount: number;
  billsOverdue: number;
  billsOverdueCount: number;
}

/**
 * Compute a quick financial summary for the owner dashboard.
 *
 * Cash in/out: summed from posted journal entry lines this month
 * (credits to bank/cash accounts = cash in, debits = cash out).
 *
 * Bills to pay: from outstanding supplier invoices for the scheme.
 */
export async function getDashboardFinancialSummary(
  schemeId: string,
): Promise<DashboardFinancialSummary> {
  try {
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, "0")}`;

    // Fetch posted journal entries for the current month
    const entries = await db.orm.public.JournalEntry
      .where((je) =>
        and(
          je.schemeId.eq(schemeId),
          je.status.in(LEDGER_STATUSES),
          je.transactionDate.gte(toTimestamp(monthStart)),
          je.transactionDate.lte(toTimestamp(monthEnd)),
        ),
      )
      .include("lines")
      .limit(500)
      .all();

    let cashIn = 0;
    let cashOut = 0;
    for (const entry of entries) {
      for (const line of entry.lines) {
        const debit = Number(line.debit ?? 0);
        const credit = Number(line.credit ?? 0);
        // In double-entry: credits increase income/liability (cash in),
        // debits increase expense/asset (cash out)
        cashIn += credit;
        cashOut += debit;
      }
    }

    // Fetch outstanding supplier invoices
    const invoices = await db.orm.public.SupplierInvoice
      .where((si) =>
        and(
          si.schemeId.eq(schemeId),
          si.status.in(["AWAITING_APPROVAL", "APPROVED", "PARTIALLY_PAID"]),
        ),
      )
      .limit(1000)
      .all();

    let billsAwaiting = 0;
    let billsAwaitingCount = 0;
    let billsOverdue = 0;
    let billsOverdueCount = 0;

    for (const inv of invoices) {
      const outstanding = Number(inv.balanceOutstanding ?? inv.totalAmount ?? 0);
      billsAwaiting += outstanding;
      billsAwaitingCount++;
      const dueDate = new Date(String(inv.dueDate));
      if (dueDate < now) {
        billsOverdue += outstanding;
        billsOverdueCount++;
      }
    }

    return { cashIn, cashOut, billsAwaiting, billsAwaitingCount, billsOverdue, billsOverdueCount };
  } catch {
    // Tables may not exist yet
    return {
      cashIn: 0,
      cashOut: 0,
      billsAwaiting: 0,
      billsAwaitingCount: 0,
      billsOverdue: 0,
      billsOverdueCount: 0,
    };
  }
}
