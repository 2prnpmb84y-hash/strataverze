"use client";

import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import type { FundBalanceProjections } from "@/lib/queries/reports";

const yearOptions = [
  { value: "3", label: "3 years" },
  { value: "5", label: "5 years" },
  { value: "7", label: "7 years" },
  { value: "10", label: "10 years" },
];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function fundTypeLabel(type: string): string {
  switch (type) {
    case "ADMINISTRATIVE":
      return "Administrative Fund";
    case "CAPITAL_WORKS":
      return "Capital Works Fund";
    case "SPECIAL":
      return "Special Fund";
    default:
      return type;
  }
}

function fundTypeAccent(type: string): string {
  switch (type) {
    case "ADMINISTRATIVE":
      return "bg-primary-400";
    case "CAPITAL_WORKS":
      return "bg-amber-500";
    case "SPECIAL":
      return "bg-violet-500";
    default:
      return "bg-primary-400";
  }
}

interface Props {
  schemeId: string;
  yearsAhead: number;
  data: FundBalanceProjections;
  basePath?: string;
}

export function FundProjectionsClient({ schemeId, yearsAhead, data, basePath }: Props) {
  const router = useRouter();
  const reportBase = basePath ?? `/adviser/schemes/${schemeId}/finance/reports`;

  function applyYears(years: string) {
    const params = new URLSearchParams();
    params.set("years", years);
    router.push(
      `${reportBase}/fund-projections?${params.toString()}`,
    );
  }

  const inputClasses =
    "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 transition-colors";

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <Card>
        <div className="p-4">
          <div className="flex items-center gap-4">
            <label
              htmlFor="years-select"
              className="text-sm font-medium text-foreground whitespace-nowrap"
            >
              Projection period
            </label>
            <select
              id="years-select"
              className={inputClasses + " max-w-[160px]"}
              value={String(yearsAhead)}
              onChange={(e) => applyYears(e.target.value)}
            >
              {yearOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {data.projections.length === 0 && (
        <Card>
          <div className="p-8 text-center text-sm text-muted-foreground">
            No active funds found for this scheme.
          </div>
        </Card>
      )}

      {/* Per-fund projection tables */}
      {data.projections.map((fund) => {
        const finalYear = fund.years[fund.years.length - 1];
        const trend =
          finalYear && finalYear.closingBalance > fund.currentBalance
            ? "growing"
            : finalYear && finalYear.closingBalance < 0
              ? "deficit"
              : "declining";

        return (
          <Card key={fund.fundId}>
            <CardHeader
              title={fund.fundName}
              description={fundTypeLabel(fund.fundType)}
            />

            {/* Summary strip */}
            <div className="px-4 pb-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg bg-card border border-border p-3">
                  <p className="text-xs text-muted-foreground">
                    Current Balance
                  </p>
                  <p className="text-lg font-semibold text-foreground mt-0.5">
                    {formatCurrency(fund.currentBalance)}
                  </p>
                </div>
                <div className="rounded-lg bg-card border border-border p-3">
                  <p className="text-xs text-muted-foreground">
                    Annual Levy Income
                  </p>
                  <p className="text-lg font-semibold text-emerald-600 mt-0.5">
                    {fund.years[0]
                      ? formatCurrency(fund.years[0].levyIncome)
                      : "–"}
                  </p>
                </div>
                <div className="rounded-lg bg-card border border-border p-3">
                  <p className="text-xs text-muted-foreground">
                    Annual Expenses
                  </p>
                  <p className="text-lg font-semibold text-rose-600 mt-0.5">
                    {fund.years[0]
                      ? formatCurrency(fund.years[0].expenses)
                      : "–"}
                  </p>
                </div>
                <div className="rounded-lg bg-card border border-border p-3">
                  <p className="text-xs text-muted-foreground">
                    Projected Balance ({finalYear?.label ?? "–"})
                  </p>
                  <p
                    className={`text-lg font-semibold mt-0.5 ${
                      finalYear && finalYear.closingBalance < 0
                        ? "text-rose-600"
                        : "text-foreground"
                    }`}
                  >
                    {finalYear
                      ? formatCurrency(finalYear.closingBalance)
                      : "–"}
                  </p>
                </div>
              </div>
            </div>

            {/* Projection table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-b border-border text-left">
                    <th className="px-4 py-3 font-medium text-muted-foreground">
                      Financial Year
                    </th>
                    <th className="px-4 py-3 font-medium text-muted-foreground text-right">
                      Opening
                    </th>
                    <th className="px-4 py-3 font-medium text-muted-foreground text-right">
                      Levy Income
                    </th>
                    <th className="px-4 py-3 font-medium text-muted-foreground text-right">
                      Expenses
                    </th>
                    <th className="px-4 py-3 font-medium text-muted-foreground text-right">
                      Net Movement
                    </th>
                    <th className="px-4 py-3 font-medium text-muted-foreground text-right">
                      Closing
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {fund.years.map((year) => (
                    <tr
                      key={year.financialYear}
                      className="border-b border-border hover:bg-card/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-foreground">
                        {year.label}
                      </td>
                      <td className="px-4 py-3 text-right text-foreground">
                        {formatCurrency(year.openingBalance)}
                      </td>
                      <td className="px-4 py-3 text-right text-emerald-600">
                        {formatCurrency(year.levyIncome)}
                      </td>
                      <td className="px-4 py-3 text-right text-rose-600">
                        {formatCurrency(year.expenses)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-medium ${
                          year.netMovement >= 0
                            ? "text-emerald-600"
                            : "text-rose-600"
                        }`}
                      >
                        {year.netMovement >= 0 ? "+" : ""}
                        {formatCurrency(year.netMovement)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-semibold ${
                          year.closingBalance < 0
                            ? "text-rose-600"
                            : "text-foreground"
                        }`}
                      >
                        {formatCurrency(year.closingBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Visual balance trajectory */}
            <div className="p-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Balance trajectory
              </p>
              <div className="flex items-end gap-1 h-16">
                {fund.years.map((year) => {
                  const maxBalance = Math.max(
                    ...fund.years.map((y) =>
                      Math.max(Math.abs(y.closingBalance), 1),
                    ),
                  );
                  const heightPercent = Math.min(
                    100,
                    Math.round(
                      (Math.abs(year.closingBalance) / maxBalance) * 100,
                    ),
                  );
                  const isNegative = year.closingBalance < 0;
                  return (
                    <div
                      key={year.financialYear}
                      className="flex-1 flex flex-col items-center gap-0.5"
                    >
                      <div
                        className={`w-full rounded-t ${
                          isNegative
                            ? "bg-rose-500/70"
                            : `${fundTypeAccent(fund.fundType)}/70`
                        }`}
                        style={{
                          height: `${Math.max(heightPercent, 4)}%`,
                        }}
                      />
                      <span className="text-[10px] text-muted-foreground leading-none">
                        {year.label.replace("FY ", "")}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Trend indicator */}
            {trend === "deficit" && (
              <div className="mx-4 mb-4 rounded-lg border border-rose-400/50 bg-rose-50/10 p-3">
                <p className="text-xs font-medium text-rose-600">
                  ⚠ This fund is projected to go into deficit. Consider
                  reviewing the levy schedule or deferring planned expenditure.
                </p>
              </div>
            )}
          </Card>
        );
      })}

      {/* Assumptions note */}
      <div className="rounded-lg border border-border p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground text-sm">
          Projection assumptions
        </p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>
            Projections assume current levy schedules and budget allocations
            remain unchanged across future financial years.
          </li>
          <li>
            Annual levy income is sourced from active levy schedules. Where no
            schedule exists, budget income is used as the estimate.
          </li>
          <li>
            Annual expenses are based on the current financial year budget.
            Inflation and fee increases are not factored in.
          </li>
          <li>
            Capital works funds may accumulate over multiple years to fund
            planned major works. Review the capital works plan alongside these
            projections.
          </li>
          <li>
            These projections are indicative only and should be reviewed with the
            scheme&apos;s accountant before making financial decisions.
          </li>
        </ul>
      </div>
    </div>
  );
}
