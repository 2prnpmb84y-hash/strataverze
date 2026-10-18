"use client";

import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { SelectField } from "@/components/ui/form-field";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";

const inputClasses =
  "w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise transition-colors";

interface BankAccount {
  id: string;
  accountName: string;
  bsb: string;
  accountNumber: string;
}

interface ReconciliationTransaction {
  id: string;
  transactionDate: string;
  description: string;
  reference: string | null;
  amount: number;
  reconciliationStatus: string;
}

interface ReconciliationReport {
  lastReconciledBalance: number;
  lastReconciledDate: string | null;
  closingBankBalance: number;
  depositsInTransit: ReconciliationTransaction[];
  depositsInTransitTotal: number;
  outstandingWithdrawals: ReconciliationTransaction[];
  outstandingWithdrawalsTotal: number;
  adjustedBankBalance: number;
  bookBalance: number;
  discrepancy: number;
  totalTransactions: number;
  reconciledCount: number;
  matchedCount: number;
  unmatchedCount: number;
  excludedCount: number;
  totalReceipts: number;
  totalPayments: number;
  unmatchedTransactions: ReconciliationTransaction[];
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
  asAtDate,
  report,
  basePath,
}: {
  schemeId: string;
  bankAccounts: BankAccount[];
  selectedAccountId: string;
  selectedAccountName: string;
  asAtDate: string;
  report: ReconciliationReport | null;
  basePath?: string;
}) {
  const router = useRouter();
  const reportBase = basePath ?? `/adviser/schemes/${schemeId}/finance/reports`;

  function updateParams(accountId: string, date: string) {
    const params = new URLSearchParams();
    if (accountId) params.set("account", accountId);
    if (date) params.set("asAt", date);
    const qs = params.toString();
    router.push(
      `${reportBase}/bank-reconciliation${qs ? `?${qs}` : ""}`,
    );
  }

  function handleAccountChange(accountId: string) {
    updateParams(accountId, asAtDate);
  }

  function handleDateChange(date: string) {
    if (date) {
      updateParams(selectedAccountId, date);
    }
  }

  return (
    <div className="space-y-6">
      {/* Filters: account selector and as-at date */}
      <Card>
        <CardHeader
          title="Reconciliation Parameters"
          description="Select the bank account and the date to reconcile as at."
        />
        <div className="px-6 pb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          <div>
            <label
              htmlFor="asAtDate"
              className="block text-sm font-medium text-ink mb-1.5"
            >
              Reconcile As At
            </label>
            <input
              id="asAtDate"
              type="date"
              className={inputClasses}
              value={asAtDate}
              onChange={(e) => handleDateChange(e.target.value)}
            />
          </div>
        </div>
      </Card>

      {selectedAccountId && !report && (
        <EmptyState
          title="Loading report..."
          description="Generating reconciliation data."
        />
      )}

      {selectedAccountId && report && report.totalTransactions === 0 && (
        <EmptyState
          title="No transactions"
          description="Import bank transactions to generate a reconciliation report."
          actionLabel="Import Transactions"
          actionHref={`${reportBase.replace("/finance/reports", "")}/finance/bank-import`}
        />
      )}

      {selectedAccountId && report && report.totalTransactions > 0 && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard
              label="Reconciled"
              value={String(report.reconciledCount)}
              accent="bg-green-500"
            />
            <StatCard
              label="Matched"
              value={String(report.matchedCount)}
              accent="bg-blue-500"
            />
            <StatCard
              label="Unmatched"
              value={String(report.unmatchedCount)}
              accent="bg-amber-500"
            />
            <StatCard
              label="Excluded"
              value={String(report.excludedCount)}
              accent="bg-zinc-400"
            />
          </div>

          {/* Bank Reconciliation Statement */}
          <Card>
            <CardHeader
              title={`Bank Reconciliation Statement — ${selectedAccountName}`}
              description={`As at ${formatDate(asAtDate)}${report.lastReconciledDate ? ` (last reconciled: ${formatDate(report.lastReconciledDate)})` : ""}`}
            />
            <div className="px-6 pb-6">
              <table className="w-full text-sm">
                <tbody>
                  {/* Section 1: Bank Statement Balance */}
                  <tr>
                    <td
                      colSpan={2}
                      className="pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted"
                    >
                      Bank Statement
                    </td>
                  </tr>
                  <tr className="border-b border-line/50">
                    <td className="py-2 text-ink">
                      Closing Bank Balance
                    </td>
                    <td className="py-2 text-right tabular-nums font-medium text-ink">
                      {formatCurrency(report.closingBankBalance)}
                    </td>
                  </tr>

                  {/* Section 2: Outstanding items */}
                  <tr>
                    <td
                      colSpan={2}
                      className="pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted"
                    >
                      Outstanding Items
                    </td>
                  </tr>
                  <tr className="border-b border-line/50">
                    <td className="py-2 text-ink pl-4">
                      Add: Deposits in transit
                      <span className="text-ink-muted ml-1">
                        ({report.depositsInTransit.length})
                      </span>
                    </td>
                    <td className="py-2 text-right tabular-nums font-medium text-green-600">
                      {formatCurrency(report.depositsInTransitTotal)}
                    </td>
                  </tr>
                  <tr className="border-b border-line/50">
                    <td className="py-2 text-ink pl-4">
                      Less: Outstanding withdrawals
                      <span className="text-ink-muted ml-1">
                        ({report.outstandingWithdrawals.length})
                      </span>
                    </td>
                    <td className="py-2 text-right tabular-nums font-medium text-red-600">
                      ({formatCurrency(report.outstandingWithdrawalsTotal)})
                    </td>
                  </tr>
                  <tr className="border-t-2 border-line">
                    <td className="py-2 font-semibold text-ink">
                      Adjusted Bank Balance
                    </td>
                    <td className="py-2 text-right tabular-nums font-bold text-ink">
                      {formatCurrency(report.adjustedBankBalance)}
                    </td>
                  </tr>

                  {/* Section 3: Book Balance */}
                  <tr>
                    <td
                      colSpan={2}
                      className="pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted"
                    >
                      Ledger
                    </td>
                  </tr>
                  <tr className="border-b border-line/50">
                    <td className="py-2 text-ink">
                      Book Balance (General Ledger)
                    </td>
                    <td className="py-2 text-right tabular-nums font-medium text-ink">
                      {formatCurrency(report.bookBalance)}
                    </td>
                  </tr>

                  {/* Section 4: Discrepancy */}
                  <tr className="border-t-2 border-line">
                    <td className="py-3 font-semibold text-ink">
                      Discrepancy
                    </td>
                    <td
                      className={`py-3 text-right tabular-nums font-bold ${
                        Math.abs(report.discrepancy) < 0.01
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {formatCurrency(report.discrepancy)}
                    </td>
                  </tr>
                </tbody>
              </table>

              {Math.abs(report.discrepancy) < 0.01 && (
                <div className="mt-4 rounded-[var(--radius-card)] bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
                  The bank balance and book balance are reconciled.
                </div>
              )}

              {Math.abs(report.discrepancy) >= 0.01 && (
                <div className="mt-4 rounded-[var(--radius-card)] bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                  There is a discrepancy of{" "}
                  {formatCurrency(Math.abs(report.discrepancy))} between the
                  adjusted bank balance and the book balance. Review unmatched
                  items and outstanding transactions below.
                </div>
              )}
            </div>
          </Card>

          {/* Cash Flow Summary */}
          <Card>
            <CardHeader title="Cash Flow Summary" />
            <div className="px-6 pb-6">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-line/50">
                    <td className="py-2 text-ink">
                      Total Receipts (Credits)
                    </td>
                    <td className="py-2 text-right tabular-nums font-medium text-green-600">
                      {formatCurrency(report.totalReceipts)}
                    </td>
                  </tr>
                  <tr className="border-b border-line/50">
                    <td className="py-2 text-ink">
                      Total Payments (Debits)
                    </td>
                    <td className="py-2 text-right tabular-nums font-medium text-red-600">
                      {formatCurrency(report.totalPayments)}
                    </td>
                  </tr>
                  <tr className="border-t-2 border-line font-semibold">
                    <td className="py-2 text-ink">Net Movement</td>
                    <td
                      className={`py-2 text-right tabular-nums ${
                        report.totalReceipts - report.totalPayments >= 0
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {formatCurrency(
                        report.totalReceipts - report.totalPayments,
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          {/* Deposits in Transit detail */}
          {report.depositsInTransit.length > 0 && (
            <Card>
              <CardHeader
                title="Deposits in Transit"
                description={`${report.depositsInTransit.length} deposit${report.depositsInTransit.length !== 1 ? "s" : ""} recorded in books but not yet cleared at bank`}
              />
              <TransactionTable
                transactions={report.depositsInTransit}
              />
            </Card>
          )}

          {/* Outstanding Withdrawals detail */}
          {report.outstandingWithdrawals.length > 0 && (
            <Card>
              <CardHeader
                title="Outstanding Withdrawals"
                description={`${report.outstandingWithdrawals.length} payment${report.outstandingWithdrawals.length !== 1 ? "s" : ""} issued but not yet cleared at bank`}
              />
              <TransactionTable
                transactions={report.outstandingWithdrawals}
              />
            </Card>
          )}

          {/* Unmatched items */}
          {report.unmatchedTransactions.length > 0 && (
            <Card>
              <CardHeader
                title="Unmatched Bank Items"
                description={`${report.unmatchedTransactions.length} transaction${report.unmatchedTransactions.length !== 1 ? "s" : ""} with no matching journal entry`}
              />
              <TransactionTable
                transactions={report.unmatchedTransactions}
              />
            </Card>
          )}
        </>
      )}
    </div>
  );
}

/** Reusable transaction list table. */
function TransactionTable({
  transactions,
}: {
  transactions: ReconciliationTransaction[];
}) {
  return (
    <>
      <div className="hidden sm:grid sm:grid-cols-[100px_1fr_120px_120px] gap-4 px-6 pb-2 text-xs font-medium text-ink-muted uppercase tracking-wide border-b border-line">
        <div>Date</div>
        <div>Description</div>
        <div>Reference</div>
        <div className="text-right">Amount</div>
      </div>

      <div className="divide-y divide-line">
        {transactions.map((txn) => (
          <div
            key={txn.id}
            className="grid grid-cols-1 sm:grid-cols-[100px_1fr_120px_120px] gap-2 sm:gap-4 px-6 py-3 items-center"
          >
            <div className="text-sm text-ink-muted">
              {formatDate(txn.transactionDate)}
            </div>
            <div className="text-sm text-ink truncate">
              {txn.description}
            </div>
            <div className="text-sm text-ink-muted truncate">
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
    </>
  );
}
