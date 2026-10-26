"use client";

import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";

interface FundSummaryData {
  fundId: string;
  fundName: string;
  fundType: string;
  openingBalance: number;
  totalIncome: number;
  totalExpenses: number;
  broughtForward: number;
  netMovement: number;
  closingBalance: number;
  totalLevied: number;
  totalCollected: number;
  outstandingLevies: number;
}

function formatCurrency(value: number): string {
  if (value < 0) {
    return `($${Math.abs(value).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
  }
  return `$${value.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fundTypeLabel(fundType: string): string {
  switch (fundType) {
    case "ADMINISTRATIVE":
      return "Administrative Fund";
    case "CAPITAL_WORKS":
      return "Capital Works Fund";
    default:
      return fundType;
  }
}

export function FundSummaryClient({
  schemeId,
  startDate,
  endDate,
  summaries,
  basePath,
}: {
  schemeId: string;
  startDate: string;
  endDate: string;
  summaries: FundSummaryData[];
  basePath?: string;
}) {
  const router = useRouter();
  const reportBase = basePath ?? `/adviser/schemes/${schemeId}/finance/reports`;

  function applyFilters(updates: Record<string, string>) {
    const params = new URLSearchParams();
    const current = { startDate, endDate, ...updates };
    if (current.startDate) params.set("startDate", current.startDate);
    if (current.endDate) params.set("endDate", current.endDate);
    const qs = params.toString();
    router.push(
      `${reportBase}/fund-summary${qs ? `?${qs}` : ""}`,
    );
  }

  const totalClosing = summaries.reduce((s, f) => s + f.closingBalance, 0);
  const totalOutstanding = summaries.reduce(
    (s, f) => s + f.outstandingLevies,
    0,
  );
  const totalNetMovement = summaries.reduce((s, f) => s + f.netMovement, 0);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader title="Report Period" />
        <div className="px-6 pb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            label="Start Date"
            name="startDate"
            type="date"
            value={startDate}
            onChange={(e) => applyFilters({ startDate: e.target.value })}
          />
          <FormField
            label="End Date"
            name="endDate"
            type="date"
            value={endDate}
            onChange={(e) => applyFilters({ endDate: e.target.value })}
          />
        </div>
      </Card>

      {summaries.length === 0 && (
        <EmptyState
          title="No funds configured"
          description="This scheme does not have any funds set up yet. Create Administrative and Capital Works funds from the Finance section."
        />
      )}

      {summaries.length > 0 && (
        <>
          {/* Top-level stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard
              label="Total Closing Balance"
              value={formatCurrency(totalClosing)}
              accent={totalClosing >= 0 ? "bg-green-500" : "bg-red-500"}
            />
            <StatCard
              label="Net Movement"
              value={formatCurrency(totalNetMovement)}
              accent={totalNetMovement >= 0 ? "bg-green-500" : "bg-yellow-500"}
            />
            <StatCard
              label="Arrears (levies and interest)"
              value={formatCurrency(totalOutstanding)}
              accent={totalOutstanding > 0 ? "bg-red-500" : "bg-green-500"}
            />
          </div>

          {/* Per-fund detail */}
          {summaries.map((fund) => (
            <Card key={fund.fundId}>
              <CardHeader
                title={fund.fundName}
                description={fundTypeLabel(fund.fundType)}
              />

              <div className="px-6 pb-6">
                {/* Financial position */}
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b border-line/50">
                      <td className="py-2 text-ink-muted">
                        Opening Balance
                      </td>
                      <td className="py-2 text-right tabular-nums text-ink">
                        {formatCurrency(fund.openingBalance)}
                      </td>
                    </tr>
                    <tr className="border-b border-line/50">
                      <td className="py-2 text-ink-muted pl-4">
                        Income
                      </td>
                      <td className="py-2 text-right tabular-nums text-green-600">
                        {formatCurrency(fund.totalIncome)}
                      </td>
                    </tr>
                    <tr className="border-b border-line/50">
                      <td className="py-2 text-ink-muted pl-4">
                        Expenses
                      </td>
                      <td className="py-2 text-right tabular-nums text-red-600">
                        {formatCurrency(fund.totalExpenses)}
                      </td>
                    </tr>
                    <tr className="border-b border-line">
                      <td className="py-2 font-medium text-ink pl-4">
                        Net Movement
                      </td>
                      <td
                        className={`py-2 text-right tabular-nums font-medium ${fund.netMovement >= 0 ? "text-green-600" : "text-red-600"}`}
                      >
                        {formatCurrency(fund.netMovement)}
                      </td>
                    </tr>
                    {Math.abs(fund.broughtForward) >= 0.005 && (
                      <tr className="border-b border-line/50">
                        <td className="py-2 text-ink-muted pl-4">
                          Balances brought forward and other equity entries
                        </td>
                        <td className="py-2 text-right tabular-nums text-ink">
                          {formatCurrency(fund.broughtForward)}
                        </td>
                      </tr>
                    )}
                    <tr className="border-b border-line font-semibold">
                      <td className="py-2 text-ink">Closing Balance</td>
                      <td
                        className={`py-2 text-right tabular-nums ${fund.closingBalance >= 0 ? "text-ink" : "text-red-600"}`}
                      >
                        {formatCurrency(fund.closingBalance)}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Levy collection */}
                {fund.totalLevied > 0 && (
                  <div className="mt-4 pt-4 border-t border-line">
                    <h4 className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">
                      Levy Collection
                    </h4>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-[var(--radius-card)] bg-muted px-3 py-2 text-center">
                        <p className="text-xs text-ink-muted">Levied</p>
                        <p className="text-sm font-medium text-ink tabular-nums">
                          {formatCurrency(fund.totalLevied)}
                        </p>
                      </div>
                      <div className="rounded-[var(--radius-card)] bg-muted px-3 py-2 text-center">
                        <p className="text-xs text-ink-muted">
                          Collected
                        </p>
                        <p className="text-sm font-medium text-green-600 tabular-nums">
                          {formatCurrency(fund.totalCollected)}
                        </p>
                      </div>
                      <div className="rounded-[var(--radius-card)] bg-muted px-3 py-2 text-center">
                        <p className="text-xs text-ink-muted">
                          In arrears
                        </p>
                        <p className="text-sm font-medium text-red-600 tabular-nums">
                          {formatCurrency(fund.outstandingLevies)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
