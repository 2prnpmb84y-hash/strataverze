"use client";

import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { SelectField, FormField } from "@/components/ui/form-field";
import { EmptyState } from "@/components/ui/empty-state";

interface AccountLine {
  code: string;
  name: string;
  accountType: string;
  fundId: string | null;
  fundName: string;
  totalDebit: number;
  totalCredit: number;
  netAmount: number;
}

function formatCurrency(value: number): string {
  if (value < 0) {
    return `($${Math.abs(value).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
  }
  return `$${value.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function IncomeExpenditureClient({
  schemeId,
  funds,
  selectedFund,
  startDate,
  endDate,
  incomeAccounts,
  expenseAccounts,
  totalIncome,
  totalExpenses,
  netSurplus,
  basePath,
}: {
  schemeId: string;
  funds: { id: string; name: string }[];
  selectedFund: string;
  startDate: string;
  endDate: string;
  incomeAccounts: AccountLine[];
  expenseAccounts: AccountLine[];
  totalIncome: number;
  totalExpenses: number;
  netSurplus: number;
  basePath?: string;
}) {
  const router = useRouter();
  const reportBase = basePath ?? `/adviser/schemes/${schemeId}/finance/reports`;

  function applyFilters(updates: Record<string, string>) {
    const params = new URLSearchParams();
    const current = { fund: selectedFund, startDate, endDate, ...updates };
    if (current.fund) params.set("fund", current.fund);
    if (current.startDate) params.set("startDate", current.startDate);
    if (current.endDate) params.set("endDate", current.endDate);
    const qs = params.toString();
    router.push(
      `${reportBase}/income-expenditure${qs ? `?${qs}` : ""}`,
    );
  }

  const hasData = incomeAccounts.length > 0 || expenseAccounts.length > 0;

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader title="Report Filters" />
        <div className="px-6 pb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SelectField
            label="Fund"
            name="fund"
            value={selectedFund}
            onChange={(e) => applyFilters({ fund: e.target.value })}
            options={[
              { value: "", label: "All Funds" },
              ...funds.map((f) => ({ value: f.id, label: f.name })),
            ]}
          />
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

      {!hasData && (
        <EmptyState
          title="No data for selected period"
          description="There are no posted journal entries matching your filters. Adjust the date range or fund selection."
        />
      )}

      {hasData && (
        <Card>
          <CardHeader
            title="Income & Expenditure"
            description={
              startDate || endDate
                ? `${startDate || "Start"} to ${endDate || "Present"}`
                : "All periods"
            }
          />

          {/* Income section */}
          <div className="px-6">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-2">
              Income
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-left py-2 pr-4">Code</th>
                  <th className="text-left py-2 pr-4">Account</th>
                  <th className="text-left py-2 pr-4">Fund</th>
                  <th className="text-right py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {incomeAccounts
                  .filter((a) => Math.abs(a.netAmount) >= 0.01)
                  .map((a) => (
                    <tr
                      key={`${a.code}-${a.fundId}`}
                      className="border-b border-border/50"
                    >
                      <td className="py-2 pr-4 text-muted-foreground tabular-nums">
                        {a.code}
                      </td>
                      <td className="py-2 pr-4 text-foreground">{a.name}</td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {a.fundName}
                      </td>
                      <td className="py-2 text-right tabular-nums text-foreground">
                        {formatCurrency(a.netAmount)}
                      </td>
                    </tr>
                  ))}
                <tr className="border-t-2 border-border font-semibold">
                  <td colSpan={3} className="py-2 pr-4 text-foreground">
                    Total Income
                  </td>
                  <td className="py-2 text-right tabular-nums text-foreground">
                    {formatCurrency(totalIncome)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Expense section */}
          <div className="px-6 mt-6">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-2">
              Expenditure
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-left py-2 pr-4">Code</th>
                  <th className="text-left py-2 pr-4">Account</th>
                  <th className="text-left py-2 pr-4">Fund</th>
                  <th className="text-right py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {expenseAccounts
                  .filter((a) => Math.abs(a.netAmount) >= 0.01)
                  .map((a) => (
                    <tr
                      key={`${a.code}-${a.fundId}`}
                      className="border-b border-border/50"
                    >
                      <td className="py-2 pr-4 text-muted-foreground tabular-nums">
                        {a.code}
                      </td>
                      <td className="py-2 pr-4 text-foreground">{a.name}</td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {a.fundName}
                      </td>
                      <td className="py-2 text-right tabular-nums text-foreground">
                        {formatCurrency(a.netAmount)}
                      </td>
                    </tr>
                  ))}
                <tr className="border-t-2 border-border font-semibold">
                  <td colSpan={3} className="py-2 pr-4 text-foreground">
                    Total Expenditure
                  </td>
                  <td className="py-2 text-right tabular-nums text-foreground">
                    {formatCurrency(totalExpenses)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Net surplus/deficit */}
          <div className="px-6 py-4 mt-4 border-t-2 border-border">
            <div className="flex justify-between items-center">
              <span className="text-base font-bold text-foreground">
                Net {netSurplus >= 0 ? "Surplus" : "Deficit"}
              </span>
              <span
                className={`text-base font-bold tabular-nums ${
                  netSurplus >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {formatCurrency(netSurplus)}
              </span>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
