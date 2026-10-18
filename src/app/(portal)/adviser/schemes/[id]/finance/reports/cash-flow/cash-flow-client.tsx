"use client";

import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import type { CashFlowForecast } from "@/lib/queries/reports";

const monthOptions = [
  { value: "3", label: "3 months" },
  { value: "6", label: "6 months" },
  { value: "9", label: "9 months" },
  { value: "12", label: "12 months" },
];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function barWidth(value: number, max: number): string {
  if (max === 0) return "0%";
  return `${Math.min(100, Math.round((Math.abs(value) / max) * 100))}%`;
}

interface Props {
  schemeId: string;
  monthsAhead: number;
  forecast: CashFlowForecast;
  basePath?: string;
}

export function CashFlowClient({ schemeId, monthsAhead, forecast, basePath }: Props) {
  const router = useRouter();
  const reportBase = basePath ?? `/adviser/schemes/${schemeId}/finance/reports`;

  function applyMonths(months: string) {
    const params = new URLSearchParams();
    params.set("months", months);
    router.push(
      `${reportBase}/cash-flow?${params.toString()}`,
    );
  }

  const inputClasses =
    "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 transition-colors";

  // Find the max absolute flow value for bar chart scaling
  const maxFlow = forecast.months.reduce(
    (m, mo) =>
      Math.max(
        m,
        mo.levyIncome + mo.otherIncome,
        mo.supplierExpenses + mo.otherExpenses,
      ),
    1,
  );

  // Determine if any month dips below zero
  const lowestBalance = Math.min(
    ...forecast.months.map((m) => m.cumulativeBalance),
  );

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <Card>
        <div className="p-4">
          <div className="flex items-center gap-4">
            <label
              htmlFor="months-select"
              className="text-sm font-medium text-foreground whitespace-nowrap"
            >
              Forecast period
            </label>
            <select
              id="months-select"
              className={inputClasses + " max-w-[160px]"}
              value={String(monthsAhead)}
              onChange={(e) => applyMonths(e.target.value)}
            >
              {monthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Key metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Current Cash Position"
          value={formatCurrency(forecast.startingBalance)}
        />
        <StatCard
          label="Projected Inflows"
          value={formatCurrency(
            forecast.totalLevyIncome + forecast.totalOtherIncome,
          )}
          accent="bg-emerald-500"
        />
        <StatCard
          label="Projected Outflows"
          value={formatCurrency(
            forecast.totalSupplierExpenses + forecast.totalOtherExpenses,
          )}
          accent="bg-rose-500"
        />
        <StatCard
          label="Ending Balance"
          value={formatCurrency(forecast.endingBalance)}
          accent={forecast.endingBalance >= 0 ? "bg-primary-400" : "bg-rose-500"}
        />
      </div>

      {/* Low balance warning */}
      {lowestBalance < 0 && (
        <div className="rounded-lg border border-amber-400/50 bg-amber-50/10 p-4">
          <p className="text-sm font-medium text-amber-600">
            ⚠ Cash flow warning: projected balance drops below zero in the
            forecast period (lowest:{" "}
            <span className="font-semibold">
              {formatCurrency(lowestBalance)}
            </span>
            ). Consider reviewing levy schedules or deferring non-essential
            expenditure.
          </p>
        </div>
      )}

      {/* Monthly breakdown table */}
      <Card>
        <CardHeader
          title="Monthly Projection"
          description="Projected cash inflows and outflows by month"
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 font-medium text-muted-foreground">
                  Month
                </th>
                <th className="px-4 py-3 font-medium text-muted-foreground text-right">
                  Levy Income
                </th>
                <th className="px-4 py-3 font-medium text-muted-foreground text-right">
                  Other Income
                </th>
                <th className="px-4 py-3 font-medium text-muted-foreground text-right">
                  Supplier Costs
                </th>
                <th className="px-4 py-3 font-medium text-muted-foreground text-right">
                  Other Costs
                </th>
                <th className="px-4 py-3 font-medium text-muted-foreground text-right">
                  Net Flow
                </th>
                <th className="px-4 py-3 font-medium text-muted-foreground text-right">
                  Balance
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Starting balance row */}
              <tr className="border-b border-border bg-card/50">
                <td className="px-4 py-3 font-medium text-foreground">
                  Opening Balance
                </td>
                <td className="px-4 py-3" colSpan={5} />
                <td className="px-4 py-3 text-right font-semibold text-foreground">
                  {formatCurrency(forecast.startingBalance)}
                </td>
              </tr>

              {forecast.months.map((month) => (
                <tr
                  key={month.month}
                  className="border-b border-border hover:bg-card/30 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-foreground">
                    {month.label}
                  </td>
                  <td className="px-4 py-3 text-right text-emerald-600">
                    {month.levyIncome > 0
                      ? formatCurrency(month.levyIncome)
                      : "–"}
                  </td>
                  <td className="px-4 py-3 text-right text-emerald-600">
                    {month.otherIncome > 0
                      ? formatCurrency(month.otherIncome)
                      : "–"}
                  </td>
                  <td className="px-4 py-3 text-right text-rose-600">
                    {month.supplierExpenses > 0
                      ? formatCurrency(month.supplierExpenses)
                      : "–"}
                  </td>
                  <td className="px-4 py-3 text-right text-rose-600">
                    {month.otherExpenses > 0
                      ? formatCurrency(month.otherExpenses)
                      : "–"}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-medium ${
                      month.netFlow >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {month.netFlow >= 0 ? "+" : ""}
                    {formatCurrency(month.netFlow)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-semibold ${
                      month.cumulativeBalance < 0
                        ? "text-rose-600"
                        : "text-foreground"
                    }`}
                  >
                    {formatCurrency(month.cumulativeBalance)}
                  </td>
                </tr>
              ))}

              {/* Totals row */}
              <tr className="bg-card/50 font-semibold">
                <td className="px-4 py-3 text-foreground">Total</td>
                <td className="px-4 py-3 text-right text-emerald-600">
                  {formatCurrency(forecast.totalLevyIncome)}
                </td>
                <td className="px-4 py-3 text-right text-emerald-600">
                  {formatCurrency(forecast.totalOtherIncome)}
                </td>
                <td className="px-4 py-3 text-right text-rose-600">
                  {formatCurrency(forecast.totalSupplierExpenses)}
                </td>
                <td className="px-4 py-3 text-right text-rose-600">
                  {formatCurrency(forecast.totalOtherExpenses)}
                </td>
                <td
                  className={`px-4 py-3 text-right ${
                    forecast.totalNetFlow >= 0
                      ? "text-emerald-600"
                      : "text-rose-600"
                  }`}
                >
                  {forecast.totalNetFlow >= 0 ? "+" : ""}
                  {formatCurrency(forecast.totalNetFlow)}
                </td>
                <td
                  className={`px-4 py-3 text-right ${
                    forecast.endingBalance < 0
                      ? "text-rose-600"
                      : "text-foreground"
                  }`}
                >
                  {formatCurrency(forecast.endingBalance)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Visual bar chart */}
      <Card>
        <CardHeader
          title="Cash Flow Chart"
          description="Inflows vs outflows by month"
        />
        <div className="p-4 space-y-3">
          {forecast.months.map((month) => {
            const totalIn = month.levyIncome + month.otherIncome;
            const totalOut = month.supplierExpenses + month.otherExpenses;
            return (
              <div key={month.month} className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-medium text-foreground w-20">
                    {month.label}
                  </span>
                  <span>
                    Net: {month.netFlow >= 0 ? "+" : ""}
                    {formatCurrency(month.netFlow)}
                  </span>
                </div>
                <div className="flex gap-1 items-center">
                  <div className="flex-1 h-5 bg-card rounded overflow-hidden">
                    <div
                      className="h-full bg-emerald-500/70 rounded"
                      style={{ width: barWidth(totalIn, maxFlow) }}
                    />
                  </div>
                  <div className="flex-1 h-5 bg-card rounded overflow-hidden">
                    <div
                      className="h-full bg-rose-500/70 rounded"
                      style={{ width: barWidth(totalOut, maxFlow) }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
          <div className="flex items-center gap-4 pt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded bg-emerald-500/70" />
              Inflows
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded bg-rose-500/70" />
              Outflows
            </span>
          </div>
        </div>
      </Card>

      {/* Assumptions note */}
      <div className="rounded-lg border border-border p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground text-sm">
          Forecast assumptions
        </p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>
            Starting balance is derived from the last reconciled bank account
            balances.
          </li>
          <li>
            Levy income is based on outstanding levy notices with due dates in
            each forecast month. Overdue levies are assumed collected in the
            current month.
          </li>
          <li>
            Supplier costs are based on approved or outstanding invoices with due
            dates in each forecast month.
          </li>
          <li>
            Months without specific levy or invoice data use a proportional
            estimate from the current financial year budget.
          </li>
          <li>
            This forecast does not account for unplanned capital works,
            insurance claims, or other ad hoc income and expenditure.
          </li>
        </ul>
      </div>
    </div>
  );
}
