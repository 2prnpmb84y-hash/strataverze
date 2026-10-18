import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { TimestampString } from "@prisma/orm-postgres/target/codec-types";

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
  // Fetch all posted journal entries in the current period
  const currentEntries = await db.orm.public.JournalEntry
    .where((je) =>
      and(
        je.schemeId.eq(schemeId),
        je.status.eq("POSTED"),
        je.transactionDate.gte(toTimestamp(startDate)),
        je.transactionDate.lte(toTimestamp(endDate)),
      ),
    )
    .include("lines", (l) => l.include("accountCode").include("fund"))
    .limit(2000)
    .all();

  // Fetch comparative period entries
  const compEntries = await db.orm.public.JournalEntry
    .where((je) =>
      and(
        je.schemeId.eq(schemeId),
        je.status.eq("POSTED"),
        je.transactionDate.gte(toTimestamp(compStartDate)),
        je.transactionDate.lte(toTimestamp(compEndDate)),
      ),
    )
    .include("lines", (l) => l.include("accountCode").include("fund"))
    .limit(2000)
    .all();

  // Aggregate by account code for current period
  const currentTotals = aggregateByAccount(currentEntries, fundId);
  const compTotals = aggregateByAccount(compEntries, fundId);

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
}

interface AccountAggregate {
  accountCode: string;
  accountName: string;
  fundName: string;
  accountType: string;
  amount: number;
}

function aggregateByAccount(
  entries: Array<{
    lines: Array<{
      accountCode: { code: unknown; name: unknown; accountType: unknown } | null;
      fund: { name: unknown } | null;
      fundId: string;
      debit: unknown;
      credit: unknown;
    }>;
  }>,
  fundId: string | null,
): Record<string, AccountAggregate> {
  const totals: Record<string, AccountAggregate> = {};

  for (const entry of entries) {
    for (const line of entry.lines) {
      if (fundId && line.fundId !== fundId) continue;
      if (!line.accountCode) continue;

      const code = String(line.accountCode.code);
      const accountType = String(line.accountCode.accountType);

      if (!totals[code]) {
        totals[code] = {
          accountCode: code,
          accountName: String(line.accountCode.name),
          fundName: line.fund ? String(line.fund.name) : "",
          accountType,
          amount: 0,
        };
      }

      // For income accounts: credits increase, debits decrease
      // For expense accounts: debits increase, credits decrease
      const debit = Number(line.debit ?? 0);
      const credit = Number(line.credit ?? 0);

      if (accountType === "INCOME") {
        totals[code].amount += credit - debit;
      } else if (accountType === "EXPENSE") {
        totals[code].amount += debit - credit;
      }
    }
  }

  return totals;
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
}

// ─── Trial Balance Report ──────────────────────────────────────

export interface TrialBalanceLineItem {
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
  // Fetch all posted journal entries up to the as-at date
  const entries = await db.orm.public.JournalEntry
    .where((je) =>
      and(
        je.schemeId.eq(schemeId),
        je.status.eq("POSTED"),
        je.transactionDate.lte(toTimestamp(asAtDate)),
      ),
    )
    .include("lines", (l) => l.include("accountCode").include("fund"))
    .limit(5000)
    .all();

  // Aggregate by account code
  const accountTotals = new Map<
    string,
    {
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
      const key = `${code}-${line.fundId ?? "none"}`;

      const existing = accountTotals.get(key);
      const debit = Number(line.debit ?? 0);
      const credit = Number(line.credit ?? 0);

      if (existing) {
        existing.totalDebit += debit;
        existing.totalCredit += credit;
      } else {
        accountTotals.set(key, {
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
        je.status.eq("POSTED"),
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
        je.status.eq("POSTED"),
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
}

// ─── Bank Reconciliation Report ─────────────────────────────────

export interface BankReconciliationReport {
  openingBalance: number;
  receipts: number;
  payments: number;
  closingBankBalance: number;
  unmatchedBankItems: number;
  matchedItems: number;
  reconciledItems: number;
  excludedItems: number;
}

/**
 * Generate a bank reconciliation summary report.
 */
export async function getBankReconciliationReport(
  bankAccountId: string,
): Promise<BankReconciliationReport> {
  const bankAccount = await db.orm.public.SchemeBankAccount
    .where((ba) => ba.id.eq(bankAccountId))
    .first();

  if (!bankAccount) {
    return {
      openingBalance: 0,
      receipts: 0,
      payments: 0,
      closingBankBalance: 0,
      unmatchedBankItems: 0,
      matchedItems: 0,
      reconciledItems: 0,
      excludedItems: 0,
    };
  }

  const openingBalance = Number(bankAccount.lastReconciledBalance ?? 0);

  const transactions = await db.orm.public.BankTransaction
    .where((t) => t.bankAccountId.eq(bankAccountId))
    .limit(5000)
    .all();

  let receipts = 0;
  let payments = 0;
  let unmatchedBankItems = 0;
  let matchedItems = 0;
  let reconciledItems = 0;
  let excludedItems = 0;

  for (const txn of transactions) {
    const amount = Number(txn.amount);
    if (amount >= 0) {
      receipts += amount;
    } else {
      payments += Math.abs(amount);
    }

    const status = String(txn.reconciliationStatus);
    if (status === "UNMATCHED") unmatchedBankItems++;
    else if (status === "MATCHED") matchedItems++;
    else if (status === "RECONCILED") reconciledItems++;
    else if (status === "EXCLUDED") excludedItems++;
  }

  return {
    openingBalance,
    receipts,
    payments,
    closingBankBalance: openingBalance + receipts - payments,
    unmatchedBankItems,
    matchedItems,
    reconciledItems,
    excludedItems,
  };
}
