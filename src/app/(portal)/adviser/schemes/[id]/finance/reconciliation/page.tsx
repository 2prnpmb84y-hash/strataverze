import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getBankAccountsForScheme } from "@/lib/queries/bank-accounts";
import {
  getUnreconciledTransactions,
  getBankTransactionsForAccount,
} from "@/lib/queries/bank-transactions";
import { getUnmatchedJournalEntries } from "@/lib/queries/journal-entries";
import { ReconciliationView } from "./reconciliation-view";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";

export default async function ReconciliationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ account?: string }>;
}) {
  const { id } = await params;
  const { account: selectedAccountId } = await searchParams;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const bankAccounts = await getBankAccountsForScheme(id);

  if (bankAccounts.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Bank Reconciliation
          </h1>
        </div>
        <EmptyState
          title="No bank accounts"
          description="Add a bank account and import transactions before reconciling."
          actionLabel="Add Bank Account"
          actionHref={`/adviser/schemes/${id}/finance/bank-accounts/new`}
        />
      </div>
    );
  }

  // If a bank account is selected, load its data server-side
  let unreconciledTransactions: Awaited<
    ReturnType<typeof getUnreconciledTransactions>
  > = [];
  let unmatchedEntries: Awaited<
    ReturnType<typeof getUnmatchedJournalEntries>
  > = [];
  let reconciledCount = 0;
  let excludedCount = 0;
  let matchedCount = 0;

  if (selectedAccountId) {
    const [unreconciled, entries, allTxns] = await Promise.all([
      getUnreconciledTransactions(selectedAccountId),
      getUnmatchedJournalEntries(id),
      getBankTransactionsForAccount(selectedAccountId),
    ]);

    unreconciledTransactions = unreconciled;
    unmatchedEntries = entries;
    reconciledCount = allTxns.filter(
      (t) => String(t.reconciliationStatus) === "RECONCILED",
    ).length;
    excludedCount = allTxns.filter(
      (t) => String(t.reconciliationStatus) === "EXCLUDED",
    ).length;
    matchedCount = allTxns.filter(
      (t) => String(t.reconciliationStatus) === "MATCHED",
    ).length;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Bank Reconciliation
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Match imported bank transactions to journal entries to reconcile your
          accounts.
        </p>
      </div>

      {selectedAccountId && unreconciledTransactions.length + matchedCount + reconciledCount + excludedCount > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <StatCard
            label="Unmatched"
            value={String(unreconciledTransactions.length)}
            accent="bg-amber-500"
          />
          <StatCard
            label="Matched"
            value={String(matchedCount)}
            accent="bg-blue-500"
          />
          <StatCard
            label="Reconciled"
            value={String(reconciledCount)}
            accent="bg-green-500"
          />
          <StatCard
            label="Excluded"
            value={String(excludedCount)}
            accent="bg-zinc-400"
          />
        </div>
      )}

      <ReconciliationView
        schemeId={id}
        bankAccounts={bankAccounts.map((ba) => ({
          id: ba.id,
          accountName: String(ba.accountName),
          bsb: String(ba.bsb),
          accountNumber: String(ba.accountNumber),
        }))}
        selectedAccountId={selectedAccountId ?? ""}
        transactions={unreconciledTransactions.map((t) => ({
          id: t.id,
          transactionDate: String(t.transactionDate),
          amount: Number(t.amount),
          description: String(t.description),
          reference: t.reference ? String(t.reference) : null,
          balance: t.balance ? Number(t.balance) : null,
          reconciliationStatus: String(t.reconciliationStatus),
        }))}
        journalEntries={unmatchedEntries.map((je) => ({
          id: je.id,
          entryNumber: String(je.entryNumber),
          transactionDate: String(je.transactionDate),
          description: je.description ? String(je.description) : "",
          totalAmount: je.lines.reduce(
            (sum, l) => sum + Math.abs(Number(l.debit ?? 0)),
            0,
          ),
        }))}
      />
    </div>
  );
}
