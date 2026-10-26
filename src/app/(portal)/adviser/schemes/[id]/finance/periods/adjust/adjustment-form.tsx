"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createAdjustmentEntryAction } from "../../actions";
import { fundImbalances } from "@/lib/finance/fund-balance-check";

type Account = {
  id: string;
  code: string;
  name: string;
  accountType: string;
};

type Fund = {
  id: string;
  name: string;
  fundType: string;
};

type JournalLine = {
  key: number;
  accountCodeId: string;
  fundId: string;
  debit: string;
  credit: string;
  description: string;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(value);
}

const inputClasses =
  "w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise transition-colors";

let lineCounter = 2;

export function AdjustmentForm({
  schemeId,
  periodStartDate,
  periodEndDate,
  accounts,
  funds,
}: {
  schemeId: string;
  periodStartDate: string;
  periodEndDate: string;
  accounts: Account[];
  funds: Fund[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [transactionDate, setTransactionDate] = useState(periodEndDate);
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<JournalLine[]>([
    { key: 0, accountCodeId: "", fundId: funds[0]?.id ?? "", debit: "", credit: "", description: "" },
    { key: 1, accountCodeId: "", fundId: funds[0]?.id ?? "", debit: "", credit: "", description: "" },
  ]);

  const totalDebits = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredits = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  // Each fund must balance on its own (financials review B1, 26 Oct 2026).
  const fundGaps = fundImbalances(lines, funds.map((f) => ({ value: f.id, label: f.name })));
  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.005 && totalDebits > 0 && fundGaps.length === 0;

  const accountOptions = [
    { value: "", label: "Select account..." },
    ...accounts.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` })),
  ];

  const fundOptions = funds.map((f) => ({ value: f.id, label: f.name }));

  function addLine() {
    setLines((prev) => [
      ...prev,
      { key: lineCounter++, accountCodeId: "", fundId: funds[0]?.id ?? "", debit: "", credit: "", description: "" },
    ]);
  }

  function removeLine(key: number) {
    if (lines.length <= 2) return;
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function updateLine(key: number, field: keyof JournalLine, value: string) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, [field]: value } : l)),
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!description.trim()) {
      setError("Description is required.");
      return;
    }

    const hasEmptyAccount = lines.some((l) => !l.accountCodeId);
    if (hasEmptyAccount) {
      setError("All lines must have an account selected.");
      return;
    }

    if (!isBalanced) {
      setError(
        fundGaps.length
          ? `${fundGaps.map((g) => `${g.label} is out of balance by $${g.gap.toFixed(2)}`).join("; ")}. Each fund must balance on its own.`
          : "Debits and credits must be equal and greater than zero.",
      );
      return;
    }

    startTransition(async () => {
      const result = await createAdjustmentEntryAction(schemeId, {
        transactionDate,
        description: description.trim(),
        lines: lines.map((l) => ({
          accountCodeId: l.accountCodeId,
          fundId: l.fundId,
          debit: parseFloat(l.debit) || undefined,
          credit: parseFloat(l.credit) || undefined,
          description: l.description || undefined,
        })),
      });

      if (result.error) {
        setError(result.error);
      } else {
        router.push(`/adviser/schemes/${schemeId}/finance/periods`);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl space-y-6">
      {error && (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Header fields */}
      <Card>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="transactionDate"
                className="block text-sm font-medium text-ink mb-1.5"
              >
                Transaction Date
              </label>
              <input
                id="transactionDate"
                type="date"
                value={transactionDate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setTransactionDate(e.target.value)
                }
                min={periodStartDate}
                max={periodEndDate}
                required
                className={inputClasses}
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="description"
              className="block text-sm font-medium text-ink mb-1.5"
            >
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setDescription(e.target.value)
              }
              placeholder="Reason for adjustment (e.g. Year-end accrual correction)"
              rows={2}
              required
              className={inputClasses}
            />
          </div>
        </div>
      </Card>

      {/* Journal lines */}
      <Card>
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">
              Journal Lines
            </h3>
            <Button type="button" variant="ghost" onClick={addLine}>
              + Add Line
            </Button>
          </div>

          {/* Column headers */}
          <div className="hidden sm:grid sm:grid-cols-[3fr_2fr_1.5fr_1.5fr_auto] gap-2 px-1">
            <span className="text-xs font-medium text-ink-muted">Account</span>
            <span className="text-xs font-medium text-ink-muted">Fund</span>
            <span className="text-xs font-medium text-ink-muted">Debit ($)</span>
            <span className="text-xs font-medium text-ink-muted">Credit ($)</span>
            <span className="w-9" />
          </div>

          {/* Line rows */}
          {lines.map((line) => (
            <div
              key={line.key}
              className="grid grid-cols-1 sm:grid-cols-[3fr_2fr_1.5fr_1.5fr_auto] gap-2 items-start"
            >
              <div>
                <label className="sm:hidden block text-xs font-medium text-ink-muted mb-1">
                  Account
                </label>
                <select
                  value={line.accountCodeId}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    updateLine(line.key, "accountCodeId", e.target.value)
                  }
                  required
                  className={inputClasses}
                >
                  {accountOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="sm:hidden block text-xs font-medium text-ink-muted mb-1">
                  Fund
                </label>
                <select
                  value={line.fundId}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    updateLine(line.key, "fundId", e.target.value)
                  }
                  required
                  className={inputClasses}
                >
                  {fundOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="sm:hidden block text-xs font-medium text-ink-muted mb-1">
                  Debit ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={line.debit}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    updateLine(line.key, "debit", e.target.value)
                  }
                  placeholder="0.00"
                  className={inputClasses}
                />
              </div>

              <div>
                <label className="sm:hidden block text-xs font-medium text-ink-muted mb-1">
                  Credit ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={line.credit}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    updateLine(line.key, "credit", e.target.value)
                  }
                  placeholder="0.00"
                  className={inputClasses}
                />
              </div>

              <div className="flex items-center sm:pt-0 pt-1">
                <button
                  type="button"
                  onClick={() => removeLine(line.key)}
                  disabled={lines.length <= 2}
                  className="inline-flex items-center justify-center w-9 h-9 rounded-[var(--radius-card)] text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                  title="Remove line"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  >
                    <path d="M4 8h8" />
                  </svg>
                </button>
              </div>
            </div>
          ))}

          {/* Balance summary */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm pt-4 border-t border-line">
            <div className="flex gap-6">
              <span className="text-ink">
                Total Debits: <strong>{formatCurrency(totalDebits)}</strong>
              </span>
              <span className="text-ink">
                Total Credits: <strong>{formatCurrency(totalCredits)}</strong>
              </span>
            </div>
            <span className={isBalanced ? "text-green-600" : "text-red-500"}>
              {isBalanced
                ? "Balanced in each fund"
                : totalDebits === 0 && totalCredits === 0
                  ? "Enter the debits and credits"
                  : Math.abs(totalDebits - totalCredits) >= 0.005
                    ? `Out of balance by ${formatCurrency(Math.abs(totalDebits - totalCredits))}`
                    : `${fundGaps.map((g) => `${g.label} out of balance by ${formatCurrency(g.gap)}`).join("; ")}. Each fund must balance on its own.`}
            </span>
          </div>
        </div>
      </Card>

      {/* Submit */}
      <div className="flex items-center justify-end gap-3">
        <Button
          variant="ghost"
          href={`/adviser/schemes/${schemeId}/finance/periods`}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          type="submit"
          disabled={isPending || !isBalanced}
        >
          {isPending ? "Posting..." : "Post Adjustment"}
        </Button>
      </div>
    </form>
  );
}
