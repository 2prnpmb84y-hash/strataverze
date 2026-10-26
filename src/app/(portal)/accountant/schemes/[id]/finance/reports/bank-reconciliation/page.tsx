import { notFound } from "next/navigation";
import { schemeToday } from "@/lib/jurisdiction/scheme-time";
import { requireFinancialReadAccess } from "@/lib/auth/require-accountant-access";
import { getSchemeById } from "@/lib/queries/schemes";
import { getBankAccountsForScheme } from "@/lib/queries/bank-accounts";
import { getBankReconciliationReport } from "@/lib/queries/reports";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { BankReconciliationClient } from "@/app/(portal)/adviser/schemes/[id]/finance/reports/bank-reconciliation/bank-reconciliation-client";
import { connection } from "next/server";

export default async function AccountantBankReconciliationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ account?: string; asAt?: string }>;
}) {
  await connection();
  const { id } = await params;
  const { account: selectedAccountId, asAt } = await searchParams;

  await requireFinancialReadAccess(id);

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const bankAccounts = await getBankAccountsForScheme(id);

  if (bankAccounts.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Bank Reconciliation Report"
          backHref={`/accountant/schemes/${id}/finance/reports`}
          backLabel="Reports"
        />
        <EmptyState
          title="No bank accounts"
          description="No bank accounts have been configured for this scheme."
        />
      </div>
    );
  }

  const asAtDate = asAt || (await schemeToday(id));

  // The selected account must be one of this scheme's accounts.
  const selectedAccount = selectedAccountId
    ? bankAccounts.find((ba) => ba.id === selectedAccountId)
    : null;
  if (selectedAccountId && !selectedAccount) notFound();

  let report: Awaited<ReturnType<typeof getBankReconciliationReport>> | null =
    null;
  if (selectedAccount) {
    report = await getBankReconciliationReport(
      selectedAccount.id,
      id,
      asAtDate,
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bank Reconciliation Report"
        description={String(scheme.name)}
        backHref={`/accountant/schemes/${id}/finance/reports`}
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
        basePath={`/accountant/schemes/${id}/finance/reports`}
      />
    </div>
  );
}
