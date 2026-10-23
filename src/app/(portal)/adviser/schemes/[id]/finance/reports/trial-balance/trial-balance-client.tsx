"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { drillDownHref } from "@/lib/finance/drill-down";
import { Card, CardHeader } from "@/components/ui/card";
import { SelectField, FormField } from "@/components/ui/form-field";
import { EmptyState } from "@/components/ui/empty-state";

interface TrialBalanceLine {
  accountCodeId: string;
  fundId: string | null;
  accountCode: string;
  accountName: string;
  accountType: string;
  fundName: string;
  debitBalance: number;
  creditBalance: number;
}

function formatCurrency(value: number): string {
  if (value === 0) return "—";
  if (value < 0) {
    return `($${Math.abs(value).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
  }
  return `$${value.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function TrialBalanceClient({
  schemeId,
  funds,
  selectedFund,
  asAtDate,
  lines,
  totalDebits,
  totalCredits,
  isBalanced,
  basePath,
}: {
  schemeId: string;
  funds: { id: string; name: string }[];
  selectedFund: string;
  asAtDate: string;
  lines: TrialBalanceLine[];
  totalDebits: number;
  totalCredits: number;
  isBalanced: boolean;
  basePath?: string;
}) {
  const router = useRouter();
  const reportBase = basePath ?? `/adviser/schemes/${schemeId}/finance/reports`;

  function applyFilters(updates: Record<string, string>) {
    const params = new URLSearchParams();
    const current = { fund: selectedFund, asAtDate, ...updates };
    if (current.fund) params.set("fund", current.fund);
    if (current.asAtDate) params.set("asAtDate", current.asAtDate);
    const qs = params.toString();
    router.push(
      `${reportBase}/trial-balance${qs ? `?${qs}` : ""}`,
    );
  }

  const drill = (line: TrialBalanceLine) => drillDownHref(reportBase, { accountId: line.accountCodeId, fundId: line.fundId, end: asAtDate });

  // Group lines by account type for visual separation
  const assetLines = lines.filter((l) => l.accountType === "ASSET");
  const liabilityLines = lines.filter((l) => l.accountType === "LIABILITY");
  const equityLines = lines.filter((l) => l.accountType === "EQUITY");
  const incomeLines = lines.filter((l) => l.accountType === "INCOME");
  const expenseLines = lines.filter((l) => l.accountType === "EXPENSE");

  const sections = [
    { label: "Assets", items: assetLines },
    { label: "Liabilities", items: liabilityLines },
    { label: "Equity", items: equityLines },
    { label: "Income", items: incomeLines },
    { label: "Expenses", items: expenseLines },
  ].filter((s) => s.items.length > 0);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader title="Report Filters" />
        <div className="px-6 pb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            label="As at Date"
            name="asAtDate"
            type="date"
            value={asAtDate}
            onChange={(e) => applyFilters({ asAtDate: e.target.value })}
          />
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
        </div>
      </Card>

      {lines.length === 0 && (
        <EmptyState
          title="No data available"
          description="There are no posted journal entries for the selected date. Adjust the date or check that journal entries have been posted."
        />
      )}

      {lines.length > 0 && (
        <Card>
          <CardHeader
            title="Trial Balance"
            description={`As at ${asAtDate || "today"}`}
          />

          <div className="px-6 pb-6">
            {!isBalanced && (
              <div className="mb-4 rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3">
                <p className="text-sm font-medium text-red-800">
                  Warning: Trial balance is out of balance by{" "}
                  ${Math.abs(totalDebits - totalCredits).toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                </p>
              </div>
            )}

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-ink-muted uppercase tracking-wide">
                  <th scope="col" className="text-left py-2 pr-4">Code</th>
                  <th scope="col" className="text-left py-2 pr-4">Account</th>
                  <th scope="col" className="text-left py-2 pr-4">Fund</th>
                  <th scope="col" className="text-right py-2 pr-4">Debit</th>
                  <th scope="col" className="text-right py-2">Credit</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((section) => (
                  <SectionGroup
                    key={section.label}
                    label={section.label}
                    items={section.items} drill={drill} />
                ))}
                <tr className="border-t-2 border-line font-bold">
                  <td colSpan={3} className="py-3 pr-4 text-ink">
                    Totals
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums text-ink">
                    {formatCurrency(totalDebits)}
                  </td>
                  <td className="py-3 text-right tabular-nums text-ink">
                    {formatCurrency(totalCredits)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function SectionGroup({
  label,
  items,
  drill,
}: {
  label: string;
  items: TrialBalanceLine[];
  drill: (line: TrialBalanceLine) => string;
}) {
  return (
    <>
      <tr>
        <td
          colSpan={5}
          className="pt-4 pb-1 text-xs font-semibold text-ink-muted uppercase tracking-wide"
        >
          {label}
        </td>
      </tr>
      {items.map((line) => (
        <tr
          key={`${line.accountCode}-${line.fundName}`}
          className="border-b border-line/50"
        >
          <td className="py-2 pr-4 text-ink-muted tabular-nums">
            {line.accountCode}
          </td>
          <td className="py-2 pr-4 text-ink">{line.accountName}</td>
          <td className="py-2 pr-4 text-ink-muted">{line.fundName}</td>
          <td className="py-2 pr-4 text-right tabular-nums text-ink">
            {line.debitBalance ? (
              <Link href={drill(line)} className="text-turquoise underline" title="Show the journal entries behind this balance">
                {formatCurrency(line.debitBalance)}
              </Link>
            ) : (
              formatCurrency(line.debitBalance)
            )}
          </td>
          <td className="py-2 text-right tabular-nums text-ink">
            {line.creditBalance ? (
              <Link href={drill(line)} className="text-turquoise underline" title="Show the journal entries behind this balance">
                {formatCurrency(line.creditBalance)}
              </Link>
            ) : (
              formatCurrency(line.creditBalance)
            )}
          </td>
        </tr>
      ))}
    </>
  );
}
