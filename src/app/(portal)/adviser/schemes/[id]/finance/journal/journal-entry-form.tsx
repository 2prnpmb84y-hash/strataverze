"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createJournalEntryAction } from "../actions";
import {
  FormField,
  SelectField,
} from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { fundImbalances } from "@/lib/finance/fund-balance-check";

interface JournalLine {
  accountCodeId: string;
  fundId: string;
  debit: string;
  credit: string;
  description: string;
}

interface Props {
  schemeId: string;
  accountCodes: { value: string; label: string }[];
  funds: { value: string; label: string }[];
  /** The building's word for a levy (packWordsFor). */
  levy: string;
}

const emptyLine = (): JournalLine => ({
  accountCodeId: "",
  fundId: "",
  debit: "",
  credit: "",
  description: "",
});

const inputClasses =
  "w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise transition-colors";

export function JournalEntryForm({ schemeId, accountCodes, funds, levy }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [lines, setLines] = useState<JournalLine[]>([
    emptyLine(),
    emptyLine(),
  ]);

  function addLine() {
    setLines([...lines, emptyLine()]);
  }

  function removeLine(index: number) {
    if (lines.length <= 2) return;
    setLines(lines.filter((_, i) => i !== index));
  }

  function updateLine(index: number, field: keyof JournalLine, value: string) {
    const updated = [...lines];
    updated[index] = { ...updated[index], [field]: value };
    setLines(updated);
  }

  const totalDebits = lines.reduce(
    (sum, l) => sum + (parseFloat(l.debit) || 0),
    0,
  );
  const totalCredits = lines.reduce(
    (sum, l) => sum + (parseFloat(l.credit) || 0),
    0,
  );
  // Each fund must balance on its own: a journal cannot move money between
  // funds (financials review B1, 26 Oct 2026).
  const fundGaps = fundImbalances(lines, funds);
  const isBalanced =
    Math.abs(totalDebits - totalCredits) < 0.01 && totalDebits > 0 && fundGaps.length === 0;

  const entryTypeOptions = [
    { value: "MANUAL", label: "Manual Entry" },
    { value: "ADJUSTMENT", label: "Adjustment" },
    { value: "CLOSING", label: "Closing Entry" },
  ];

  const accountCodeOptions = [
    { value: "", label: "Select account..." },
    ...accountCodes,
  ];

  const fundOptions = [{ value: "", label: "Select fund..." }, ...funds];

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(undefined);

    const form = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await createJournalEntryAction(schemeId, {
        transactionDate: form.get("transactionDate") as string,
        description: (form.get("description") as string)?.trim(),
        entryType: (form.get("entryType") as string) || "MANUAL",
        sourceType: "MANUAL",
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
        return;
      }
      if (result.success) {
        router.push(`/adviser/schemes/${schemeId}/finance/journal`);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl space-y-8">
      {/* Error banner */}
      {error && (
        <div className="rounded-[var(--radius-card)] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Header fields */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            label="Transaction Date"
            name="transactionDate"
            type="date"
            required
          />
          <SelectField
            label="Entry Type"
            name="entryType"
            options={entryTypeOptions}
            defaultValue="MANUAL"
          />
        </div>
        <FormField
          label="Description"
          name="description"
          required
          placeholder={`e.g. Monthly ${levy} receipts`}
        />
      </div>

      {/* Journal lines */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">
            Journal Lines
          </h2>
          <Button type="button" variant="ghost" onClick={addLine}>
            + Add Line
          </Button>
        </div>

        {/* Column headers */}
        <div className="hidden sm:grid sm:grid-cols-[3fr_2fr_1.5fr_1.5fr_1.5fr_auto] gap-2 px-1">
          <span className="text-xs font-medium text-ink-muted">
            Account Code
          </span>
          <span className="text-xs font-medium text-ink-muted">
            Fund
          </span>
          <span className="text-xs font-medium text-ink-muted">
            Debit ($)
          </span>
          <span className="text-xs font-medium text-ink-muted">
            Credit ($)
          </span>
          <span className="text-xs font-medium text-ink-muted">
            Description
          </span>
          <span className="w-9" />
        </div>

        {/* Line rows */}
        {lines.map((line, index) => (
          <div
            key={index}
            className="grid grid-cols-1 sm:grid-cols-[3fr_2fr_1.5fr_1.5fr_1.5fr_auto] gap-2 items-start"
          >
            <div>
              <label className="sm:hidden block text-xs font-medium text-ink-muted mb-1">
                Account Code
              </label>
              <select
                value={line.accountCodeId}
                onChange={(e) =>
                  updateLine(index, "accountCodeId", e.target.value)
                }
                required
                className={inputClasses}
              >
                {accountCodeOptions.map((opt) => (
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
                onChange={(e) => updateLine(index, "fundId", e.target.value)}
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
                onChange={(e) => updateLine(index, "debit", e.target.value)}
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
                onChange={(e) => updateLine(index, "credit", e.target.value)}
                placeholder="0.00"
                className={inputClasses}
              />
            </div>

            <div>
              <label className="sm:hidden block text-xs font-medium text-ink-muted mb-1">
                Description
              </label>
              <input
                type="text"
                value={line.description}
                onChange={(e) =>
                  updateLine(index, "description", e.target.value)
                }
                placeholder="Line note"
                className={inputClasses}
              />
            </div>

            <div className="flex items-center sm:pt-0 pt-1">
              <button
                type="button"
                onClick={() => removeLine(index)}
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
              Total Debits: <strong>${totalDebits.toFixed(2)}</strong>
            </span>
            <span className="text-ink">
              Total Credits: <strong>${totalCredits.toFixed(2)}</strong>
            </span>
          </div>
          <span
            className={isBalanced ? "text-green-600" : "text-red-500"}
          >
            {isBalanced
              ? "Balanced in each fund"
              : totalDebits === 0 && totalCredits === 0
                ? "Enter the debits and credits"
                : Math.abs(totalDebits - totalCredits) >= 0.01
                  ? `Out of balance by $${Math.abs(totalDebits - totalCredits).toFixed(2)}`
                  : fundGaps.map((g) => `${g.label} out of balance by $${g.gap.toFixed(2)}`).join("; ") +
                    ". Each fund must balance on its own."}
          </span>
        </div>
      </div>

      {/* Submit */}
      <div className="flex justify-end pt-4">
        <Button type="submit" disabled={!isBalanced || isPending}>
          {isPending ? "Creating..." : "Create Journal Entry"}
        </Button>
      </div>
    </form>
  );
}
