import { notFound } from "next/navigation";
import { requireFinancialReadAccess } from "@/lib/auth/require-accountant-access";
import { getSchemeById } from "@/lib/queries/schemes";
import { getFundsForScheme } from "@/lib/queries/funds";
import { getLedgerIncomeExpenditure } from "@/lib/queries/reports";
import { PageHeader } from "@/components/ui/page-header";
import { IncomeExpenditureClient } from "@/app/(portal)/adviser/schemes/[id]/finance/reports/income-expenditure/income-expenditure-client";
import { connection } from "next/server";

export default async function AccountantIncomeExpenditurePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fund?: string; startDate?: string; endDate?: string }>;
}) {
  await connection();
  const { id } = await params;
  const { fund: fundFilter, startDate, endDate } = await searchParams;

  await requireFinancialReadAccess(id);

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const funds = await getFundsForScheme(id);

  const report = await getLedgerIncomeExpenditure(id, { fundId: fundFilter || null, startDate: startDate || null, endDate: endDate || null });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Income & Expenditure Statement"
        description={String(scheme.name)}
        backHref={`/accountant/schemes/${id}/finance/reports`}
        backLabel="Reports"
      />

      <IncomeExpenditureClient
        schemeId={id}
        funds={funds.map((f) => ({ id: f.id, name: String(f.name) }))}
        selectedFund={fundFilter ?? ""}
        startDate={startDate ?? ""}
        endDate={endDate ?? ""}
        incomeAccounts={report.incomeAccounts}
        expenseAccounts={report.expenseAccounts}
        totalIncome={report.totalIncome}
        totalExpenses={report.totalExpenses}
        netSurplus={report.netSurplus}
        basePath={`/accountant/schemes/${id}/finance/reports`}
      />
    </div>
  );
}
