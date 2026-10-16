"use client";

import { useState, useMemo } from "react";

type LevyHistoryItem = {
  id: string;
  levyTitle: string;
  levyType: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  status: string;
  paidAt: string | null;
};

type Financials = {
  opening: number;
  annual: number;
  special: number;
  paid: number;
  closing: number;
  interestPaid: number;
};

function formatCurrency(value: number) {
  return value.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  });
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function StatusBadge({ status }: { status: string }) {
  const colours: Record<string, string> = {
    PAID: "bg-green-100 text-green-700",
    PARTIAL: "bg-amber-100 text-amber-700",
    UNPAID: "bg-red-100 text-red-700",
    OVERDUE: "bg-red-100 text-red-700",
  };
  const cls = colours[status] ?? "bg-muted text-muted-foreground";
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

export function LotFinancials({
  financials,
  levyHistory,
}: {
  financials: Financials;
  levyHistory: LevyHistoryItem[];
}) {
  const [filterType, setFilterType] = useState<"ALL" | "ORDINARY" | "SPECIAL">("ALL");

  const filtered = useMemo(() => {
    if (filterType === "ALL") return levyHistory;
    return levyHistory.filter((item) => item.levyType === filterType);
  }, [levyHistory, filterType]);

  return (
    <div className="space-y-6">
      {/* Financial summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryCard label="Opening" value={financials.opening} />
        <SummaryCard label="+Annual" value={financials.annual} />
        <SummaryCard label="+Special" value={financials.special} />
        <SummaryCard label="~Paid" value={financials.paid} variant="green" />
        <SummaryCard label="~Closing" value={financials.closing} variant="bold" />
        <SummaryCard label="Interest Paid" value={financials.interestPaid} />
      </div>

      {/* Levy history */}
      <div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
          <h3 className="font-heading font-semibold text-foreground">
            Levy History
          </h3>
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(["ALL", "ORDINARY", "SPECIAL"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setFilterType(type)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  filterType === type
                    ? "bg-primary-400 text-white"
                    : "bg-background text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {type === "ALL" ? "All" : type === "ORDINARY" ? "Annual" : "Special"}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-lg border border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No levy items recorded for this lot.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                    Levy
                  </th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                    Type
                  </th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                    Due Date
                  </th>
                  <th className="px-3 py-2.5 text-right font-medium text-muted-foreground whitespace-nowrap">
                    Amount
                  </th>
                  <th className="px-3 py-2.5 text-right font-medium text-muted-foreground whitespace-nowrap">
                    Paid
                  </th>
                  <th className="px-3 py-2.5 text-right font-medium text-muted-foreground whitespace-nowrap">
                    Outstanding
                  </th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                    Status
                  </th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                    Paid Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr
                    key={item.id}
                    className="border-t border-border hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-3 py-2.5 font-medium text-foreground">
                      {item.levyTitle}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        item.levyType === "ORDINARY"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-purple-100 text-purple-700"
                      }`}>
                        {item.levyType === "ORDINARY" ? "Annual" : "Special"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground tabular-nums">
                      {formatDate(item.dueDate)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatCurrency(item.amount)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-green-600">
                      {formatCurrency(item.paidAmount)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                      {formatCurrency(item.amount - item.paidAmount)}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground tabular-nums">
                      {item.paidAt ? formatDate(item.paidAt) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant?: "green" | "bold";
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p
        className={`text-sm tabular-nums ${
          variant === "green"
            ? "text-green-600 font-medium"
            : variant === "bold"
              ? "text-foreground font-semibold"
              : "text-foreground"
        }`}
      >
        {formatCurrency(value)}
      </p>
    </div>
  );
}
