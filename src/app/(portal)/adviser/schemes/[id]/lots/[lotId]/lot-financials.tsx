"use client";

import { useState, useMemo } from "react";
import { STATUS_LABELS, STATUS_STYLES } from "@/lib/levies/levy-ledger";
import type { PackWords } from "@/lib/jurisdiction/screen-words";

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
  interest: number;
};

function formatCurrency(value: number) {
  return value.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  });
}

function formatDate(dateStr: string, timeZone: string) {
  // A fixed time zone, so the server and the browser show the same day (React error 418).
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone,
  });
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? "bg-muted text-ink-muted"}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function LotFinancials({
  financials,
  levyHistory,
  timeZone,
  words: w,
}: {
  financials: Financials;
  levyHistory: LevyHistoryItem[];
  /** The building's time zone. */
  timeZone: string;
  /** The building's words (packWordsFor). */
  words: Pick<PackWords, "levy" | "Levy" | "Levies" | "LateCharge">;
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
        <SummaryCard label="Brought forward" value={financials.opening} />
        <SummaryCard label={`+${w.Levies}`} value={financials.annual} />
        <SummaryCard label="+Special" value={financials.special} />
        <SummaryCard label={`+${w.LateCharge} charged`} value={financials.interest} />
        <SummaryCard label="−Paid" value={financials.paid} variant="green" />
        <SummaryCard label="=Owing" value={financials.closing} variant="bold" />
      </div>

      {/* Levy history */}
      <div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
          <h3 className="font-heading font-semibold text-ink">
            {w.Levy} History
          </h3>
          <div className="flex rounded-[var(--radius-card)] border border-line overflow-hidden">
            {(["ALL", "ORDINARY", "SPECIAL"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setFilterType(type)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  filterType === type
                    ? "bg-turquoise text-white"
                    : "bg-white text-ink-muted hover:text-ink hover:bg-muted"
                }`}
              >
                {type === "ALL" ? "All" : type === "ORDINARY" ? "Annual" : "Special"}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-line px-4 py-8 text-center text-sm text-ink-muted">
            No {w.levy} items recorded for this lot.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th scope="col" className="px-3 py-2.5 text-left font-medium text-ink-muted whitespace-nowrap">
                    {w.Levy}
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium text-ink-muted whitespace-nowrap">
                    Type
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium text-ink-muted whitespace-nowrap">
                    Due Date
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium text-ink-muted whitespace-nowrap">
                    Amount
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium text-ink-muted whitespace-nowrap">
                    Paid
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium text-ink-muted whitespace-nowrap">
                    Outstanding
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium text-ink-muted whitespace-nowrap">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium text-ink-muted whitespace-nowrap">
                    Paid Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr
                    key={item.id}
                    className="border-t border-line hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-3 py-2.5 font-medium text-ink">
                      {item.levyTitle}
                    </td>
                    <td className="px-3 py-2.5 text-ink-muted">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        item.levyType === "ORDINARY"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-purple-100 text-purple-700"
                      }`}>
                        {item.levyType === "ORDINARY" ? "Annual" : item.levyType === "BROUGHT_FORWARD" ? "Brought forward" : "Special"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-ink-muted tabular-nums">
                      {formatDate(item.dueDate, timeZone)}
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
                    <td className="px-3 py-2.5 text-ink-muted tabular-nums">
                      {item.paidAt ? formatDate(item.paidAt, timeZone) : "—"}
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
    <div className="rounded-[var(--radius-card)] border border-line bg-white p-3">
      <p className="text-xs text-ink-muted mb-1">{label}</p>
      <p
        className={`text-sm tabular-nums ${
          variant === "green"
            ? "text-green-600 font-medium"
            : variant === "bold"
              ? "text-ink font-semibold"
              : "text-ink"
        }`}
      >
        {formatCurrency(value)}
      </p>
    </div>
  );
}
