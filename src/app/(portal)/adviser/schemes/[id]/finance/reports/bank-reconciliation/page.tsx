import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getBankAccountsForScheme } from "@/lib/queries/bank-accounts";
import { getBankReconciliationReport } from "@/lib/queries/reports";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { BankReconciliationClient } from "./bank-reconciliation-client";
import { connection } from "next/server";

export default async function BankReconciliationReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ account?: string; asAt?: string }>;
}) {
  await connection();
  const { id } = await params;
  const { account: selectedAccountId, asAt } = await searchParams;
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

  // Default as-at date to today
  const asAtDate = asAt || new Date().toISOString().slice(0, 10);

  // Generate the reconciliation report for the selected account
  let report: Awaited<ReturnType<typeof getBankReconciliationReport>> | null =
    null;
  if (selectedAccountId) {
    report = await getBankReconciliationReport(
      selectedAccountId,
      id,
      asAtDate,
    );
  }

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
        asAtDate={asAtDate}
        report={
          report
            ? {
                lastReconciledBalance: report.lastReconciledBalance,
                lastReconciledDate: report.lastReconciledDate,
                closingBankBalance: report.closingBankBalance,
                depositsInTransit: report.depositsInTransit,
                depositsInTransitTotal: report.depositsInTransitTotal,
                outstandingWithdrawals: report.outstandingWithdrawals,
                outstandingWithdrawalsTotal:
                  report.outstandingWithdrawalsTotal,
                adjustedBankBalance: report.adjustedBankBalance,
                bookBalance: report.bookBalance,
                discrepancy: report.discrepancy,
                totalTransactions: report.totalTransactions,
                reconciledCount: report.reconciledCount,
                matchedCount: report.matchedCount,
                unmatchedCount: report.unmatchedCount,
                excludedCount: report.excludedCount,
                totalReceipts: report.totalReceipts,
                totalPayments: report.totalPayments,
                unmatchedTransactions: report.unmatchedTransactions,
              }
            : null
        }
      />
    </div>
  );
}
