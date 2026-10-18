import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getBankAccountsForScheme } from "@/lib/queries/bank-accounts";
import { getBankTransactionsForAccount } from "@/lib/queries/bank-transactions";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { BankReconciliationClient } from "./bank-reconciliation-client";

export default async function BankReconciliationReportPage({
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
        <PageHeader
          title="Bank Reconciliation Report"
          backHref={`/adviser/schemes/${id}/finance/reports`}
          backLabel="Reports"
        />
        <EmptyState
          title="No bank accounts"
          description="Add a bank account to generate a reconciliation report."
          actionLabel="Add Bank Account"
          actionHref={`/adviser/schemes/${id}/finance/bank-accounts/new`}
        />
      </div>
    );
  }

  // Load transactions for the selected account
  let transactions: Awaited<ReturnType<typeof getBankTransactionsForAccount>> =
    [];
  if (selectedAccountId) {
    transactions = await getBankTransactionsForAccount(selectedAccountId);
  }

  // Calculate reconciliation summary
  const reconciled = transactions.filter(
    (t) => String(t.reconciliationStatus) === "RECONCILED",
  );
  const matched = transactions.filter(
    (t) => String(t.reconciliationStatus) === "MATCHED",
  );
  const unmatched = transactions.filter(
    (t) => String(t.reconciliationStatus) === "UNMATCHED",
  );
  const excluded = transactions.filter(
    (t) => String(t.reconciliationStatus) === "EXCLUDED",
  );

  const receipts = transactions.filter((t) => Number(t.amount) > 0);
  const payments = transactions.filter((t) => Number(t.amount) < 0);

  const totalReceipts = receipts.reduce((s, t) => s + Number(t.amount), 0);
  const totalPayments = payments.reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

  // Get the selected account details
  const selectedAccount = selectedAccountId
    ? bankAccounts.find((ba) => ba.id === selectedAccountId)
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bank Reconciliation Report"
        description={String(scheme.name)}
        backHref={`/adviser/schemes/${id}/finance/reports`}
        backLabel="Reports"
      />

      <BankReconciliationClient
        schemeId={id}
        bankAccounts={bankAccounts.map((ba) => ({
          id: ba.id,
          accountName: String(ba.accountName),
          bsb: String(ba.bsb),
          accountNumber: String(ba.accountNumber),
        }))}
        selectedAccountId={selectedAccountId ?? ""}
        selectedAccountName={
          selectedAccount ? String(selectedAccount.accountName) : ""
        }
        summary={{
          totalTransactions: transactions.length,
          reconciledCount: reconciled.length,
          matchedCount: matched.length,
          unmatchedCount: unmatched.length,
          excludedCount: excluded.length,
          totalReceipts,
          totalPayments,
        }}
        unmatchedTransactions={unmatched.map((t) => ({
          id: t.id,
          transactionDate: String(t.transactionDate),
          amount: Number(t.amount),
          description: String(t.description),
          reference: t.reference ? String(t.reference) : null,
        }))}
      />
    </div>
  );
}
