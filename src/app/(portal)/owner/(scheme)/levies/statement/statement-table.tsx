"use client";

import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { SelectField, FormField } from "@/components/ui/form-field";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";

interface StatementLine {
  id: string;
  date: string;
  type: string;
  description: string;
  charge: number;
  payment: number;
  balance: number;
}

function formatCurrency(value: number): string {
  if (value < 0) {
    return `($${Math.abs(value).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
  }
  return `$${value.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-AU");
}

export function OwnerStatementTable({
  lotOptions,
  selectedLotId,
  selectedLotLabel,
  startDate,
  endDate,
  openingBalance,
  totalCharges,
  totalPayments,
  closingBalance,
  statementLines,
}: {
  lotOptions: { id: string; label: string }[];
  selectedLotId: string;
  selectedLotLabel: string;
  startDate: string;
  endDate: string;
  openingBalance: number;
  totalCharges: number;
  totalPayments: number;
  closingBalance: number;
  statementLines: StatementLine[];
}) {
  const router = useRouter();

  function applyFilters(updates: Record<string, string>) {
    const params = new URLSearchParams();
    const current = { lot: selectedLotId, startDate, endDate, ...updates };
    if (current.lot) params.set("lot", current.lot);
    if (current.startDate) params.set("startDate", current.startDate);
    if (current.endDate) params.set("endDate", current.endDate);
    const qs = params.toString();
    router.push(`/owner/levies/statement${qs ? `?${qs}` : ""}`);
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      {lotOptions.length > 1 && (
        <Card>
          <CardHeader title="Select Lot" />
          <div className="px-6 pb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SelectField
              label="Lot"
              name="lot"
              required
              value={selectedLotId}
              onChange={(e) => applyFilters({ lot: e.target.value })}
              options={[
                { value: "", label: "Select a lot..." },
                ...lotOptions.map((l) => ({ value: l.id, label: l.label })),
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
      )}

      {/* Date filters for single lot */}
      {lotOptions.length === 1 && (
        <Card>
          <CardHeader title="Filter by Date" />
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
      )}

      {selectedLotId && statementLines.length === 0 && (
        <EmptyState
          title="No transactions"
          description="There are no levy notices or payments for this lot in the selected period."
        />
      )}

      {selectedLotId && statementLines.length > 0 && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard
              label="Opening Balance"
              value={formatCurrency(openingBalance)}
              accent="bg-zinc-400"
            />
            <StatCard
              label="Total Charges"
              value={formatCurrency(totalCharges)}
              accent="bg-blue-500"
            />
            <StatCard
              label="Total Payments"
              value={formatCurrency(totalPayments)}
              accent="bg-green-500"
            />
            <StatCard
              label={closingBalance < 0 ? "In Credit" : "Closing Balance"}
              value={formatCurrency(Math.abs(closingBalance))}
              accent={closingBalance > 0 ? "bg-red-500" : "bg-green-500"}
            />
          </div>

          {/* Statement table */}
          <Card>
            <CardHeader
              title={`Statement — ${selectedLotLabel}`}
              description={
                startDate || endDate
                  ? `Period: ${startDate || "Start"} to ${endDate || "Present"}`
                  : "All periods"
              }
            />

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-xs text-ink-muted uppercase tracking-wide">
                    <th scope="col" className="text-left px-6 py-2">Date</th>
                    <th scope="col" className="text-left px-4 py-2">Type</th>
                    <th scope="col" className="text-left px-4 py-2">Description</th>
                    <th scope="col" className="text-right px-4 py-2">Charges</th>
                    <th scope="col" className="text-right px-4 py-2">Payments</th>
                    <th scope="col" className="text-right px-6 py-2">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Opening balance row */}
                  <tr className="border-b border-line/50 bg-muted/20">
                    <td className="px-6 py-2 text-ink-muted" />
                    <td className="px-4 py-2 text-ink-muted" />
                    <td className="px-4 py-2 font-medium text-ink">
                      Opening Balance
                    </td>
                    <td className="px-4 py-2 text-right" />
                    <td className="px-4 py-2 text-right" />
                    <td className="px-6 py-2 text-right tabular-nums font-medium text-ink">
                      {formatCurrency(openingBalance)}
                    </td>
                  </tr>

                  {statementLines.map((line) => (
                    <tr
                      key={line.id}
                      className="border-b border-line/50"
                    >
                      <td className="px-6 py-2 text-ink-muted whitespace-nowrap">
                        {formatDate(line.date)}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            line.type === "Payment"
                              ? "bg-green-100 text-green-700"
                              : line.type === "Interest"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {line.type}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-ink">
                        {line.description}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-ink">
                        {line.charge > 0 ? formatCurrency(line.charge) : ""}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-green-600">
                        {line.payment > 0 ? formatCurrency(line.payment) : ""}
                      </td>
                      <td
                        className={`px-6 py-2 text-right tabular-nums font-medium ${
                          line.balance > 0 ? "text-red-600" : "text-ink"
                        }`}
                      >
                        {formatCurrency(line.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-line font-semibold">
                    <td className="px-6 py-3 text-ink" colSpan={3}>
                      Closing Balance
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink">
                      {formatCurrency(totalCharges)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-green-600">
                      {formatCurrency(totalPayments)}
                    </td>
                    <td
                      className={`px-6 py-3 text-right tabular-nums ${
                        closingBalance > 0 ? "text-red-600" : "text-ink"
                      }`}
                    >
                      {formatCurrency(closingBalance)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </>
      )}

      {!selectedLotId && lotOptions.length > 1 && (
        <EmptyState
          title="Select a lot"
          description="Choose a lot above to view your levy statement."
        />
      )}
    </div>
  );
}
