/**
 * Statement of key financial information (pure): the rows of the approved
 * form under SSMA 2015 s 94(2), per fund, from ledger lines and levy data.
 * See KEY_FINANCIAL_INFORMATION in src/config/statutory.ts.
 */
import type { BasisEntry } from "./accounting-basis";

export interface KeyFinancialInformation {
  balanceCarriedForwardCents: number;
  totalIncomeReceivedCents: number;
  totalInterestEarnedCents: number;
  totalContributionsPaidCents: number;
  totalUnpaidContributionsCents: number;
  maintenanceExpenditureCents: number;
  administrationExpenditureCents: number;
  balanceAtEndCents: number;
  principalItemsNextPeriod: { description: string; amountCents: number }[];
}

/** Owners' funds of a fund (assets less liabilities) from its ledger lines up to and including a date. */
export function ownersFundsCents(entries: BasisEntry[], fundId: string, upTo: string): number {
  let assets = 0;
  let liabilities = 0;
  for (const e of entries) {
    if (e.date > upTo) continue;
    for (const l of e.lines) {
      if (l.fundId !== fundId) continue;
      if (l.accountType === "ASSET") assets += l.debitCents - l.creditCents;
      else if (l.accountType === "LIABILITY") liabilities += l.creditCents - l.debitCents;
    }
  }
  return assets - liabilities;
}

export interface UnpaidNotice {
  dueDate: string;
  owedCents: number;
  payments: { date: string; amountCents: number }[];
}

/** Contributions due by the date and still unpaid at it (payments after the date do not count). */
export function unpaidAt(notices: UnpaidNotice[], asAt: string): number {
  return notices
    .filter((n) => n.dueDate <= asAt)
    .reduce((s, n) => s + Math.max(0, n.owedCents - n.payments.filter((p) => p.date <= asAt).reduce((t, p) => t + p.amountCents, 0)), 0);
}

export function keyFinancialInformation(input: {
  entries: BasisEntry[];
  fundId: string;
  start: string;
  end: string;
  /** Day before the period starts. */
  dayBefore: string;
  /** Income and expenditure recognised for the fund in the period, on its basis. */
  recognised: { accountType: "INCOME" | "EXPENSE"; accountSubType: string | null; amountCents: number }[];
  unpaidNotices: UnpaidNotice[];
  principalItemsNextPeriod: { description: string; amountCents: number }[];
}): KeyFinancialInformation {
  let received = 0;
  let contributions = 0;
  // The opening balances brought forward at takeover are not money received
  // (financials review B4, 26 Oct 2026). If the takeover falls in the period,
  // the balance carried forward is the balance at takeover.
  const takeover = input.entries
    .filter((e) => e.sourceType === "DATA_MIGRATION" && e.date >= input.start && e.date <= input.end)
    .map((e) => e.date)
    .sort()
    .pop();
  for (const e of input.entries) {
    if (e.date < input.start || e.date > input.end) continue;
    if (e.sourceType === "DATA_MIGRATION") continue;
    // Money moved between the funds inside the shared bank account counts as
    // received by the fund it moved to, and not by the one it left.
    const bankFunds = new Set(e.lines.filter((l) => l.accountSubType === "BANK").map((l) => l.fundId));
    for (const l of e.lines) {
      if (l.fundId !== input.fundId) continue;
      // Money received into the bank for this fund.
      if (l.accountSubType === "BANK") received += bankFunds.size > 1 ? l.debitCents - l.creditCents : l.debitCents;
      // Contributions paid: receivables credited by receipts or applied credit.
      if (l.accountSubType === "ACCOUNTS_RECEIVABLE" && (e.sourceType === "PAYMENT" || e.sourceType === "OWNER_CREDIT")) {
        contributions += l.creditCents - l.debitCents;
      }
    }
  }
  const sum = (pred: (r: (typeof input.recognised)[number]) => boolean) => input.recognised.filter(pred).reduce((s, r) => s + r.amountCents, 0);
  return {
    balanceCarriedForwardCents: ownersFundsCents(input.entries, input.fundId, takeover ?? input.dayBefore),
    totalIncomeReceivedCents: received,
    totalInterestEarnedCents: sum((r) => r.accountType === "INCOME" && r.accountSubType === "INTEREST_INCOME"),
    totalContributionsPaidCents: contributions,
    totalUnpaidContributionsCents: unpaidAt(input.unpaidNotices, input.end),
    maintenanceExpenditureCents: sum((r) => r.accountType === "EXPENSE" && r.accountSubType === "MAINTENANCE_EXPENSE"),
    administrationExpenditureCents: sum((r) => r.accountType === "EXPENSE" && r.accountSubType !== "MAINTENANCE_EXPENSE"),
    balanceAtEndCents: ownersFundsCents(input.entries, input.fundId, input.end),
    principalItemsNextPeriod: [...input.principalItemsNextPeriod].sort((a, b) => b.amountCents - a.amountCents).slice(0, 8),
  };
}

/** Whether the accounts must be audited (SSMA 2015 s 95). See AUDIT_THRESHOLD. */
export function auditRequired(input: { lots: number; leviesRaisedCents: number; lotsMoreThan: number; leviesRaisedMoreThanCents: number }) {
  const byLots = input.lots > input.lotsMoreThan;
  const byBudget = input.leviesRaisedCents > input.leviesRaisedMoreThanCents;
  return { required: byLots || byBudget, byLots, byBudget };
}

/**
 * Total levies raised for a financial year, for the audit test. Each lot
 * pays its share (unit entitlement over total entitlement) of the amount the
 * owners corporation resolved to raise, so the scheme total is that amount:
 * the approved or active levy schedules for the year (ordinary and special).
 *
 * Fund by fund, the larger of the schedules and the notices actually issued
 * for the year is taken, so a schedule replaced part way through the year,
 * or levies raised outside a schedule, are not missed.
 */
export function leviesRaisedForYear(input: {
  schedules: Array<{ fundId: string; status: string; budgetAmountCents: number }>;
  notices: Array<{ fundId: string; amountDueCents: number }>;
}): { totalCents: number; byFund: Record<string, number> } {
  const fromSchedules: Record<string, number> = {};
  for (const s of input.schedules) {
    if (s.status !== "APPROVED" && s.status !== "ACTIVE") continue;
    fromSchedules[s.fundId] = (fromSchedules[s.fundId] ?? 0) + s.budgetAmountCents;
  }
  const fromNotices: Record<string, number> = {};
  for (const n of input.notices) fromNotices[n.fundId] = (fromNotices[n.fundId] ?? 0) + n.amountDueCents;
  const byFund: Record<string, number> = {};
  for (const fundId of new Set([...Object.keys(fromSchedules), ...Object.keys(fromNotices)])) {
    byFund[fundId] = Math.max(fromSchedules[fundId] ?? 0, fromNotices[fundId] ?? 0);
  }
  return { totalCents: Object.values(byFund).reduce((a, b) => a + b, 0), byFund };
}
