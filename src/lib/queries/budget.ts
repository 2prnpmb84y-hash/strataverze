import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { Numeric } from "@prisma/orm-postgres/target/codec-types";
import { workingBudgets } from "@/lib/finance/budget-status";

function toNumeric(value: number | string): Numeric<12, 2> {
  return String(value) as unknown as Numeric<12, 2>;
}

/** Ids of the budget version being worked on for each fund and year. */
async function workingBudgetIds(filter: { schemeId?: string; fundId?: string; financialYear: number }) {
  const budgets = await db.orm.public.Budget
    .where((b) =>
      filter.fundId
        ? and(b.fundId.eq(filter.fundId), b.financialYear.eq(filter.financialYear))
        : and(b.schemeId.eq(filter.schemeId!), b.financialYear.eq(filter.financialYear)),
    )
    .limit(500)
    .all();
  return workingBudgets(budgets).map((b) => b.id);
}

/**
 * Fetch the budget lines for a fund and financial year, from the version
 * being worked on (the latest that is not superseded).
 */
export async function getBudgetLinesForFund(
  fundId: string,
  financialYear: number,
  limit = 200,
) {
  const ids = await workingBudgetIds({ fundId, financialYear });
  if (ids.length === 0) return [];
  return db.orm.public.BudgetLine
    .where((b) => b.budgetId.in(ids))
    .include("fund")
    .orderBy((b) => b.createdAt.asc())
    .limit(limit)
    .all();
}

/**
 * Fetch the budget lines for a scheme across all funds for a financial year,
 * from the version of each fund's budget being worked on.
 */
export async function getBudgetLinesForScheme(
  schemeId: string,
  financialYear: number,
  limit = 500,
) {
  const ids = await workingBudgetIds({ schemeId, financialYear });
  if (ids.length === 0) return [];
  return db.orm.public.BudgetLine
    .where((b) => b.budgetId.in(ids))
    .include("fund")
    .orderBy((b) => b.createdAt.asc())
    .limit(limit)
    .all();
}

/**
 * Fetch a single budget line by ID.
 */
export async function getBudgetLineById(budgetLineId: string) {
  try {
    return db.orm.public.BudgetLine
      .where((b) => b.id.eq(budgetLineId))
      .include("fund")
      .first();
  } catch {
    // Table may not exist yet
    return null;
  }
}

/**
 * Create a new budget line.
 */
export async function createBudgetLine(data: {
  fundId: string;
  accountCodeId: string;
  financialYear: number;
  budgetAmount: number;
  notes?: string;
  budgetId: string;
}) {
  return db.orm.public.BudgetLine.create({
    budgetId: data.budgetId,
    fundId: data.fundId,
    accountCodeId: data.accountCodeId,
    financialYear: data.financialYear,
    budgetAmount: toNumeric(data.budgetAmount),
    notes: data.notes ?? null,
  });
}

/**
 * Update an existing budget line.
 */
export async function updateBudgetLine(
  budgetLineId: string,
  data: Partial<{
    budgetAmount: number;
    notes: string | null;
  }>,
) {
  const updateData: Record<string, unknown> = {};
  if (data.budgetAmount !== undefined) {
    updateData.budgetAmount = toNumeric(data.budgetAmount);
  }
  if (data.notes !== undefined) {
    updateData.notes = data.notes;
  }
  return db.orm.public.BudgetLine
    .where({ id: budgetLineId })
    .update(updateData);
}

/**
 * Delete a budget line.
 */
export async function deleteBudgetLine(budgetLineId: string) {
  return db.orm.public.BudgetLine
    .where({ id: budgetLineId })
    .delete();
}

/**
 * Get budget vs actual comparison for a fund and financial year.
 * Compares budget amounts to actual posted journal entries.
 */
export async function getBudgetVsActual(
  schemeId: string,
  fundId: string,
  financialYear: number,
) {
  // Get budget lines for the fund
  const budgetLines = await getBudgetLinesForFund(fundId, financialYear);

  // Get all account codes for the scheme to map accountCodeId to details
  const accountCodes = await db.orm.public.AccountCode
    .where((a) => and(a.schemeId.eq(schemeId), a.isActive.eq(true)))
    .orderBy((a) => a.code.asc())
    .limit(500)
    .all();

  const accountMap = new Map(accountCodes.map((a) => [a.id, a]));

  // Financial year date range (1 Jul to 30 Jun for Australian FY)
  const startDate = `${financialYear}-07-01`;
  const endDate = `${financialYear + 1}-06-30`;

  // Get actual amounts from posted journal entries
  const journalLines = await db.orm.public.JournalLine
    .where((jl) => jl.fundId.eq(fundId))
    .include("journalEntry")
    .limit(10000)
    .all();

  // Filter to posted entries within the date range
  const postedLines = journalLines.filter((jl) => {
    const entry = jl.journalEntry;
    if (!entry || entry.status !== "POSTED") return false;
    const txDate = String(entry.transactionDate).slice(0, 10);
    return txDate >= startDate && txDate <= endDate;
  });

  // Aggregate actuals by account code
  const actualsByAccount = new Map<string, number>();
  for (const line of postedLines) {
    const accountId = line.accountCodeId;
    const account = accountMap.get(accountId);
    if (!account) continue;

    const current = actualsByAccount.get(accountId) ?? 0;
    // For expenses: actuals are debits
    // For income: actuals are credits
    if (account.accountType === "EXPENSE") {
      actualsByAccount.set(accountId, current + Number(line.debit ?? 0));
    } else if (account.accountType === "INCOME") {
      actualsByAccount.set(accountId, current + Number(line.credit ?? 0));
    }
  }

  // Build comparison rows
  const comparison = budgetLines.map((bl) => {
    const account = accountMap.get(bl.accountCodeId);
    const budgetAmount = Number(bl.budgetAmount);
    const actualAmount = actualsByAccount.get(bl.accountCodeId) ?? 0;
    const variance = budgetAmount - actualAmount;
    const variancePercent =
      budgetAmount !== 0 ? (variance / budgetAmount) * 100 : 0;

    return {
      budgetLineId: bl.id,
      accountCodeId: bl.accountCodeId,
      accountCode: account ? String(account.code) : "—",
      accountName: account ? String(account.name) : "Unknown",
      accountType: account?.accountType ?? "EXPENSE",
      budgetAmount,
      actualAmount,
      variance,
      variancePercent,
      notes: bl.notes,
    };
  });

  // Sort by account code
  comparison.sort((a, b) => a.accountCode.localeCompare(b.accountCode));

  const totalBudget = comparison.reduce((s, r) => s + r.budgetAmount, 0);
  const totalActual = comparison.reduce((s, r) => s + r.actualAmount, 0);
  const totalVariance = totalBudget - totalActual;

  return {
    lines: comparison,
    totalBudget,
    totalActual,
    totalVariance,
  };
}
