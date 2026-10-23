import { notFound } from "next/navigation";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getFundsForScheme } from "@/lib/queries/funds";
import { getLedgerIncomeExpenditure } from "@/lib/queries/reports";
import { PageHeader } from "@/components/ui/page-header";
import { IncomeExpenditureClient } from "./income-expenditure-client";
import { connection } from "next/server";

export default async function IncomeExpenditurePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fund?: string; startDate?: string; endDate?: string }>;
}) {
  await connection();
  const { id } = await params;
  const { fund: fundFilter, startDate, endDate } = await searchParams;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const funds = await getFundsForScheme(id);

  const report = await getLedgerIncomeExpenditure(id, { fundId: fundFilter || null, startDate: startDate || null, endDate: endDate || null });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Income & Expenditure Statement"
        description={String(scheme.name)}
        backHref={`/adviser/schemes/${id}/finance/reports`}
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
      />
    </div>
  );
}
