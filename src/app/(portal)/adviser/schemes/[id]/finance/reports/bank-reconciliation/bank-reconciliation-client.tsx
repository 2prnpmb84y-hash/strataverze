"use client";

import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { SelectField } from "@/components/ui/form-field";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";

interface BankAccount {
  id: string;
  accountName: string;
  bsb: string;
  accountNumber: string;
}

interface UnmatchedTransaction {
  id: string;
  transactionDate: string;
  amount: number;
  description: string;
  reference: string | null;
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

export function BankReconciliationClient({
  schemeId,
  bankAccounts,
  selectedAccountId,
  selectedAccountName,
  summary,
  unmatchedTransactions,
}: {
  schemeId: string;
  bankAccounts: BankAccount[];
  selectedAccountId: string;
  selectedAccountName: string;
  summary: {
    totalTransactions: number;
    reconciledCount: number;
    matchedCount: number;
    unmatchedCount: number;
    excludedCount: number;
    totalReceipts: number;
    totalPayments: number;
  };
  unmatchedTransactions: UnmatchedTransaction[];
}) {
  const router = useRouter();

  function handleAccountChange(accountId: string) {
    const params = new URLSearchParams();
    if (accountId) params.set("account", accountId);
    router.push(
      `/adviser/schemes/${schemeId}/finance/reports/bank-reconciliation${accountId ? `?${params}` : ""}`,
    );
  }

  return (
    <div className="space-y-6">
      {/* Account selector */}
      <Card>
        <CardHeader
          title="Select Bank Account"
          description="Choose the bank account for this reconciliation report."
        />
        <div className="px-6 pb-6">
          <SelectField
            label="Bank Account"
            name="bankAccountId"
            required
            value={selectedAccountId}
            onChange={(e) => handleAccountChange(e.target.value)}
            options={[
              { value: "", label: "Select a bank account..." },
              ...bankAccounts.map((ba) => ({
                value: ba.id,
                label: `${ba.accountName} (${ba.bsb} ${ba.accountNumber})`,
              })),
            ]}
          />
        </div>
      </Card>

      {selectedAccountId && summary.totalTransactions === 0 && (
        <EmptyState
          title="No transactions"
          description="Import bank transactions to generate a reconciliation report."
          actionLabel="Import Transactions"
          actionHref={`/adviser/schemes/${schemeId}/finance/bank-import`}
        />
      )}

      {selectedAccountId && summary.totalTransactions > 0 && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard
              label="Reconciled"
              value={String(summary.reconciledCount)}
              accent="bg-green-500"
            />
            <StatCard
              label="Matched"
              value={String(summary.matchedCount)}
              accent="bg-blue-500"
            />
            <StatCard
              label="Unmatched"
              value={String(summary.unmatchedCount)}
              accent="bg-amber-500"
            />
            <StatCard
              label="Excluded"
              value={String(summary.excludedCount)}
              accent="bg-zinc-400"
            />
          </div>

          {/* Cash flow summary */}
          <Card>
            <CardHeader
              title={`Cash Flow Summary — ${selectedAccountName}`}
            />
            <div className="px-6 pb-6">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-border/50">
                    <td className="py-2 text-foreground">Total Receipts (Credits)</td>
                    <td className="py-2 text-right tabular-nums font-medium text-green-600">
                      {formatCurrency(summary.totalReceipts)}
                    </td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2 text-foreground">Total Payments (Debits)</td>
                    <td className="py-2 text-right tabular-nums font-medium text-red-600">
                      {formatCurrency(summary.totalPayments)}
                    </td>
                  </tr>
                  <tr className="border-t-2 border-border font-semibold">
                    <td className="py-2 text-foreground">Net Movement</td>
                    <td
                      className={`py-2 text-right tabular-nums ${
                        summary.totalReceipts - summary.totalPayments >= 0
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {formatCurrency(
                        summary.totalReceipts - summary.totalPayments,
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          {/* Unmatched items */}
          {unmatchedTransactions.length > 0 && (
            <Card>
              <CardHeader
                title="Unmatched Bank Items"
                description={`${unmatchedTransactions.length} transaction${unmatchedTransactions.length !== 1 ? "s" : ""} with no matching journal entry`}
              />

              <div className="hidden sm:grid sm:grid-cols-[100px_1fr_120px_120px] gap-4 px-6 pb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b border-border">
                <div>Date</div>
                <div>Description</div>
                <div>Reference</div>
                <div className="text-right">Amount</div>
              </div>

              <div className="divide-y divide-border">
                {unmatchedTransactions.map((txn) => (
                  <div
                    key={txn.id}
                    className="grid grid-cols-1 sm:grid-cols-[100px_1fr_120px_120px] gap-2 sm:gap-4 px-6 py-3 items-center"
                  >
                    <div className="text-sm text-muted-foreground">
                      {formatDate(txn.transactionDate)}
                    </div>
                    <div className="text-sm text-foreground truncate">
                      {txn.description}
                    </div>
                    <div className="text-sm text-muted-foreground truncate">
                      {txn.reference ?? "—"}
                    </div>
                    <div
                      className={`text-sm text-right tabular-nums font-medium ${
                        txn.amount >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {formatCurrency(txn.amount)}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
