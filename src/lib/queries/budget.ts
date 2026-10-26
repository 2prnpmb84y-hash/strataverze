import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { Numeric } from "@prisma/orm-postgres/target/codec-types";
import { workingBudgets } from "@/lib/finance/budget-status";
import { addDays, financialYearStart } from "@/lib/levies/notice-plan";
import { ledgerLinesUpTo } from "@/lib/finance/fund-position";

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
 *
 * Every income and expense account with a budget line or with ledger
 * activity in the year is shown, with a budget of $0 where there is no line,
 * so unbudgeted spending is not hidden. Actuals are net of reversals. The
 * year follows the scheme's financial year end (financials review B10,
 * 26 Oct 2026). Totals are for expenditure; income is totalled separately.
 */
export async function getBudgetVsActual(
  schemeId: string,
  fundId: string,
  financialYear: number,
) {
  const [budgetLines, accountCodes, scheme] = await Promise.all([
    getBudgetLinesForFund(fundId, financialYear),
    db.orm.public.AccountCode.where((a) => a.schemeId.eq(schemeId)).orderBy((a) => a.code.asc()).limit(5000).all(),
    db.orm.public.Scheme.where((s) => s.id.eq(schemeId)).first(),
  ]);
  const accountMap = new Map(accountCodes.map((a) => [a.id, a]));
  // The financial year that starts in `financialYear` (as in the statutory pack).
  const fyEnd = String(scheme?.financialYearEnd ?? "06-30");
  const start = financialYearStart(financialYear, fyEnd);
  const end = addDays(financialYearStart(financialYear + 1, fyEnd), -1);

  // Actuals from the ledger: net for the year, by account.
  const actualCents = new Map<string, number>();
  for (const e of await ledgerLinesUpTo(schemeId, end)) {
    if (e.date < start || e.date > end) continue;
    for (const l of e.lines) {
      if (l.fundId !== fundId) continue;
      if (l.accountType === "EXPENSE") actualCents.set(l.accountId, (actualCents.get(l.accountId) ?? 0) + l.debitCents - l.creditCents);
      else if (l.accountType === "INCOME") actualCents.set(l.accountId, (actualCents.get(l.accountId) ?? 0) + l.creditCents - l.debitCents);
    }
  }

  const row = (accountCodeId: string, budgetAmount: number, budgetLineId: string | null, notes: string | null) => {
    const account = accountMap.get(accountCodeId);
    const actualAmount = (actualCents.get(accountCodeId) ?? 0) / 100;
    const variance = budgetAmount - actualAmount;
    return {
      budgetLineId,
      accountCodeId,
      accountCode: account ? String(account.code) : "—",
      accountName: account ? String(account.name) : "Unknown",
      accountType: account?.accountType ?? "EXPENSE",
      budgetAmount,
      actualAmount,
      variance,
      variancePercent: budgetAmount !== 0 ? (variance / budgetAmount) * 100 : 0,
      notes,
    };
  };

  const comparison = budgetLines.map((bl) => row(bl.accountCodeId, Number(bl.budgetAmount), bl.id, bl.notes ?? null));
  const budgeted = new Set(budgetLines.map((bl) => bl.accountCodeId));
  for (const [accountCodeId, cents] of actualCents) {
    if (!budgeted.has(accountCodeId) && cents !== 0) comparison.push(row(accountCodeId, 0, null, "No budget line"));
  }
  comparison.sort((a, b) => a.accountCode.localeCompare(b.accountCode));

  const sum = (type: string, key: "budgetAmount" | "actualAmount") =>
    Math.round(comparison.filter((r) => r.accountType === type).reduce((s, r) => s + r[key], 0) * 100) / 100;
  const totalBudget = sum("EXPENSE", "budgetAmount");
  const totalActual = sum("EXPENSE", "actualAmount");
  return {
    lines: comparison,
    totalBudget,
    totalActual,
    totalVariance: Math.round((totalBudget - totalActual) * 100) / 100,
    incomeBudget: sum("INCOME", "budgetAmount"),
    incomeActual: sum("INCOME", "actualAmount"),
  };
}
