"use client";

import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { SelectField } from "@/components/ui/form-field";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  formatActionLabel,
  formatEntityTypeLabel,
} from "@/lib/queries/activity-log-utils";

const inputClasses =
  "w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise transition-colors";

// ─── Types ─────────────────────────────────────────────────────

interface CommitteeFundSummary {
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

interface CommitteeArrearsSnapshot {
  current: number;
  days30: number;
  days60: number;
  days90: number;
  days90Plus: number;
  total: number;
  lotCount: number;
}

interface CommitteeBudgetComparison {
  fundName: string;
  totalBudget: number;
  totalActual: number;
  totalVariance: number;
  variancePercent: number;
  lines: Array<{
    accountCode: string;
    accountName: string;
    budgetAmount: number;
    actualAmount: number;
    variance: number;
    variancePercent: number;
  }>;
}

interface CommitteeBankSummary {
  bankAccountName: string;
  closingBalance: number;
  unmatchedCount: number;
  lastReconciledDate: string | null;
}

interface CommitteeRecentActivity {
  action: string;
  entityType: string;
  actorName: string;
  createdAt: string;
}

interface CommitteeReportingPack {
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

// ─── Helpers ───────────────────────────────────────────────────

function formatCurrency(value: number): string {
  if (value < 0) {
    return `($${Math.abs(value).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
  }
  return `$${value.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function fundTypeLabel(fundType: string): string {
  switch (fundType) {
    case "ADMINISTRATIVE":
      return "Admin";
    case "CAPITAL_WORKS":
      return "Capital Works";
    default:
      return fundType;
  }
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function varianceColour(variance: number): string {
  if (variance > 0) return "text-green-600";
  if (variance < 0) return "text-red-600";
  return "text-ink";
}

// ─── Component ─────────────────────────────────────────────────

export function CommitteePackClient({
  schemeId,
  financialYear,
  fyOptions,
  startDate,
  endDate,
  pack,
  basePath,
}: {
  schemeId: string;
  financialYear: number;
  fyOptions: { value: string; label: string }[];
  startDate: string;
  endDate: string;
  pack: CommitteeReportingPack;
  basePath?: string;
}) {
  const router = useRouter();
  const resolvedBasePath = basePath ?? `/adviser/schemes/${schemeId}/finance/reports/committee-pack`;

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams();
    const merged = {
      year: String(financialYear),
      startDate,
      endDate,
      ...updates,
    };
    if (merged.year) params.set("year", merged.year);
    if (merged.startDate) params.set("startDate", merged.startDate);
    if (merged.endDate) params.set("endDate", merged.endDate);
    const qs = params.toString();
    router.push(
      `${resolvedBasePath}${qs ? `?${qs}` : ""}`,
    );
  }

  const hasData =
    pack.fundSummaries.length > 0 ||
    pack.bankSummaries.length > 0 ||
    pack.recentActivity.length > 0;

  return (
    <div className="space-y-6">
      {/* ── Period Selection ─────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Report Period"
          description="Select the financial year and optional custom date range."
        />
        <div className="px-6 pb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SelectField
            label="Financial Year"
            name="year"
            value={String(financialYear)}
            onChange={(e) => {
              const fy = parseInt(e.target.value, 10);
              updateParams({
                year: e.target.value,
                startDate: `${fy}-07-01`,
                endDate: `${fy + 1}-06-30`,
              });
            }}
            options={fyOptions}
          />
          <div>
            <label
              htmlFor="startDate"
              className="block text-sm font-medium text-ink mb-1.5"
            >
              Start Date
            </label>
            <input
              id="startDate"
              type="date"
              className={inputClasses}
              value={startDate}
              onChange={(e) => updateParams({ startDate: e.target.value })}
            />
          </div>
          <div>
            <label
              htmlFor="endDate"
              className="block text-sm font-medium text-ink mb-1.5"
            >
              End Date
            </label>
            <input
              id="endDate"
              type="date"
              className={inputClasses}
              value={endDate}
              onChange={(e) => updateParams({ endDate: e.target.value })}
            />
          </div>
        </div>
      </Card>

      {!hasData ? (
        <EmptyState
          title="No financial data"
          description="There is no financial data available for the selected period. Ensure funds, levies, and journal entries have been set up."
        />
      ) : (
        <>
          {/* ── Key Metrics ─────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              label="Total Fund Balance"
              value={formatCurrency(pack.totalFundBalance)}
              accent={pack.totalFundBalance >= 0 ? "bg-green-500" : "bg-red-500"}
            />
            <StatCard
              label="Cash Position"
              value={formatCurrency(pack.cashPosition)}
              accent={pack.cashPosition >= 0 ? "bg-blue-500" : "bg-red-500"}
            />
            <StatCard
              label="Levy Collection Rate"
              value={formatPercent(pack.levyCollectionRate)}
              accent={
                pack.levyCollectionRate >= 90
                  ? "bg-green-500"
                  : pack.levyCollectionRate >= 70
                    ? "bg-yellow-500"
                    : "bg-red-500"
              }
            />
            <StatCard
              label="Total Arrears"
              value={formatCurrency(pack.arrearsSnapshot.total)}
              accent={
                pack.arrearsSnapshot.total > 0 ? "bg-red-500" : "bg-green-500"
              }
            />
          </div>

          {/* ── Fund Summaries ──────────────────────────────── */}
          {pack.fundSummaries.length > 0 && (
            <Card>
              <CardHeader
                title="Fund Summaries"
                description={pack.periodLabel}
              />
              <div className="px-6 pb-6 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-xs font-medium text-ink-muted uppercase tracking-wide">
                      <th scope="col" className="text-left py-2 pr-4">Fund</th>
                      <th scope="col" className="text-left py-2 pr-4">Type</th>
                      <th scope="col" className="text-right py-2 pr-4">Opening</th>
                      <th scope="col" className="text-right py-2 pr-4">Income</th>
                      <th scope="col" className="text-right py-2 pr-4">Expenses</th>
                      <th scope="col" className="text-right py-2 pr-4">Net</th>
                      <th scope="col" className="text-right py-2">Closing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pack.fundSummaries.map((fund) => (
                      <tr
                        key={fund.fundId}
                        className="border-b border-line/50"
                      >
                        <td className="py-2.5 pr-4 font-medium text-ink">
                          {fund.fundName}
                        </td>
                        <td className="py-2.5 pr-4 text-ink-muted">
                          {fundTypeLabel(fund.fundType)}
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-ink">
                          {formatCurrency(fund.openingBalance)}
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-green-600">
                          {formatCurrency(fund.totalIncome)}
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-red-600">
                          {formatCurrency(fund.totalExpenses)}
                        </td>
                        <td
                          className={`py-2.5 pr-4 text-right tabular-nums font-medium ${fund.netMovement >= 0 ? "text-green-600" : "text-red-600"}`}
                        >
                          {formatCurrency(fund.netMovement)}
                        </td>
                        <td
                          className={`py-2.5 text-right tabular-nums font-semibold ${fund.closingBalance >= 0 ? "text-ink" : "text-red-600"}`}
                        >
                          {formatCurrency(fund.closingBalance)}
                        </td>
                      </tr>
                    ))}
                    {/* Totals row */}
                    <tr className="font-semibold">
                      <td className="py-2.5 pr-4 text-ink" colSpan={2}>
                        Total
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-ink">
                        {formatCurrency(
                          pack.fundSummaries.reduce(
                            (s, f) => s + f.openingBalance,
                            0,
                          ),
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-green-600">
                        {formatCurrency(
                          pack.fundSummaries.reduce(
                            (s, f) => s + f.totalIncome,
                            0,
                          ),
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-red-600">
                        {formatCurrency(
                          pack.fundSummaries.reduce(
                            (s, f) => s + f.totalExpenses,
                            0,
                          ),
                        )}
                      </td>
                      <td
                        className={`py-2.5 pr-4 text-right tabular-nums ${pack.totalFundBalance >= 0 ? "text-green-600" : "text-red-600"}`}
                      >
                        {formatCurrency(
                          pack.fundSummaries.reduce(
                            (s, f) => s + f.netMovement,
                            0,
                          ),
                        )}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-ink">
                        {formatCurrency(pack.totalFundBalance)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* ── Aged Arrears Snapshot ───────────────────────── */}
          {pack.arrearsSnapshot.total > 0 && (
            <Card>
              <CardHeader
                title="Aged Arrears"
                description={`${pack.arrearsSnapshot.lotCount} lot${pack.arrearsSnapshot.lotCount !== 1 ? "s" : ""} with outstanding levies`}
              />
              <div className="px-6 pb-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <ArrearsCell
                    label="Current"
                    value={pack.arrearsSnapshot.current}
                  />
                  <ArrearsCell
                    label="30 Days"
                    value={pack.arrearsSnapshot.days30}
                  />
                  <ArrearsCell
                    label="60 Days"
                    value={pack.arrearsSnapshot.days60}
                  />
                  <ArrearsCell
                    label="90 Days"
                    value={pack.arrearsSnapshot.days90}
                  />
                  <ArrearsCell
                    label="90+ Days"
                    value={pack.arrearsSnapshot.days90Plus}
                    highlight
                  />
                  <ArrearsCell
                    label="Total"
                    value={pack.arrearsSnapshot.total}
                    bold
                  />
                </div>
              </div>
            </Card>
          )}

          {/* ── Budget vs Actual ────────────────────────────── */}
          {pack.budgetComparisons.length > 0 && (
            <Card>
              <CardHeader
                title="Budget vs Actual"
                description={`FY ${financialYear}/${financialYear + 1}`}
              />
              <div className="px-6 pb-6 space-y-6">
                {pack.budgetComparisons.map((comp) => (
                  <div key={comp.fundName}>
                    <h4 className="text-sm font-semibold text-ink mb-3">
                      {comp.fundName}
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-line text-xs font-medium text-ink-muted uppercase tracking-wide">
                            <th scope="col" className="text-left py-2 pr-4">Account</th>
                            <th scope="col" className="text-right py-2 pr-4">Budget</th>
                            <th scope="col" className="text-right py-2 pr-4">Actual</th>
                            <th scope="col" className="text-right py-2 pr-4">Variance</th>
                            <th scope="col" className="text-right py-2">%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {comp.lines.map((line) => (
                            <tr
                              key={line.accountCode}
                              className="border-b border-line/50"
                            >
                              <td className="py-2 pr-4 text-ink">
                                <span className="text-ink-muted mr-2">
                                  {line.accountCode}
                                </span>
                                {line.accountName}
                              </td>
                              <td className="py-2 pr-4 text-right tabular-nums text-ink">
                                {formatCurrency(line.budgetAmount)}
                              </td>
                              <td className="py-2 pr-4 text-right tabular-nums text-ink">
                                {formatCurrency(line.actualAmount)}
                              </td>
                              <td
                                className={`py-2 pr-4 text-right tabular-nums ${varianceColour(line.variance)}`}
                              >
                                {formatCurrency(line.variance)}
                              </td>
                              <td
                                className={`py-2 text-right tabular-nums ${varianceColour(line.variance)}`}
                              >
                                {formatPercent(line.variancePercent)}
                              </td>
                            </tr>
                          ))}
                          {/* Fund totals */}
                          <tr className="font-semibold">
                            <td className="py-2 pr-4 text-ink">Total</td>
                            <td className="py-2 pr-4 text-right tabular-nums text-ink">
                              {formatCurrency(comp.totalBudget)}
                            </td>
                            <td className="py-2 pr-4 text-right tabular-nums text-ink">
                              {formatCurrency(comp.totalActual)}
                            </td>
                            <td
                              className={`py-2 pr-4 text-right tabular-nums ${varianceColour(comp.totalVariance)}`}
                            >
                              {formatCurrency(comp.totalVariance)}
                            </td>
                            <td
                              className={`py-2 text-right tabular-nums ${varianceColour(comp.totalVariance)}`}
                            >
                              {formatPercent(comp.variancePercent)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* ── Bank Account Status ────────────────────────── */}
          {pack.bankSummaries.length > 0 && (
            <Card>
              <CardHeader
                title="Bank Account Status"
                description="Current balances and reconciliation status."
              />
              <div className="px-6 pb-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {pack.bankSummaries.map((bank) => (
                    <div
                      key={bank.bankAccountName}
                      className="rounded-[var(--radius-card)] border border-line p-4"
                    >
                      <h4 className="text-sm font-semibold text-ink mb-3">
                        {bank.bankAccountName}
                      </h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-ink-muted">Balance</span>
                          <span className="font-medium tabular-nums text-ink">
                            {formatCurrency(bank.closingBalance)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-ink-muted">
                            Unmatched Transactions
                          </span>
                          <span
                            className={`font-medium tabular-nums ${bank.unmatchedCount > 0 ? "text-yellow-600" : "text-green-600"}`}
                          >
                            {bank.unmatchedCount}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-ink-muted">
                            Last Reconciled
                          </span>
                          <span className="text-ink">
                            {bank.lastReconciledDate
                              ? formatDate(bank.lastReconciledDate)
                              : "Not yet reconciled"}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* ── Recent Activity ─────────────────────────────── */}
          {pack.recentActivity.length > 0 && (
            <Card>
              <CardHeader
                title="Recent Financial Activity"
                description="Last 20 actions recorded for this scheme."
              />
              <div className="divide-y divide-line">
                {pack.recentActivity.map((activity, idx) => (
                  <div
                    key={`${activity.createdAt}-${idx}`}
                    className="flex items-start gap-4 px-6 py-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ink">
                        <span className="font-medium">
                          {formatActionLabel(activity.action)}
                        </span>
                        <span className="text-ink-muted">
                          {" "}
                          on{" "}
                          {formatEntityTypeLabel(activity.entityType)}
                        </span>
                      </p>
                      <p className="text-xs text-ink-muted mt-0.5">
                        {activity.actorName}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-ink-muted">
                        {formatDate(activity.createdAt)}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {formatTime(activity.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* ── Report metadata ─────────────────────────────── */}
          <p className="text-xs text-ink-muted text-center">
            Report generated {formatDate(pack.reportDate)} at{" "}
            {formatTime(pack.reportDate)} for {pack.schemeName}
          </p>
        </>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────

function ArrearsCell({
  label,
  value,
  highlight,
  bold,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  bold?: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-card)] bg-muted px-3 py-2.5 text-center">
      <p className="text-xs text-ink-muted mb-1">{label}</p>
      <p
        className={`text-sm tabular-nums ${
          bold
            ? "font-bold text-ink"
            : highlight && value > 0
              ? "font-semibold text-red-600"
              : value > 0
                ? "font-medium text-ink"
                : "text-ink-muted"
        }`}
      >
        {formatCurrency(value)}
      </p>
    </div>
  );
}
