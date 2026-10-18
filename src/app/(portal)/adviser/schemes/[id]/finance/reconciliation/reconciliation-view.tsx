"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { SelectField } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  matchTransactionAction,
  excludeTransactionAction,
} from "../actions";

interface BankAccount {
  id: string;
  accountName: string;
  bsb: string;
  accountNumber: string;
}

interface Transaction {
  id: string;
  transactionDate: string;
  amount: number;
  description: string;
  reference: string | null;
  balance: number | null;
  reconciliationStatus: string;
}

interface JournalEntry {
  id: string;
  entryNumber: string;
  transactionDate: string;
  description: string;
  totalAmount: number;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(value);
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-AU");
}

export function ReconciliationView({
  schemeId,
  bankAccounts,
  selectedAccountId,
  transactions,
  journalEntries,
}: {
  schemeId: string;
  bankAccounts: BankAccount[];
  selectedAccountId: string;
  transactions: Transaction[];
  journalEntries: JournalEntry[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  // Matching state
  const [matchingTxnId, setMatchingTxnId] = useState<string | null>(null);
  const [selectedJournalEntryId, setSelectedJournalEntryId] = useState("");

  function handleAccountChange(accountId: string) {
    const params = new URLSearchParams();
    if (accountId) params.set("account", accountId);
    router.push(
      `/adviser/schemes/${schemeId}/finance/reconciliation${accountId ? `?${params}` : ""}`,
    );
  }

  function handleMatch(transactionId: string) {
    if (!selectedJournalEntryId) return;
    setError(undefined);
    startTransition(async () => {
      const result = await matchTransactionAction(
        schemeId,
        transactionId,
        selectedJournalEntryId,
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      setMatchingTxnId(null);
      setSelectedJournalEntryId("");
      router.refresh();
    });
  }

  function handleExclude(transactionId: string) {
    setError(undefined);
    startTransition(async () => {
      const result = await excludeTransactionAction(schemeId, transactionId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  // Find potential journal entry matches for a transaction (by amount)
  function findPotentialMatches(txn: Transaction): JournalEntry[] {
    const absAmount = Math.abs(txn.amount);
    return journalEntries.filter((je) => {
      return Math.abs(je.totalAmount - absAmount) < 0.01;
    });
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Bank account selector */}
      <Card>
        <CardHeader
          title="Select Bank Account"
          description="Choose the bank account to reconcile."
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

      {/* Transactions list */}
      {selectedAccountId && transactions.length === 0 && (
        <EmptyState
          title="No unmatched transactions"
          description="All transactions have been matched, reconciled or excluded. Import more transactions to continue."
          actionLabel="Import Transactions"
          actionHref={`/adviser/schemes/${schemeId}/finance/bank-import`}
        />
      )}

      {selectedAccountId && transactions.length > 0 && (
        <Card>
          <CardHeader
            title="Unmatched Transactions"
            description={`${transactions.length} transaction${transactions.length !== 1 ? "s" : ""} awaiting reconciliation`}
          />

          {/* Table header */}
          <div className="hidden sm:grid sm:grid-cols-[100px_1fr_100px_140px] gap-4 px-6 pb-2 text-xs font-medium text-ink-muted uppercase tracking-wide border-b border-line">
            <div>Date</div>
            <div>Description</div>
            <div className="text-right">Amount</div>
            <div className="text-right">Actions</div>
          </div>

          <div className="divide-y divide-line">
            {transactions.map((txn) => (
              <div key={txn.id}>
                <div className="grid grid-cols-1 sm:grid-cols-[100px_1fr_100px_140px] gap-2 sm:gap-4 px-6 py-3 items-center">
                  <div className="text-sm text-ink-muted">
                    {formatDate(txn.transactionDate)}
                  </div>
                  <div className="text-sm text-ink min-w-0">
                    <span className="truncate block">{txn.description}</span>
                    {txn.reference && (
                      <span className="text-xs text-ink-muted">
                        Ref: {txn.reference}
                      </span>
                    )}
                  </div>
                  <div
                    className={`text-sm text-right tabular-nums font-medium ${
                      txn.amount >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {formatCurrency(txn.amount)}
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="secondary"
                      className="text-xs px-2 py-1"
                      onClick={() => {
                        setMatchingTxnId(
                          matchingTxnId === txn.id ? null : txn.id,
                        );
                        setSelectedJournalEntryId("");
                      }}
                    >
                      Match
                    </Button>
                    <Button
                      variant="ghost"
                      className="text-xs px-2 py-1"
                      onClick={() => handleExclude(txn.id)}
                      disabled={isPending}
                    >
                      Exclude
                    </Button>
                  </div>
                </div>

                {/* Matching panel */}
                {matchingTxnId === txn.id && (
                  <div className="px-6 pb-4">
                    <div className="rounded-[var(--radius-card)] border border-line bg-muted/20 p-4 space-y-4">
                      <h4 className="text-sm font-medium text-ink">
                        Match to Journal Entry
                      </h4>

                      {/* Suggested matches */}
                      {(() => {
                        const matches = findPotentialMatches(txn);
                        if (matches.length > 0) {
                          return (
                            <div className="space-y-2">
                              <p className="text-xs text-ink-muted">
                                Suggested matches (by amount):
                              </p>
                              <div className="space-y-1">
                                {matches.slice(0, 5).map((je) => (
                                  <button
                                    key={je.id}
                                    onClick={() =>
                                      setSelectedJournalEntryId(je.id)
                                    }
                                    className={`w-full text-left rounded-[var(--radius-card)] border px-3 py-2 text-sm transition-colors ${
                                      selectedJournalEntryId === je.id
                                        ? "border-turquoise bg-mint-soft"
                                        : "border-line hover:bg-muted/50"
                                    }`}
                                  >
                                    <span className="font-medium">
                                      {je.entryNumber}
                                    </span>
                                    <span className="mx-2 text-ink-muted">
                                      {formatDate(je.transactionDate)}
                                    </span>
                                    <span className="text-ink-muted">
                                      {je.description}
                                    </span>
                                    <span className="ml-2 tabular-nums text-ink">
                                      {formatCurrency(je.totalAmount)}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        }
                        return (
                          <p className="text-xs text-ink-muted">
                            No suggested matches found. Select a journal entry
                            manually below.
                          </p>
                        );
                      })()}

                      {/* Manual selection */}
                      <SelectField
                        label="Or select a journal entry"
                        name="journalEntryId"
                        value={selectedJournalEntryId}
                        onChange={(e) =>
                          setSelectedJournalEntryId(e.target.value)
                        }
                        options={[
                          { value: "", label: "Select..." },
                          ...journalEntries.map((je) => ({
                            value: je.id,
                            label: `${je.entryNumber} — ${formatDate(je.transactionDate)} — ${je.description} (${formatCurrency(je.totalAmount)})`,
                          })),
                        ]}
                      />

                      <div className="flex gap-3">
                        <Button
                          variant="primary"
                          disabled={!selectedJournalEntryId || isPending}
                          onClick={() => handleMatch(txn.id)}
                        >
                          {isPending ? "Matching..." : "Confirm Match"}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setMatchingTxnId(null);
                            setSelectedJournalEntryId("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
