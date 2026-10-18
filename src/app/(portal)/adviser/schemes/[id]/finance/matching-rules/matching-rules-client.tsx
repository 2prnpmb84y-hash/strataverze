"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  createMatchingRuleAction,
  updateMatchingRuleAction,
  deleteMatchingRuleAction,
  runAutoMatchAction,
} from "../actions";

type Rule = {
  id: string;
  name: string;
  description: string | null;
  matchType: string;
  descriptionPattern: string | null;
  referencePattern: string | null;
  exactAmount: unknown;
  minAmount: unknown;
  maxAmount: unknown;
  transactionSign: string | null;
  targetAccountCodeId: string | null;
  targetFundId: string | null;
  autoPost: boolean;
  priority: number;
  isActive: boolean;
  matchCount: number;
  lastMatchedAt: unknown;
  targetAccountCode: { id: string; code: unknown; name: unknown } | null;
  targetFund: { id: string; name: unknown } | null;
};

type MatchingRulesClientProps = {
  schemeId: string;
  rules: Rule[];
  accounts: Array<{ id: string; code: string; name: string }>;
  funds: Array<{ id: string; name: string }>;
  bankAccounts: Array<{
    id: string;
    accountName: string;
    bsb: string;
    accountNumber: string;
  }>;
};

type RuleFormData = {
  name: string;
  description: string;
  matchType: string;
  descriptionPattern: string;
  referencePattern: string;
  exactAmount: string;
  minAmount: string;
  maxAmount: string;
  transactionSign: string;
  targetAccountCodeId: string;
  targetFundId: string;
  autoPost: boolean;
  priority: string;
};

const emptyForm: RuleFormData = {
  name: "",
  description: "",
  matchType: "DESCRIPTION",
  descriptionPattern: "",
  referencePattern: "",
  exactAmount: "",
  minAmount: "",
  maxAmount: "",
  transactionSign: "ANY",
  targetAccountCodeId: "",
  targetFundId: "",
  autoPost: false,
  priority: "0",
};

const matchTypeLabels: Record<string, string> = {
  DESCRIPTION: "Description",
  REFERENCE: "Reference",
  AMOUNT: "Amount",
  DESCRIPTION_AND_AMOUNT: "Description + Amount",
};

const inputClasses =
  "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 transition-colors";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(value);
}

function showsDescription(matchType: string) {
  return matchType === "DESCRIPTION" || matchType === "DESCRIPTION_AND_AMOUNT";
}

function showsReference(matchType: string) {
  return matchType === "REFERENCE";
}

function showsAmount(matchType: string) {
  return matchType === "AMOUNT" || matchType === "DESCRIPTION_AND_AMOUNT";
}

function getCriteriaSummary(rule: Rule): string {
  const parts: string[] = [];
  if (
    showsDescription(rule.matchType) &&
    rule.descriptionPattern
  ) {
    parts.push(`Desc: "${String(rule.descriptionPattern)}"`);
  }
  if (showsReference(rule.matchType) && rule.referencePattern) {
    parts.push(`Ref: "${String(rule.referencePattern)}"`);
  }
  if (showsAmount(rule.matchType)) {
    if (rule.exactAmount !== null) {
      parts.push(`Exact: ${formatCurrency(Number(rule.exactAmount))}`);
    } else {
      const min =
        rule.minAmount !== null
          ? formatCurrency(Number(rule.minAmount))
          : null;
      const max =
        rule.maxAmount !== null
          ? formatCurrency(Number(rule.maxAmount))
          : null;
      if (min && max) parts.push(`${min} – ${max}`);
      else if (min) parts.push(`Min: ${min}`);
      else if (max) parts.push(`Max: ${max}`);
    }
  }
  if (rule.transactionSign && rule.transactionSign !== "ANY") {
    parts.push(rule.transactionSign === "CREDIT" ? "Credits only" : "Debits only");
  }
  return parts.join(", ") || "—";
}

export function MatchingRulesClient({
  schemeId,
  rules,
  accounts,
  funds,
  bankAccounts,
}: MatchingRulesClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [form, setForm] = useState<RuleFormData>(emptyForm);

  // Auto-match state
  const [showAutoMatch, setShowAutoMatch] = useState(false);
  const [autoMatchAccountId, setAutoMatchAccountId] = useState("");
  const [autoMatchResults, setAutoMatchResults] = useState<
    Array<{
      transactionId: string;
      ruleName: string;
      accountCode: string;
      fundName: string;
    }> | null
  >(null);

  function resetForm() {
    setForm(emptyForm);
    setShowAddForm(false);
    setEditingRuleId(null);
    setError(null);
  }

  function startEdit(rule: Rule) {
    setShowAddForm(false);
    setEditingRuleId(rule.id);
    setError(null);
    setForm({
      name: String(rule.name),
      description: rule.description ? String(rule.description) : "",
      matchType: rule.matchType,
      descriptionPattern: rule.descriptionPattern
        ? String(rule.descriptionPattern)
        : "",
      referencePattern: rule.referencePattern
        ? String(rule.referencePattern)
        : "",
      exactAmount:
        rule.exactAmount !== null ? String(Number(rule.exactAmount)) : "",
      minAmount:
        rule.minAmount !== null ? String(Number(rule.minAmount)) : "",
      maxAmount:
        rule.maxAmount !== null ? String(Number(rule.maxAmount)) : "",
      transactionSign: rule.transactionSign ?? "ANY",
      targetAccountCodeId: rule.targetAccountCodeId ?? "",
      targetFundId: rule.targetFundId ?? "",
      autoPost: rule.autoPost,
      priority: String(rule.priority),
    });
  }

  function startAdd() {
    setEditingRuleId(null);
    setForm(emptyForm);
    setShowAddForm(true);
    setError(null);
  }

  function updateField(field: keyof RuleFormData, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleCreate() {
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }

    startTransition(async () => {
      setError(null);
      const result = await createMatchingRuleAction(schemeId, {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        matchType: form.matchType,
        descriptionPattern: form.descriptionPattern.trim() || undefined,
        referencePattern: form.referencePattern.trim() || undefined,
        exactAmount: form.exactAmount ? parseFloat(form.exactAmount) : undefined,
        minAmount: form.minAmount ? parseFloat(form.minAmount) : undefined,
        maxAmount: form.maxAmount ? parseFloat(form.maxAmount) : undefined,
        transactionSign:
          form.transactionSign !== "ANY" ? form.transactionSign : undefined,
        targetAccountCodeId: form.targetAccountCodeId || undefined,
        targetFundId: form.targetFundId || undefined,
        autoPost: form.autoPost,
        priority: parseInt(form.priority, 10) || 0,
      });

      if (result.error) {
        setError(result.error);
      } else {
        resetForm();
        router.refresh();
      }
    });
  }

  function handleUpdate() {
    if (!editingRuleId || !form.name.trim()) {
      setError("Name is required.");
      return;
    }

    startTransition(async () => {
      setError(null);
      const result = await updateMatchingRuleAction(schemeId, editingRuleId, {
        name: form.name.trim(),
        description: form.description.trim() || null,
        matchType: form.matchType,
        descriptionPattern: form.descriptionPattern.trim() || null,
        referencePattern: form.referencePattern.trim() || null,
        exactAmount: form.exactAmount
          ? parseFloat(form.exactAmount)
          : null,
        minAmount: form.minAmount ? parseFloat(form.minAmount) : null,
        maxAmount: form.maxAmount ? parseFloat(form.maxAmount) : null,
        transactionSign:
          form.transactionSign !== "ANY" ? form.transactionSign : null,
        targetAccountCodeId: form.targetAccountCodeId || null,
        targetFundId: form.targetFundId || null,
        autoPost: form.autoPost,
        priority: parseInt(form.priority, 10) || 0,
      });

      if (result.error) {
        setError(result.error);
      } else {
        resetForm();
        router.refresh();
      }
    });
  }

  function handleDelete(ruleId: string, ruleName: string) {
    if (!confirm(`Delete matching rule "${ruleName}"? This cannot be undone.`)) {
      return;
    }

    startTransition(async () => {
      setError(null);
      const result = await deleteMatchingRuleAction(schemeId, ruleId);
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  function handleToggleActive(rule: Rule) {
    startTransition(async () => {
      setError(null);
      const result = await updateMatchingRuleAction(schemeId, rule.id, {
        isActive: !rule.isActive,
      });
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  function handleRunAutoMatch() {
    startTransition(async () => {
      setError(null);
      setSuccessMsg(null);
      setAutoMatchResults(null);

      const result = await runAutoMatchAction(
        schemeId,
        autoMatchAccountId || undefined,
      );

      if (result.error) {
        setError(result.error);
      } else if (result.data) {
        const matched = result.data.matched as number;
        const results = result.data.results as Array<{
          transactionId: string;
          ruleName: string;
          accountCode: string;
          fundName: string;
        }>;
        setAutoMatchResults(results);
        setSuccessMsg(
          matched > 0
            ? `Successfully matched ${matched} transaction${matched !== 1 ? "s" : ""}.`
            : "No transactions matched any rules.",
        );
        router.refresh();
      }
    });
  }

  function renderForm(isEdit: boolean) {
    return (
      <Card>
        <div className="p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">
            {isEdit ? "Edit Matching Rule" : "New Matching Rule"}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Name
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateField("name", e.target.value)
                }
                placeholder="e.g. Strata Insurance Premium"
                required
                className={inputClasses}
              />
            </div>

            {/* Match Type */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Match Type
              </label>
              <select
                value={form.matchType}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  updateField("matchType", e.target.value)
                }
                className={inputClasses}
              >
                <option value="DESCRIPTION">Description</option>
                <option value="REFERENCE">Reference</option>
                <option value="AMOUNT">Amount</option>
                <option value="DESCRIPTION_AND_AMOUNT">
                  Description + Amount
                </option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Description (optional)
            </label>
            <textarea
              value={form.description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                updateField("description", e.target.value)
              }
              placeholder="What this rule matches and why"
              rows={2}
              className={inputClasses}
            />
          </div>

          {/* Conditional pattern fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {showsDescription(form.matchType) && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Description Pattern
                </label>
                <input
                  type="text"
                  value={form.descriptionPattern}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    updateField("descriptionPattern", e.target.value)
                  }
                  placeholder="e.g. INSURANCE PREMIUM"
                  className={inputClasses}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Case-insensitive substring match
                </p>
              </div>
            )}

            {showsReference(form.matchType) && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Reference Pattern
                </label>
                <input
                  type="text"
                  value={form.referencePattern}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    updateField("referencePattern", e.target.value)
                  }
                  placeholder="e.g. INV-2024"
                  className={inputClasses}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Case-insensitive substring match
                </p>
              </div>
            )}
          </div>

          {showsAmount(form.matchType) && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Exact Amount
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.exactAmount}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    updateField("exactAmount", e.target.value)
                  }
                  placeholder="0.00"
                  className={inputClasses}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Min Amount
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.minAmount}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    updateField("minAmount", e.target.value)
                  }
                  placeholder="0.00"
                  className={inputClasses}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Max Amount
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.maxAmount}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    updateField("maxAmount", e.target.value)
                  }
                  placeholder="0.00"
                  className={inputClasses}
                />
              </div>
            </div>
          )}

          {/* Transaction sign, target account, target fund */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Transaction Sign
              </label>
              <select
                value={form.transactionSign}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  updateField("transactionSign", e.target.value)
                }
                className={inputClasses}
              >
                <option value="ANY">Any</option>
                <option value="CREDIT">Credits only</option>
                <option value="DEBIT">Debits only</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Target Account
              </label>
              <select
                value={form.targetAccountCodeId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  updateField("targetAccountCodeId", e.target.value)
                }
                className={inputClasses}
              >
                <option value="">Select account...</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} — {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Target Fund
              </label>
              <select
                value={form.targetFundId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  updateField("targetFundId", e.target.value)
                }
                className={inputClasses}
              >
                <option value="">Select fund...</option>
                {funds.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Priority and auto-post */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Priority
              </label>
              <input
                type="number"
                min="0"
                value={form.priority}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateField("priority", e.target.value)
                }
                className={inputClasses}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Higher priority rules are applied first
              </p>
            </div>

            <div className="flex items-center gap-2 pb-1">
              <input
                type="checkbox"
                id="autoPost"
                checked={form.autoPost}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateField("autoPost", e.target.checked)
                }
                className="h-4 w-4 rounded border-border text-primary-400 focus:ring-primary-400"
              />
              <label
                htmlFor="autoPost"
                className="text-sm font-medium text-foreground"
              >
                Auto-post matched journal entries
              </label>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
            <Button variant="ghost" type="button" onClick={resetForm}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="button"
              disabled={isPending}
              onClick={isEdit ? handleUpdate : handleCreate}
            >
              {isPending
                ? "Saving..."
                : isEdit
                  ? "Update Rule"
                  : "Create Rule"}
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Error / success messages */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          {successMsg}
        </div>
      )}

      {/* Top actions */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          type="button"
          onClick={startAdd}
          disabled={showAddForm}
        >
          + Add Rule
        </Button>
        <Button
          variant="secondary"
          type="button"
          onClick={() => setShowAutoMatch(!showAutoMatch)}
        >
          Run Auto-Match
        </Button>
      </div>

      {/* Auto-match panel */}
      {showAutoMatch && (
        <Card>
          <div className="p-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground">
              Run Auto-Match
            </h3>
            <p className="text-sm text-muted-foreground">
              Apply all active matching rules to unmatched bank transactions.
              Optionally filter by bank account.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Bank Account (optional)
                </label>
                <select
                  value={autoMatchAccountId}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    setAutoMatchAccountId(e.target.value)
                  }
                  className={inputClasses}
                >
                  <option value="">All accounts</option>
                  {bankAccounts.map((ba) => (
                    <option key={ba.id} value={ba.id}>
                      {ba.accountName} ({ba.bsb} {ba.accountNumber})
                    </option>
                  ))}
                </select>
              </div>
              <Button
                variant="primary"
                type="button"
                disabled={isPending}
                onClick={handleRunAutoMatch}
              >
                {isPending ? "Running..." : "Run Now"}
              </Button>
            </div>

            {/* Auto-match results */}
            {autoMatchResults && autoMatchResults.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-foreground mb-2">
                  Matched Transactions
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th scope="col" className="pb-2 pr-4 font-medium text-muted-foreground">
                          Rule
                        </th>
                        <th scope="col" className="pb-2 pr-4 font-medium text-muted-foreground">
                          Account
                        </th>
                        <th scope="col" className="pb-2 font-medium text-muted-foreground">
                          Fund
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {autoMatchResults.map((r, i) => (
                        <tr key={i} className="border-b border-border">
                          <td className="py-2 pr-4 text-foreground">
                            {r.ruleName}
                          </td>
                          <td className="py-2 pr-4 text-foreground">
                            {r.accountCode}
                          </td>
                          <td className="py-2 text-foreground">{r.fundName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Add form */}
      {showAddForm && renderForm(false)}

      {/* Rules list */}
      {rules.length === 0 && !showAddForm ? (
        <EmptyState
          title="No matching rules"
          description="Create matching rules to automatically categorise bank transactions during import."
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="px-4 py-3 font-medium text-muted-foreground">
                    Priority
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium text-muted-foreground">
                    Name
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium text-muted-foreground">
                    Match Type
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium text-muted-foreground">
                    Criteria
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium text-muted-foreground">
                    Target Account
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium text-muted-foreground">
                    Fund
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium text-muted-foreground">
                    Auto
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium text-muted-foreground">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium text-muted-foreground text-right">
                    Matches
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id} className="border-b border-border">
                    {editingRuleId === rule.id ? (
                      <td colSpan={10} className="p-0">
                        {renderForm(true)}
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-foreground font-mono">
                          {rule.priority}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-foreground font-medium">
                            {String(rule.name)}
                          </div>
                          {rule.description && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {String(rule.description)}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-foreground">
                          {matchTypeLabels[rule.matchType] ?? rule.matchType}
                        </td>
                        <td className="px-4 py-3 text-foreground text-xs max-w-[200px] truncate">
                          {getCriteriaSummary(rule)}
                        </td>
                        <td className="px-4 py-3 text-foreground text-xs">
                          {rule.targetAccountCode
                            ? `${String(rule.targetAccountCode.code)} — ${String(rule.targetAccountCode.name)}`
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-foreground text-xs">
                          {rule.targetFund
                            ? String(rule.targetFund.name)
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {rule.autoPost && (
                            <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-xs font-medium">
                              Auto
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => handleToggleActive(rule)}
                            disabled={isPending}
                            className="cursor-pointer"
                          >
                            {rule.isActive ? (
                              <span className="inline-flex items-center rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-xs font-medium">
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-xs font-medium">
                                Inactive
                              </span>
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-foreground text-right font-mono">
                          {rule.matchCount}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => startEdit(rule)}
                              disabled={isPending}
                              className="text-sm px-2 py-1 rounded text-primary-500 hover:bg-primary-50 transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleDelete(rule.id, String(rule.name))
                              }
                              disabled={isPending}
                              className="text-sm px-2 py-1 rounded text-red-500 hover:bg-red-50 transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
