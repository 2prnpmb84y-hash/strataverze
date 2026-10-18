"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormField, SelectField } from "@/components/ui/form-field";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  createBudgetLineAction,
  updateBudgetLineAction,
  deleteBudgetLineAction,
} from "../actions";

interface FundOption {
  id: string;
  name: string;
  fundType: string;
}

interface AccountCodeOption {
  id: string;
  code: string;
  name: string;
  accountType: string;
  fundId: string | null;
}

interface BudgetLineData {
  id: string;
  fundId: string;
  accountCodeId: string;
  financialYear: number;
  budgetAmount: number;
  notes: string | null;
  fundName: string;
}

interface BudgetVsActualData {
  lines: {
    budgetLineId: string;
    accountCodeId: string;
    accountCode: string;
    accountName: string;
    accountType: string;
    budgetAmount: number;
    actualAmount: number;
    variance: number;
    variancePercent: number;
    notes: string | null;
  }[];
  totalBudget: number;
  totalActual: number;
  totalVariance: number;
}

function formatCurrency(value: number): string {
  if (value < 0) {
    return `($${Math.abs(value).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
  }
  return `$${value.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function BudgetClient({
  schemeId,
  financialYear,
  funds,
  accountCodes,
  budgetLines,
  selectedFundId,
  budgetVsActual,
}: {
  schemeId: string;
  financialYear: number;
  funds: FundOption[];
  accountCodes: AccountCodeOption[];
  budgetLines: BudgetLineData[];
  selectedFundId: string;
  budgetVsActual: BudgetVsActualData | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state for adding new line
  const [newLine, setNewLine] = useState({
    fundId: selectedFundId,
    accountCodeId: "",
    budgetAmount: "",
    notes: "",
  });

  // Form state for editing
  const [editAmount, setEditAmount] = useState("");
  const [editNotes, setEditNotes] = useState("");

  // Build account code map
  const accountMap = new Map(accountCodes.map((ac) => [ac.id, ac]));

  // Filter account codes to expense and income types for budgeting
  const budgetableAccounts = accountCodes.filter(
    (ac) =>
      (ac.accountType === "EXPENSE" || ac.accountType === "INCOME") &&
      (!ac.fundId || ac.fundId === newLine.fundId),
  );

  // Already-budgeted account IDs for the selected fund
  const budgetedAccountIds = new Set(
    budgetLines
      .filter((bl) => bl.fundId === newLine.fundId)
      .map((bl) => bl.accountCodeId),
  );

  const availableAccounts = budgetableAccounts.filter(
    (ac) => !budgetedAccountIds.has(ac.id),
  );

  // Financial year options
  const yearOptions = [];
  const currentYear = new Date().getFullYear();
  for (let y = currentYear - 2; y <= currentYear + 2; y++) {
    yearOptions.push({ value: String(y), label: `FY ${y}/${y + 1}` });
  }

  function navigateToYear(year: string) {
    const params = new URLSearchParams();
    params.set("year", year);
    if (selectedFundId) params.set("fund", selectedFundId);
    router.push(`/adviser/schemes/${schemeId}/finance/budget?${params.toString()}`);
  }

  function navigateToFund(fundId: string) {
    const params = new URLSearchParams();
    params.set("year", String(financialYear));
    params.set("fund", fundId);
    router.push(`/adviser/schemes/${schemeId}/finance/budget?${params.toString()}`);
  }

  async function handleAdd() {
    if (!newLine.fundId || !newLine.accountCodeId || !newLine.budgetAmount) {
      setError("Please fill in all required fields.");
      return;
    }

    const amount = parseFloat(newLine.budgetAmount);
    if (isNaN(amount) || amount < 0) {
      setError("Budget amount must be a valid positive number.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await createBudgetLineAction(schemeId, {
        fundId: newLine.fundId,
        accountCodeId: newLine.accountCodeId,
        financialYear,
        budgetAmount: amount,
        notes: newLine.notes || undefined,
      });

      if (result.error) {
        setError(result.error);
      } else {
        setShowAddForm(false);
        setNewLine({ ...newLine, accountCodeId: "", budgetAmount: "", notes: "" });
        router.refresh();
      }
    });
  }

  async function handleUpdate(budgetLineId: string) {
    const amount = parseFloat(editAmount);
    if (isNaN(amount) || amount < 0) {
      setError("Budget amount must be a valid positive number.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await updateBudgetLineAction(schemeId, budgetLineId, {
        budgetAmount: amount,
        notes: editNotes || null,
      });

      if (result.error) {
        setError(result.error);
      } else {
        setEditingId(null);
        router.refresh();
      }
    });
  }

  async function handleDelete(budgetLineId: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteBudgetLineAction(schemeId, budgetLineId);
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  function startEdit(line: BudgetLineData) {
    setEditingId(line.id);
    setEditAmount(String(line.budgetAmount));
    setEditNotes(line.notes ?? "");
    setError(null);
  }

  // Lines for the selected fund
  const fundLines = budgetLines.filter((bl) => bl.fundId === selectedFundId);
  const totalBudget = fundLines.reduce((s, bl) => s + bl.budgetAmount, 0);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader title="Budget Settings" />
        <div className="px-6 pb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SelectField
            label="Financial Year"
            name="year"
            value={String(financialYear)}
            onChange={(e) => navigateToYear(e.target.value)}
            options={yearOptions}
          />
          <SelectField
            label="Fund"
            name="fund"
            value={selectedFundId}
            onChange={(e) => navigateToFund(e.target.value)}
            options={funds.map((f) => ({ value: f.id, label: f.name }))}
          />
        </div>
      </Card>

      {error && (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          label="Total Budget"
          value={formatCurrency(totalBudget)}
          accent="bg-blue-500"
        />
        <StatCard
          label="Budget Lines"
          value={String(fundLines.length)}
          accent="bg-emerald-500"
        />
        <StatCard
          label="Quarterly Levy"
          value={formatCurrency(totalBudget / 4)}
          accent="bg-violet-500"
        />
      </div>

      {/* Budget lines table */}
      <Card>
        <CardHeader
          title="Budget Lines"
          description={`FY ${financialYear}/${financialYear + 1} — ${funds.find((f) => f.id === selectedFundId)?.name ?? ""}`}
          action={
            <Button
              variant="primary"
              className="text-sm px-3 py-1.5"
              onClick={() => {
                setShowAddForm(!showAddForm);
                setError(null);
              }}
            >
              {showAddForm ? "Cancel" : "Add Line"}
            </Button>
          }
        />

        <div className="px-6 pb-6">
          {/* Add form */}
          {showAddForm && (
            <div className="mb-4 rounded-[var(--radius-card)] border border-line bg-muted/30 p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <SelectField
                  label="Account"
                  name="accountCodeId"
                  value={newLine.accountCodeId}
                  onChange={(e) =>
                    setNewLine({ ...newLine, accountCodeId: e.target.value })
                  }
                  options={[
                    { value: "", label: "Select account..." },
                    ...availableAccounts.map((ac) => ({
                      value: ac.id,
                      label: `${ac.code} — ${ac.name}`,
                    })),
                  ]}
                />
                <FormField
                  label="Budget Amount ($)"
                  name="budgetAmount"
                  type="number"
                  value={newLine.budgetAmount}
                  onChange={(e) =>
                    setNewLine({ ...newLine, budgetAmount: e.target.value })
                  }
                  placeholder="0.00"
                />
              </div>
              <FormField
                label="Notes (optional)"
                name="notes"
                value={newLine.notes}
                onChange={(e) =>
                  setNewLine({ ...newLine, notes: e.target.value })
                }
                placeholder="e.g. Based on last year plus 5% CPI"
              />
              <div className="flex justify-end">
                <Button
                  variant="primary"
                  className="text-sm px-3 py-1.5"
                  onClick={handleAdd}
                  disabled={isPending}
                >
                  {isPending ? "Saving..." : "Add Budget Line"}
                </Button>
              </div>
            </div>
          )}

          {fundLines.length === 0 && !showAddForm && (
            <EmptyState
              title="No budget lines"
              description="Add budget lines to set the annual budget for this fund. Budget amounts are used to calculate levy schedules."
            />
          )}

          {fundLines.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-ink-muted uppercase tracking-wide">
                  <th scope="col" className="text-left py-2 pr-4">Code</th>
                  <th scope="col" className="text-left py-2 pr-4">Account</th>
                  <th scope="col" className="text-right py-2 pr-4">Annual Budget</th>
                  <th scope="col" className="text-right py-2 pr-4">Quarterly</th>
                  <th scope="col" className="text-left py-2 pr-4">Notes</th>
                  <th scope="col" className="text-right py-2 w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {fundLines.map((line) => {
                  const account = accountMap.get(line.accountCodeId);
                  const isEditing = editingId === line.id;

                  if (isEditing) {
                    return (
                      <tr
                        key={line.id}
                        className="border-b border-line bg-muted/30"
                      >
                        <td className="py-2 pr-4 text-ink-muted tabular-nums">
                          {account?.code ?? "—"}
                        </td>
                        <td className="py-2 pr-4 text-ink">
                          {account?.name ?? "Unknown"}
                        </td>
                        <td className="py-2 pr-4">
                          <input
                            type="number"
                            value={editAmount}
                            onChange={(e) => setEditAmount(e.target.value)}
                            className="w-full rounded border border-line bg-white px-2 py-1 text-right text-sm tabular-nums text-ink"
                          />
                        </td>
                        <td className="py-2 pr-4 text-right text-ink-muted tabular-nums">
                          {formatCurrency(parseFloat(editAmount || "0") / 4)}
                        </td>
                        <td className="py-2 pr-4">
                          <input
                            type="text"
                            value={editNotes}
                            onChange={(e) => setEditNotes(e.target.value)}
                            className="w-full rounded border border-line bg-white px-2 py-1 text-sm text-ink"
                            placeholder="Notes"
                          />
                        </td>
                        <td className="py-2 text-right space-x-1">
                          <Button
                            variant="primary"
                            className="text-sm px-3 py-1.5"
                            onClick={() => handleUpdate(line.id)}
                            disabled={isPending}
                          >
                            Save
                          </Button>
                          <Button
                            variant="ghost"
                            className="text-sm px-3 py-1.5"
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </Button>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={line.id} className="border-b border-line/50">
                      <td className="py-2 pr-4 text-ink-muted tabular-nums">
                        {account?.code ?? "—"}
                      </td>
                      <td className="py-2 pr-4 text-ink">
                        {account?.name ?? "Unknown"}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums font-medium text-ink">
                        {formatCurrency(line.budgetAmount)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums text-ink-muted">
                        {formatCurrency(line.budgetAmount / 4)}
                      </td>
                      <td className="py-2 pr-4 text-ink-muted text-xs">
                        {line.notes ?? ""}
                      </td>
                      <td className="py-2 text-right space-x-1">
                        <Button
                          variant="ghost"
                          className="text-sm px-3 py-1.5"
                          onClick={() => startEdit(line)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          className="text-sm px-3 py-1.5"
                          onClick={() => handleDelete(line.id)}
                          disabled={isPending}
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-line font-bold">
                  <td colSpan={2} className="py-3 pr-4 text-ink">
                    Total
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums text-ink">
                    {formatCurrency(totalBudget)}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums text-ink">
                    {formatCurrency(totalBudget / 4)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* Budget vs Actual comparison */}
      {budgetVsActual && budgetVsActual.lines.length > 0 && (
        <Card>
          <CardHeader
            title="Budget vs Actual"
            description={`FY ${financialYear}/${financialYear + 1} — ${funds.find((f) => f.id === selectedFundId)?.name ?? ""}`}
          />
          <div className="px-6 pb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-ink-muted uppercase tracking-wide">
                  <th scope="col" className="text-left py-2 pr-4">Code</th>
                  <th scope="col" className="text-left py-2 pr-4">Account</th>
                  <th scope="col" className="text-right py-2 pr-4">Budget</th>
                  <th scope="col" className="text-right py-2 pr-4">Actual</th>
                  <th scope="col" className="text-right py-2 pr-4">Variance</th>
                  <th scope="col" className="text-right py-2">%</th>
                </tr>
              </thead>
              <tbody>
                {budgetVsActual.lines.map((line) => (
                  <tr
                    key={line.budgetLineId}
                    className="border-b border-line/50"
                  >
                    <td className="py-2 pr-4 text-ink-muted tabular-nums">
                      {line.accountCode}
                    </td>
                    <td className="py-2 pr-4 text-ink">
                      {line.accountName}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-ink">
                      {formatCurrency(line.budgetAmount)}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-ink">
                      {formatCurrency(line.actualAmount)}
                    </td>
                    <td
                      className={`py-2 pr-4 text-right tabular-nums font-medium ${
                        line.variance >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {formatCurrency(line.variance)}
                    </td>
                    <td
                      className={`py-2 text-right tabular-nums ${
                        line.variancePercent >= 0
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {line.variancePercent.toFixed(1)}%
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-line font-bold">
                  <td colSpan={2} className="py-3 pr-4 text-ink">
                    Totals
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums text-ink">
                    {formatCurrency(budgetVsActual.totalBudget)}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums text-ink">
                    {formatCurrency(budgetVsActual.totalActual)}
                  </td>
                  <td
                    className={`py-3 pr-4 text-right tabular-nums font-bold ${
                      budgetVsActual.totalVariance >= 0
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {formatCurrency(budgetVsActual.totalVariance)}
                  </td>
                  <td
                    className={`py-3 text-right tabular-nums ${
                      budgetVsActual.totalVariance >= 0
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {budgetVsActual.totalBudget !== 0
                      ? (
                          (budgetVsActual.totalVariance /
                            budgetVsActual.totalBudget) *
                          100
                        ).toFixed(1)
                      : "0.0"}
                    %
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
