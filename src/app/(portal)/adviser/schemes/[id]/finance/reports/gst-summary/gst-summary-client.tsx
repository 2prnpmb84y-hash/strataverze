"use client";

import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import type { GstSummaryReport } from "@/lib/queries/reports";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

interface Props {
  schemeId: string;
  startDate: string;
  endDate: string;
  quarters: { start: string; end: string; label: string }[];
  report: GstSummaryReport;
  basePath?: string;
}

export function GstSummaryClient({
  schemeId,
  startDate,
  endDate,
  quarters,
  report,
  basePath,
}: Props) {
  const router = useRouter();
  const reportBase = basePath ?? `/adviser/schemes/${schemeId}/finance/reports`;

  const inputClasses =
    "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 transition-colors";

  function applyQuarter(value: string) {
    const [qs, qe] = value.split("|");
    const params = new URLSearchParams();
    params.set("startDate", qs);
    params.set("endDate", qe);
    router.push(
      `${reportBase}/gst-summary?${params.toString()}`,
    );
  }

  const currentQuarterValue = `${startDate}|${endDate}`;

  return (
    <div className="space-y-6">
      {/* GST registration status */}
      {!report.abnOrGstRegistered && (
        <div className="rounded-lg border border-amber-400/50 bg-amber-50/10 p-4">
          <p className="text-sm text-amber-600">
            This scheme is not marked as GST-registered. BAS lodgement may not
            be required. Check with the scheme&apos;s accountant.
          </p>
        </div>
      )}

      {/* Quarter selector */}
      <Card>
        <div className="p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <label
              htmlFor="quarter-select"
              className="text-sm font-medium text-foreground whitespace-nowrap"
            >
              BAS period
            </label>
            <select
              id="quarter-select"
              className={inputClasses + " max-w-[240px]"}
              value={currentQuarterValue}
              onChange={(e) => applyQuarter(e.target.value)}
            >
              {quarters.map((q) => (
                <option key={q.start} value={`${q.start}|${q.end}`}>
                  {q.label}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">
              {report.periodLabel}
            </span>
          </div>
        </div>
      </Card>

      {/* Key metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="GST on Sales (1A)"
          value={formatCurrency(report.g9GrossGstOnSales)}
          accent="bg-rose-500"
        />
        <StatCard
          label="GST on Purchases (1B)"
          value={formatCurrency(report.g20GstOnPurchases)}
          accent="bg-emerald-500"
        />
        <StatCard
          label="Net GST Payable"
          value={formatCurrency(report.netGstPayable)}
          accent={report.netGstPayable >= 0 ? "bg-rose-500" : "bg-emerald-500"}
        />
      </div>

      {/* BAS Labels Summary */}
      <Card>
        <CardHeader
          title="BAS Summary"
          description="Amounts for Business Activity Statement preparation"
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 font-medium text-muted-foreground w-16">
                  Label
                </th>
                <th className="px-4 py-3 font-medium text-muted-foreground">
                  Description
                </th>
                <th className="px-4 py-3 font-medium text-muted-foreground text-right">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Sales section */}
              <tr className="bg-card/30">
                <td
                  colSpan={3}
                  className="px-4 py-2 font-semibold text-foreground text-xs uppercase tracking-wider"
                >
                  GST on Sales
                </td>
              </tr>
              <BASRow label="G1" desc="Total sales (including any GST)" amount={report.g1TotalSales} />
              <BASRow label="G2" desc="Export sales" amount={report.g2ExportSales} />
              <BASRow label="G3" desc="Other GST-free sales" amount={report.g3OtherGstFreeSales} />
              <BASRow label="G4" desc="Input taxed sales" amount={report.g4InputTaxedSales} />
              <BASRow
                label="G9"
                desc="GST on sales"
                amount={report.g9GrossGstOnSales}
                highlight
              />

              {/* Purchases section */}
              <tr className="bg-card/30">
                <td
                  colSpan={3}
                  className="px-4 py-2 font-semibold text-foreground text-xs uppercase tracking-wider"
                >
                  GST on Purchases
                </td>
              </tr>
              <BASRow
                label="G10"
                desc="Capital purchases (including any GST)"
                amount={report.g10CapitalPurchases}
              />
              <BASRow
                label="G11"
                desc="Non-capital purchases (including any GST)"
                amount={report.g11NonCapitalPurchases}
              />
              <BASRow label="G14" desc="Purchases for export (no GST)" amount={report.g14ExportPurchases} />
              <BASRow
                label="G15"
                desc="Purchases for input taxed sales (no GST credit)"
                amount={report.g15PurchasesForInputTaxedSales}
              />
              <BASRow
                label="G20"
                desc="GST on purchases"
                amount={report.g20GstOnPurchases}
                highlight
              />

              {/* Net */}
              <tr className="bg-card/50 font-semibold border-t-2 border-border">
                <td className="px-4 py-3 text-foreground" />
                <td className="px-4 py-3 text-foreground">
                  Net GST payable (G9 minus G20)
                </td>
                <td
                  className={`px-4 py-3 text-right ${
                    report.netGstPayable >= 0
                      ? "text-rose-600"
                      : "text-emerald-600"
                  }`}
                >
                  {formatCurrency(report.netGstPayable)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Income detail */}
      {report.incomeLines.length > 0 && (
        <Card>
          <CardHeader
            title="Income Detail"
            description="Breakdown of income by account with GST"
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 font-medium text-muted-foreground">
                    Account
                  </th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-right">
                    Net Amount
                  </th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-right">
                    GST
                  </th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-right">
                    Gross
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.incomeLines.map((line) => (
                  <tr
                    key={line.accountCode}
                    className="border-b border-border hover:bg-card/30 transition-colors"
                  >
                    <td className="px-4 py-3 text-foreground">
                      <span className="font-mono text-xs text-muted-foreground mr-2">
                        {line.accountCode}
                      </span>
                      {line.accountName}
                    </td>
                    <td className="px-4 py-3 text-right text-foreground">
                      {formatCurrency(line.netAmount)}
                    </td>
                    <td className="px-4 py-3 text-right text-foreground">
                      {formatCurrency(line.gstAmount)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-foreground">
                      {formatCurrency(line.grossAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Expense detail */}
      {report.expenseLines.length > 0 && (
        <Card>
          <CardHeader
            title="Expense Detail"
            description="Breakdown of expenses by account with GST"
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 font-medium text-muted-foreground">
                    Account
                  </th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-right">
                    Net Amount
                  </th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-right">
                    GST
                  </th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-right">
                    Gross
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.expenseLines.map((line) => (
                  <tr
                    key={line.accountCode}
                    className="border-b border-border hover:bg-card/30 transition-colors"
                  >
                    <td className="px-4 py-3 text-foreground">
                      <span className="font-mono text-xs text-muted-foreground mr-2">
                        {line.accountCode}
                      </span>
                      {line.accountName}
                    </td>
                    <td className="px-4 py-3 text-right text-foreground">
                      {formatCurrency(line.netAmount)}
                    </td>
                    <td className="px-4 py-3 text-right text-foreground">
                      {formatCurrency(line.gstAmount)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-foreground">
                      {formatCurrency(line.grossAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Notes */}
      <div className="rounded-lg border border-border p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground text-sm">Important notes</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>
            This report is a summary to assist with BAS preparation. It does not
            constitute tax advice.
          </li>
          <li>
            Amounts are derived from posted journal entries only. Draft or
            reversed entries are excluded.
          </li>
          <li>
            Capital purchases (G10) are not separately tracked. All purchases
            appear under non-capital (G11). Adjust manually if capital purchases
            apply.
          </li>
          <li>
            This report should be reviewed by the scheme&apos;s accountant
            before lodging the BAS with the ATO.
          </li>
          <li>
            Levy contributions from owners are generally not subject to GST.
            Income from other sources (e.g. common property rental) may attract
            GST if the OC is registered.
          </li>
        </ul>
      </div>
    </div>
  );
}

function BASRow({
  label,
  desc,
  amount,
  highlight,
}: {
  label: string;
  desc: string;
  amount: number;
  highlight?: boolean;
}) {
  return (
    <tr
      className={`border-b border-border ${highlight ? "bg-card/50 font-medium" : ""}`}
    >
      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
        {label}
      </td>
      <td className="px-4 py-2.5 text-foreground">{desc}</td>
      <td className="px-4 py-2.5 text-right text-foreground">
        {formatCurrency(amount)}
      </td>
    </tr>
  );
}
