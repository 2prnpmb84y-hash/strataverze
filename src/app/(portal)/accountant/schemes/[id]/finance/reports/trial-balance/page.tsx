import { notFound } from "next/navigation";
import { requireFinancialReadAccess } from "@/lib/auth/require-accountant-access";
import { getSchemeById } from "@/lib/queries/schemes";
import { getFundsForScheme } from "@/lib/queries/funds";
import { getTrialBalanceReport } from "@/lib/queries/reports";
import { PageHeader } from "@/components/ui/page-header";
import { TrialBalanceClient } from "@/app/(portal)/adviser/schemes/[id]/finance/reports/trial-balance/trial-balance-client";

export default async function AccountantTrialBalancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fund?: string; asAtDate?: string }>;
}) {
  const { id } = await params;
  const { fund: fundFilter, asAtDate } = await searchParams;

  await requireFinancialReadAccess(id);

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const funds = await getFundsForScheme(id);

  const reportDate = asAtDate || new Date().toISOString().split("T")[0];

  const report = await getTrialBalanceReport(
    id,
    reportDate,
    fundFilter || null,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trial Balance"
        description={String(scheme.name)}
        backHref={`/accountant/schemes/${id}/finance/reports`}
        backLabel="Reports"
      />

      <TrialBalanceClient
        schemeId={id}
        funds={funds.map((f) => ({ id: f.id, name: String(f.name) }))}
        selectedFund={fundFilter ?? ""}
        asAtDate={reportDate}
        lines={report.lines}
        totalDebits={report.totalDebits}
        totalCredits={report.totalCredits}
        isBalanced={report.isBalanced}
        basePath={`/accountant/schemes/${id}/finance/reports`}
      />
    </div>
  );
}
